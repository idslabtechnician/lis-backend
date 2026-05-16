const Reservation = require("../models/Reservation");
const Item = require("../models/Item");

// @desc    Get all reservations grouped into tickets for dashboard
// @route   GET /api/requests
// @access  Private (Lab Manager/Admin)
const getGroupedRequests = async (req, res) => {
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

    // Now fetch remaining 'submitted' and 'pending_confirmation' requests
    const reservations = await Reservation.find({
      status: { $in: ["submitted", "pending_confirmation"] },
    }).populate("items.item", "name category");

    const groupedRequests = reservations.map((resv) => ({
      id: resv._id,
      studentName: resv.studentInfo.name,
      studentIdNumber: resv.studentInfo.studentId,
      googleAccount: resv.studentInfo.email,
      section: resv.studentInfo.section,
      year: resv.studentInfo.yearLevel,
      labSessionType: resv.studentInfo.labSessionType || "Chemistry",
      purpose: resv.studentInfo.purpose || "General Use",
      date: new Date(resv.startTime).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      time: `${new Date(resv.startTime).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: false })} - ${new Date(resv.endTime).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: false })}`,
      status: resv.status,
      requestedItems: resv.items.map((i) => ({
        requestId: resv._id, // For backward compat with frontend checklist
        itemId: i.item?._id,
        name: i.item?.name || "Unknown Item",
        quantity: i.quantity,
        type: i.item?.category,
      })),
    }));

    res.status(200).json(groupedRequests);
  } catch (error) {
    console.error("Fetch grouped reservations error:", error);
    res.status(500).json({ message: "Server error fetching reservations" });
  }
};

const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const escapeHtml = require("../utils/escapeHtml");

