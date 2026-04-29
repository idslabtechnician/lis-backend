const mongoose = require("mongoose");

const ReservationSchema = new mongoose.Schema(
  {
    studentInfo: {
      name: { type: String, required: true },
      studentId: { type: String, required: true },
      email: { type: String, required: true },
      section: { type: String, required: true },
      yearLevel: { type: String, required: true },
      labSessionType: { type: String, enum: ['Chemistry', 'Physics'], required: true, default: 'Chemistry' },
      purpose: { type: String, default: "General Use" },
    },
    items: [
      {
        item: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Item",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
      },
    ],
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "submitted",
        "pending_confirmation",
        "accepted",
        "borrowed",
        "returned",
        "denied",
        "expired",
        "damaged",
      ],
      default: "submitted",
    },
    verificationToken: String,
    verifiedAt: Date,
    confirmedAt: Date,
    technicianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Reservation", ReservationSchema);
