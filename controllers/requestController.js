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
          { status: "pending_confirmation", verifiedAt: { $lt: twelveHoursAgo } },
          { status: { $in: ["submitted", "pending_confirmation"] }, startTime: { $lt: now } }
        ]
      },
      { status: "expired" }
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
      purpose: resv.studentInfo.purpose || "General Use",
      date: new Date(resv.startTime).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      time: `${new Date(resv.startTime).toLocaleTimeString("en-GB", { hour: 'numeric', minute: '2-digit', hour12: false })} - ${new Date(resv.endTime).toLocaleTimeString("en-GB", { hour: 'numeric', minute: '2-digit', hour12: false })}`,
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
    const { requestIds } = req.body; // Array of Reservation ObjectIds

    if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({
        message: "Please provide an array of reservation IDs to verify.",
      });
    }

    // Since our tickets are 1:1 with Reservations now, we take the unique IDs
    const uniqueIds = [...new Set(requestIds)];

    const failedEmails = [];
    let successCount = 0;

    for (const resvId of uniqueIds) {
      const resv = await Reservation.findById(resvId);
      // Allow verification of 'submitted' (new) or 'pending_confirmation' (allow resending email)
      if (!resv || !["submitted", "pending_confirmation"].includes(resv.status)) continue;

      // Generate verification token
      const token = crypto.randomBytes(20).toString("hex");

      resv.status = "pending_confirmation";
      resv.verificationToken = token;
      resv.verifiedAt = Date.now();
      resv.technicianId = req.user._id;

      await resv.save();

      // Send Email to Student
      const confirmUrl = `${req.protocol}://${req.get("host")}/api/reservations/confirm/${token}`;

      const message = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-top: 10px solid #a51d21;">
          <h2 style="color: #a51d21;">Confirm Your Lab Reservation</h2>
          <p>Hello <strong>${escapeHtml(resv.studentInfo.name)}</strong>,</p>
          <p>Your laboratory reservation request has been verified by the IDS Technician. To secure your slot, please click the button below to confirm your attendance:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${confirmUrl}" style="background-color: #a51d21; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Confirm Reservation</a>
          </div>
          <p style="color: #666; font-size: 14px;">This link will expire in <b>12 hours</b>. If you do not confirm within this window, your request will be released.</p>
          <p style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; font-size: 12px; color: #888;">IDS Laboratory System &bull; Automatic Notification</p>
        </div>
      `;

      try {
        await sendEmail({
          email: resv.studentInfo.email,
          subject: "Verified: Confirm your Lab Reservation",
          html: message,
        });
        successCount++;
      } catch (err) {
        console.error(`Email failed for ${resv.studentInfo.email}:`, err);
        failedEmails.push(resv.studentInfo.email);
      }
    }

    if (successCount === 0 && failedEmails.length > 0) {
      return res.status(500).json({
        message: "Failed to send verification emails. Please check SMTP configuration.",
        failedEmails,
      });
    }

    res.status(200).json({
      success: true,
      message: failedEmails.length > 0 
        ? `Verification emails sent to ${successCount} student(s). Failed for: ${failedEmails.join(", ")}`
        : `Verification emails sent to ${successCount} student(s).`,
      modifiedCount: successCount,
    });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ message: "Server error verifying requests" });
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
      purpose: log.studentInfo?.purpose || "General Use",
      status: log.status,
      updatedAt: log.updatedAt,
      items: (log.items || []).map((i) => ({
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
    const { status, description, cost, studentName, studentId, section } =
      req.body;
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
        if (newStatus === "returned") {
          item.availableQuantity += entry.quantity;
          // Update status based on quantity
          if (item.availableQuantity >= 5) item.status = "Available";
          else if (item.availableQuantity > 0) item.status = "Low Stock";

          await item.save();
        } else if (newStatus === "damaged") {
          const DamageReport = require("../models/DamageReport");
          const User = require("../models/User");

          // Try to find a formal user record by studentId
          const formalUser = await User.findOne({
            idNumber: reservation.studentInfo.studentId,
          });

          await DamageReport.create({
            item: item._id,
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
