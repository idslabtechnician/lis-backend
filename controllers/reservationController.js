const Reservation = require("../models/Reservation");
const Item = require("../models/Item");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const escapeHtml = require("../utils/escapeHtml");

// @desc    Get accepted reservations for public calendar
// @route   GET /api/reservations
// @access  Public
exports.getReservations = async (req, res) => {
  try {
    const reservations = await Reservation.find({
      status: { $in: ["accepted", "borrowed"] },
    })
      .populate("items.item", "name type")
      .sort("-startTime");

    res.status(200).json({
      success: true,
      count: reservations.length,
      data: reservations,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Get all reservations for admin verification
// @route   GET /api/reservations/admin
// @access  Private (LabManager)
exports.getAdminReservations = async (req, res) => {
  try {
    // On-demand cleanup:
    // 1. Expire any reservations that passed 12h confirm window
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const now = new Date();

    await Reservation.updateMany(
      {
        $or: [
          {
            status: "pending_confirmation",
            verifiedAt: { $lt: twelveHoursAgo },
          },
          {
            status: { $in: ["submitted", "pending_confirmation"] },
            startTime: { $lt: now },
          },
        ],
      },
      { status: "expired" },
    );

    const reservations = await Reservation.find({})
      .populate("items.item", "name type category")
      .sort("-createdAt");

    res.status(200).json({
      success: true,
      count: reservations.length,
      data: reservations,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Create a new reservation (from Student App)
// @route   POST /api/reservations
// @access  Public (or Student)
exports.createReservation = async (req, res) => {
  try {
    const { studentInfo, items, startTime, endTime } = req.body;

    // ── Input Validation ──────────────────────────────────────────────
    if (
      !studentInfo?.name ||
      !studentInfo?.studentId ||
      !studentInfo?.email ||
      !studentInfo?.section ||
      !studentInfo?.yearLevel ||
      !studentInfo?.labSessionType
    ) {
      return res.status(400).json({
        success: false,
        error: "Missing required student information fields.",
      });
    }

    // Validate email format
    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(studentInfo.email)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid email format." });
    }

    // Validate items (allow empty array for laboratory-only bookings)
    if (!items || !Array.isArray(items)) {
      return res
        .status(400)
        .json({ success: false, error: "Items field must be an array." });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: "Start time and end time are required.",
      });
    }

    const reqStartTime = new Date(startTime);
    const reqEndTime = new Date(endTime);

    if (reqStartTime >= reqEndTime) {
      return res
        .status(400)
        .json({ success: false, error: "Start time must be before end time." });
    }

    for (const entry of items) {
      const itemDoc = await Item.findById(entry.item);
      if (!itemDoc) {
        return res.status(404).json({
          success: false,
          error: `Item not found for ID: ${entry.item}`,
        });
      }

      if (itemDoc.type !== "Equipment") {
        if (itemDoc.availableQuantity < entry.quantity) {
          return res.status(400).json({
            success: false,
            error: `Not enough stock available for ${itemDoc.name}.`,
          });
        }
      } else {
        const activeReservations = await Reservation.find({
          status: { $in: ["accepted", "borrowed"] },
          "items.item": itemDoc._id,
        });

        let baseIntact = itemDoc.availableQuantity;
        activeReservations.forEach((r) => {
          const rItem = r.items.find(
            (i) => i.item.toString() === itemDoc._id.toString(),
          );
          if (rItem) baseIntact += rItem.quantity;
        });

        const overlappingReservations = await Reservation.find({
          status: {
            $in: ["submitted", "pending_confirmation", "accepted", "borrowed"],
          },
          "items.item": itemDoc._id,
          startTime: { $lt: reqEndTime },
          endTime: { $gt: reqStartTime },
        });

        let overlapCount = 0;
        overlappingReservations.forEach((r) => {
          const rItem = r.items.find(
            (i) => i.item.toString() === itemDoc._id.toString(),
          );
          if (rItem) overlapCount += rItem.quantity;
        });

        const effectiveAvailable = baseIntact - overlapCount;
        if (effectiveAvailable < entry.quantity) {
          return res.status(400).json({
            success: false,
            error: `Not enough availability for ${itemDoc.name} on the selected time.`,
          });
        }
      }
    }

    // ── Whitelisted creation (no mass assignment) ─────────────────────
    const reservation = await Reservation.create({
      studentInfo: {
        name: studentInfo.name,
        studentId: studentInfo.studentId,
        email: studentInfo.email,
        section: studentInfo.section,
        yearLevel: studentInfo.yearLevel,
        labSessionType: studentInfo.labSessionType,
        purpose: studentInfo.purpose || "General Use",
      },
      items: items.map((i) => ({ item: i.item, quantity: i.quantity })),
      startTime: new Date(startTime),
      endTime: new Date(endTime),
    });

    res.status(201).json({
      success: true,
      data: reservation,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Technician Verify (Sent Gmail)
// @route   PUT /api/reservations/:id/verify
// @access  Private (LabManager)
exports.verifyReservation = async (req, res) => {
  try {
    let reservation = await Reservation.findById(req.params.id);

    if (!reservation) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    // Allow re-verification if it's already pending (resend email)
    if (!["submitted", "pending_confirmation"].includes(reservation.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot verify reservation with status: ${reservation.status}`,
      });
    }

    // Generate verification token
    const token = crypto.randomBytes(20).toString("hex");

    reservation.status = "pending_confirmation";
    reservation.verificationToken = token;
    reservation.verifiedAt = Date.now();
    reservation.technicianId = req.user.id;

    await reservation.save();

    // Send Email to Student
    const confirmUrl = `${req.protocol}://${req.get("host")}/api/reservations/confirm/${token}`;

    const message = `
      <h1>Action Required: Confirm Your Lab Reservation</h1>
      <p>Hello ${escapeHtml(reservation.studentInfo.name)},</p>
      <p>Your lab reservation request has been verified by our technician. To finalize your slot, please confirm your attendance by clicking the link below within <b>12 hours</b>.</p>
      <a href="${confirmUrl}" style="padding: 10px 20px; background-color: #a51d21; color: white; text-decoration: none; border-radius: 5px; display: inline-block;">Confirm Reservation</a>
      <p>If you do not confirm within 12 hours, your request will be automatically denied.</p>
    `;

    try {
      await sendEmail({
        email: reservation.studentInfo.email,
        subject: "Confirm your Lab Reservation",
        html: message,
      });
    } catch (err) {
      console.error("Email failed to send", err);
      return res.status(500).json({
        success: false,
        error:
          "Failed to send verification email. Please check SMTP configuration.",
      });
    }

    res.status(200).json({
      success: true,
      data: reservation,
      message: "Verification email sent. Student has 12 hours to confirm.",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Student Confirm Attendance
// @route   GET /api/reservations/confirm/:token
// @access  Public
exports.confirmReservation = async (req, res) => {
  try {
    const reservation = await Reservation.findOne({
      verificationToken: req.params.token,
      status: "pending_confirmation",
    }).populate("items.item");

    const errorHtml = (title, message) => `
      <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
      <style>body{font-family:system-ui,sans-serif;background:#f8f9fa;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}
      .box{background:#fff;padding:40px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);text-align:center;max-width:400px;}
      h1{color:#ef4444;margin-bottom:10px;font-size:24px;}p{color:#64748b;line-height:1.5;}</style></head>
      <body><div class="box"><h1>${title}</h1><p>${message}</p></div></body></html>
    `;

    const successHtml = `
      <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Confirmed</title>
      <style>body{font-family:system-ui,sans-serif;background:#f8f9fa;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}
      .box{background:#fff;padding:40px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);text-align:center;max-width:400px;}
      h1{color:#10b981;margin-bottom:10px;font-size:24px;}p{color:#64748b;line-height:1.5;}</style></head>
      <body><div class="box"><h1>Reservation Confirmed!</h1><p>Your items have been successfully placed on hold. Please proceed to the laboratory at your reserved time.</p></div></body></html>
    `;

    if (!reservation) {
      return res
        .status(400)
        .send(
          errorHtml(
            "Link Invalid",
            "This confirmation link is no longer valid or has already been used.",
          ),
        );
    }

    // Check 12h timeout
    const twelveHours = 12 * 60 * 60 * 1000;
    if (Date.now() - reservation.verifiedAt > twelveHours) {
      reservation.status = "expired";
      await reservation.save();
      return res
        .status(400)
        .send(
          errorHtml(
            "Link Expired",
            "The 12-hour confirmation window has expired. Your request was cancelled.",
          ),
        );
    }

    reservation.status = "accepted";
    reservation.verificationToken = undefined;
    reservation.confirmedAt = Date.now();

    await reservation.save();

    // Loop through items and decrement availability (Reservation holds the items)
    for (const entry of reservation.items) {
      const item = entry.item;
      if (!item) continue;

      // Decrement available quantity (never below 0)
      item.availableQuantity = Math.max(
        0,
        item.availableQuantity - entry.quantity,
      );

      // Update status based on quantity
      if (item.availableQuantity === 0) item.status = "Out of Stock";
      else if (item.availableQuantity < 5) item.status = "Low Stock";
      else item.status = "Available";

      await item.save();
    }

    res.status(200).send(successHtml);
  } catch (err) {
    res
      .status(500)
      .send(
        `<html><body><h2>Server Error</h2><p>${err.message}</p></body></html>`,
      );
  }
};

// @desc    Student Cancel/Deny Attendance
// @route   GET /api/reservations/cancel/:token
// @access  Public
exports.cancelReservation = async (req, res) => {
  try {
    const reservation = await Reservation.findOne({
      verificationToken: req.params.token,
      status: "pending_confirmation",
    });

    const errorHtml = (title, message) => `
      <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
      <style>body{font-family:system-ui,sans-serif;background:#f8f9fa;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}
      .box{background:#fff;padding:40px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);text-align:center;max-width:400px;}
      h1{color:#ef4444;margin-bottom:10px;font-size:24px;}p{color:#64748b;line-height:1.5;}</style></head>
      <body><div class="box"><h1>${title}</h1><p>${message}</p></div></body></html>
    `;

    const successHtml = `
      <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Cancelled</title>
      <style>body{font-family:system-ui,sans-serif;background:#f8f9fa;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}
      .box{background:#fff;padding:40px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);text-align:center;max-width:400px;}
      h1{color:#e74c3c;margin-bottom:10px;font-size:24px;}p{color:#64748b;line-height:1.5;}</style></head>
      <body><div class="box"><h1>Reservation Cancelled</h1><p>You have successfully cancelled your reservation request. No items have been held for you.</p></div></body></html>
    `;

    if (!reservation) {
      return res
        .status(400)
        .send(
          errorHtml(
            "Link Invalid",
            "This cancellation link is no longer valid or has already been used.",
          ),
        );
    }

    reservation.status = "denied";
    reservation.verificationToken = undefined;

    await reservation.save();

    res.status(200).send(successHtml);
  } catch (err) {
    res
      .status(500)
      .send(
        `<html><body><h2>Server Error</h2><p>${err.message}</p></body></html>`,
      );
  }
};

// @desc    Technician Deny Request
// @route   PUT /api/reservations/:id/deny
// @access  Private (LabManager)
exports.denyReservation = async (req, res) => {
  try {
    const { reason } = req.body || {};
    const reservation = await Reservation.findById(req.params.id).populate(
      "items.item",
    );
    if (!reservation) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    const oldStatus = reservation.status;
    reservation.status = "denied";
    await reservation.save();

    // If it was already accepted/borrowed, we need to restore the items to inventory
    if (["accepted", "borrowed"].includes(oldStatus)) {
      for (const entry of reservation.items) {
        const item = entry.item;
        if (!item) continue;

        // Restore available quantity for both
        item.availableQuantity += entry.quantity;

        // If it was already borrowed AND it's a consumable or bulk, we also need to restore totalQuantity
        // because we decremented totalQuantity in borrowRequest for these types
        if (
          oldStatus === "borrowed" &&
          (item.type === "Consumable" || item.type === "Bulk")
        ) {
          item.totalQuantity += entry.quantity;
        }

        if (item.availableQuantity >= 5) item.status = "Available";
        else if (item.availableQuantity > 0) item.status = "Low Stock";

        await item.save();
      }
    }

    // Send email to the student with the reason
    if (reservation.studentInfo && reservation.studentInfo.email) {
      const denyReason = reason || "No specific reason provided.";
      const message = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-top: 10px solid #e74c3c;">
          <h2 style="color: #e74c3c;">Laboratory Reservation Denied</h2>
          <p>Hello <strong>${escapeHtml(reservation.studentInfo.name)}</strong>,</p>
          <p>We regret to inform you that your laboratory reservation request has been denied by the technician.</p>
          <div style="background-color: #fdf2f2; padding: 15px; border-left: 4px solid #e74c3c; margin: 20px 0;">
            <strong>Reason for denial:</strong><br/>
            ${escapeHtml(denyReason)}
          </div>
          <p>If you have any questions or concerns, please visit the laboratory.</p>
          <p style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; font-size: 12px; color: #888;">IDS Laboratory System &bull; Automatic Notification</p>
        </div>
      `;
      try {
        await sendEmail({
          email: reservation.studentInfo.email,
          subject: "Notice: Laboratory Reservation Denied",
          html: message,
        });
      } catch (emailErr) {
        console.error("Failed to send denial email:", emailErr);
      }
    }

    res.status(200).json({
      success: true,
      data: reservation,
      message:
        "Reservation request denied and items restored to inventory if applicable.",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