// @desc    Verify specific items in a student's request ticket (2-step Gmail flow)
// @route   PUT /api/requests/verify
// @access  Private (Lab Manager/Admin)
const verifyRequests = async (req, res) => {
  try {
    const { requestIds, reservationId, updatedItems } = req.body; // Array of Reservation ObjectIds

    if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({
        message: "Please provide an array of reservation IDs to verify.",
      });
    }

    // Since our tickets are 1:1 with Reservations now, we take the unique IDs
    const uniqueIds = [...new Set(requestIds)];

    const failedEmails = [];
    let successCount = 0;
    let lastError = "";

    for (const resvId of uniqueIds) {
      const resv = await Reservation.findById(resvId);
      // Allow verification of 'submitted' (new) or 'pending_confirmation' (allow resending email)
      if (!resv || !["submitted", "pending_confirmation"].includes(resv.status))
        continue;

      console.log(
        `[VERIFY] Reservation ${resvId} found. Status: ${resv.status}. Updating...`,
      );

      // Update items if provided
      if (
        reservationId &&
        resvId.toString() === reservationId &&
        updatedItems &&
        Array.isArray(updatedItems)
      ) {
        resv.items = updatedItems.map((ui) => ({
          item: ui.itemId,
          quantity: ui.quantity,
        }));
      }

      // Generate verification token
      const token = crypto.randomBytes(20).toString("hex");

      resv.status = "pending_confirmation";
      resv.verificationToken = token;
      resv.verifiedAt = Date.now();
      resv.technicianId = req.user._id;

      await resv.save();
      console.log(`[VERIFY] Database updated for ${resvId}`);

      // Populate items to get their names for the email
      await resv.populate("items.item");

      const itemsListHtml =
        resv.items && resv.items.length > 0
          ? `<ul>${resv.items.map((i) => `<li><strong>${i.quantity}x</strong> ${escapeHtml(i.item?.name || "Unknown Item")}</li>`).join("")}</ul>`
          : `<p><em>No equipment requested (Lab Use Only)</em></p>`;

      // Send Email to Student
      const confirmUrl = `${req.protocol}://${req.get("host")}/api/reservations/confirm/${token}`;
      const cancelUrl = `${req.protocol}://${req.get("host")}/api/reservations/cancel/${token}`;
      console.log(`[VERIFY] Confirm URL generated: ${confirmUrl}`);

      const message = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-top: 10px solid #a51d21;">
          <h2 style="color: #a51d21;">Confirm Your Lab Reservation</h2>
          <p>Hello <strong>${escapeHtml(resv.studentInfo.name)}</strong>,</p>
          <p>Your laboratory reservation request has been verified by the IDS Technician. You are approved to borrow the following items:</p>
          ${itemsListHtml}
          <p>To secure your slot, please click "Confirm Reservation" below. If you no longer need this reservation, please click "Cancel Reservation".</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${confirmUrl}" style="background-color: #f1c40f; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin: 5px;">Confirm Reservation</a>
            <a href="${cancelUrl}" style="background-color: #a51d21; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin: 5px;">Cancel Reservation</a>
          </div>
          <p style="color: #666; font-size: 14px;">This link will expire in <b>12 hours</b>. If you do not respond within this window, your request will be released.</p>
          <p style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; font-size: 12px; color: #888;">IDS Laboratory System &bull; Automatic Notification</p>
        </div>
      `;
      console.log(`[VERIFY] Email template built. Calling sendEmail...`);

      try {
        await sendEmail({
          email: resv.studentInfo.email,
          subject: "Verified: Confirm your Lab Reservation",
          html: message,
        });
        successCount++;
      } catch (err) {
        lastError = err.message || "Email error";
        console.error(
          `[VERIFY] Email failed for ${resv.studentInfo.email}:`,
          err,
        );
        failedEmails.push(resv.studentInfo.email);
      }
    }

    if (successCount === 0 && failedEmails.length > 0) {
      return res.status(500).json({
        success: false,
        error: `Brevo error: ${lastError}. Check your BREVO_API_KEY on Render.`,
        failedEmails,
      });
    }

    res.status(200).json({
      success: true,
      message:
        failedEmails.length > 0
          ? `Verification emails sent to ${successCount} student(s). Failed for: ${failedEmails.map((f) => f.email).join(", ")}`
          : `Verification emails sent to ${successCount} student(s).`,
      modifiedCount: successCount,
    });
  } catch (error) {
    console.error("Verification error details:", error);
    // Return 'error' instead of 'message' so the frontend fetchApi can display it
    res.status(500).json({
      success: false,
      error: error.message || "Server error verifying requests",
    });
  }
};

// @desc    Get borrow logs (approved, returned, rejected requests)
// @route   GET /api/requests/logs
// @access  Private (Lab Manager/Admin)
const getLogs = async (req, res) => {
  try {
    // Show everything that is NOT new (submitted) or pending confirmation
    const logs = await Reservation.find({
      status: {
        $in: [
          "accepted",
          "borrowed",
          "returned",
          "denied",
          "expired",
          "damaged",
        ],
      },
    })
      .populate("items.item", "name category type unit")
      .sort({ updatedAt: -1 })
      .lean();

    // Map to a cleaner format for the dashboard table
    const formattedLogs = logs.map((log) => ({
      id: log._id,
      student: {
        name: log.studentInfo?.name || "Unknown",
        idNumber: log.studentInfo?.studentId || "N/A",
        section: log.studentInfo?.section || "N/A",
      },
      googleAccount: log.studentInfo?.email || "",
      purpose: log.studentInfo?.purpose || "General Use",
      status: log.status,
      updatedAt: log.updatedAt,
      items: (log.items || []).map((i) => ({
        itemId: i.item?._id,
        name: i.item?.name || "Deleted Item",
        quantity: i.quantity,
        type: i.item?.type || i.item?.category,
        unit: i.item?.unit || "pcs",
      })),
    }));

    res.status(200).json(formattedLogs);
  } catch (error) {
    console.error("Fetch logs error:", error);
    res.status(500).json({ message: "Server error fetching logs" });
  }
};

// @desc    Return a borrowed reservation
// @route   PUT /api/requests/:id/return
// @access  Private (Lab Manager/Admin)
const returnRequest = async (req, res) => {
  try {
    const {
      status,
      description,
      cost,
      studentName,
      studentId,
      section,
      damagedItemIds,
      damagedItemQuantities,
      damageEmail,
    } = req.body;
    const reservation = await Reservation.findById(req.params.id).populate(
      "items.item",
    );

    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }
    if (["returned", "damaged"].includes(reservation.status)) {
      return res.status(400).json({
        message: `Reservation is already marked as ${reservation.status}`,
      });
    }

    const newStatus = status === "damaged" ? "damaged" : "returned";
    reservation.status = newStatus;
    await reservation.save();

    // Loop through items and restore inventory
    for (const entry of reservation.items) {
      const item = entry.item;
      if (!item) continue;

      if (item.type === "Equipment") {
        let isDamagedItem = false;
        let damagedQty = 0;
        if (
          newStatus === "damaged" &&
          damagedItemIds &&
          damagedItemIds.includes(item._id.toString())
        ) {
          isDamagedItem = true;
          damagedQty =
            (damagedItemQuantities &&
              damagedItemQuantities[item._id.toString()]) ||
            entry.quantity;
        }

        if (
          newStatus === "returned" ||
          (newStatus === "damaged" && !isDamagedItem)
        ) {
          item.availableQuantity += entry.quantity;
          // Update status based on quantity
          if (item.availableQuantity >= 5) item.status = "Available";
          else if (item.availableQuantity > 0) item.status = "Low Stock";

          await item.save();
        } else if (isDamagedItem) {
          // Add undamaged ones back to inventory
          const undamagedQty = entry.quantity - damagedQty;
          if (undamagedQty > 0) {
            item.availableQuantity += undamagedQty;
            if (item.availableQuantity >= 5) item.status = "Available";
            else if (item.availableQuantity > 0) item.status = "Low Stock";
            await item.save();
          }

          const DamageReport = require("../models/DamageReport");
          const User = require("../models/User");

          // Try to find a formal user record by studentId
          const formalUser = await User.findOne({
            idNumber: reservation.studentInfo.studentId,
          });

          await DamageReport.create({
            item: item._id,
            quantity: damagedQty,
            liableUser: formalUser ? formalUser._id : undefined,
            customStudentName: studentName || reservation.studentInfo.name,
            customStudentId: studentId || reservation.studentInfo.studentId,
            customSection: section || reservation.studentInfo.section,
            issuedBy: req.user._id,
            description: description || "Reported damaged during return.",
            cost: cost || 0,
          });
        }
      }
    }

    if (newStatus === "damaged" && damageEmail) {
      // Send email to the student
      const damageItemsList = reservation.items
        .filter(
          (entry) =>
            entry.item &&
            damagedItemIds &&
            damagedItemIds.includes(entry.item._id.toString()),
        )
        .map((entry) => {
          const dQty =
            (damagedItemQuantities &&
              damagedItemQuantities[entry.item._id.toString()]) ||
            entry.quantity;
          return `${dQty}x ${entry.item.name}`;
        })
        .join(", ");

      const message = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-top: 10px solid #a51d21;">
          <h2 style="color: #a51d21;">Notice of Damaged Laboratory Equipment</h2>
          <p>Hello <strong>${escapeHtml(studentName || reservation.studentInfo.name)}</strong>,</p>
          <p>This email is to notify you that the following equipment you borrowed has been reported as damaged:</p>
          <ul>
            <li><strong>${escapeHtml(damageItemsList)}</strong></li>
          </ul>
          <p><strong>Section:</strong> ${escapeHtml(section || reservation.studentInfo.section)}</p>
          <p>You have a liability for the damaged equipment. Please come to the laboratory technician for further details.</p>
          <p>If this message is not true or you believe this is an error, please come to the laboratory to clear your name.</p>
          <p style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; font-size: 12px; color: #888;">IDS Laboratory System &bull; Automatic Notification</p>
        </div>
      `;
      try {
        await sendEmail({
          email: damageEmail,
          subject: "Notice: Damaged Laboratory Equipment",
          html: message,
        });
      } catch (emailErr) {
        console.error("Failed to send damage email:", emailErr);
      }
    }

    res.status(200).json({
      message: `Items marked as ${newStatus} successfully`,
      data: reservation,
    });
  } catch (error) {
    console.error("Return error:", error);
    res.status(500).json({ message: "Server error returning items" });
  }
};

