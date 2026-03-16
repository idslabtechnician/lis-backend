const mongoose = require("mongoose");

const damageReportSchema = new mongoose.Schema({
  item: {
    type: mongoose.Schema.ObjectId,
    ref: "Item",
    required: true,
  },
  liableUser: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
  },
  customStudentName: {
    type: String,
  },
  customStudentId: {
    type: String,
  },
  customSection: {
    type: String,
  },
  orderRef: {
    type: mongoose.Schema.ObjectId,
    ref: "Order",
  },
  issuedBy: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
  },
  description: {
    type: String,
    required: [true, "Please provide a description of the damage"],
    maxlength: 500,
  },
  cost: {
    type: Number,
    required: [true, "Please provide the replacement or repair cost"],
    min: 0,
  },
  status: {
    type: String,
    enum: ["Unresolved", "Paid", "Cleared"],
    default: "Unresolved",
  },
  reportDate: {
    type: Date,
    default: Date.now,
  },
  resolvedDate: {
    type: Date,
  },
});

module.exports = mongoose.model("DamageReport", damageReportSchema);
