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
    const reservations = await Reservation.find({ status: { $in: ["accepted", "borrowed"] } })
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
      !studentInfo?.yearLevel
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
      return res
        .status(400)
        .json({
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
        return res
          .status(404)
          .json({
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
      // We don't necessarily fail the whole request, but log it
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

    if (!reservation) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid or expired token" });
    }

    // Check 12h timeout
    const twelveHours = 12 * 60 * 60 * 1000;
    if (Date.now() - reservation.verifiedAt > twelveHours) {
      reservation.status = "expired";
      await reservation.save();
      return res
        .status(400)
        .json({
          success: false,
          error: "12-hour confirmation window has expired",
        });
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

    res.status(200).json({
      success: true,
      message: "Reservation confirmed and items are on hold for you!",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Technician Deny Request
// @route   PUT /api/reservations/:id/deny
// @access  Private (LabManager)
exports.denyReservation = async (req, res) => {
  try {
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