// @desc    Borrow/Release items for an accepted reservation
// @route   PUT /api/requests/:id/borrow
// @access  Private (Lab Manager/Admin)
const borrowRequest = async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id).populate(
      "items.item",
    );

    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    if (reservation.status !== "accepted") {
      return res.status(400).json({
        message: `Only accepted (confirmed) reservations can be borrowed. Current status: ${reservation.status}`,
      });
    }

    // Check if the reservation contains ANY equipment that needs to be returned
    const hasEquipment = reservation.items.some(
      (entry) => entry.item && entry.item.type === "Equipment",
    );

    // Keep all reservations as "borrowed" (active session) until manually returned,
    // even if it consists entirely of single-use items.
    reservation.status = "borrowed";
    await reservation.save();

    // For consumables and bulk, also decrement totalQuantity when borrowed (officially issued)
    for (const entry of reservation.items) {
      const item = entry.item;
      if (item && (item.type === "Consumable" || item.type === "Bulk")) {
        item.totalQuantity = Math.max(0, item.totalQuantity - entry.quantity);
        await item.save();
      }
    }

    const message = hasEquipment
      ? "Items released to student successfully"
      : "Consumable items issued and archived automatically";

    res.status(200).json({ message, data: reservation });
  } catch (error) {
    console.error("Borrow error:", error);
    res.status(500).json({ message: "Server error during borrowing process" });
  }
};

module.exports = {
  getGroupedRequests,
  verifyRequests,
  getLogs,
  returnRequest,
  borrowRequest,
};
