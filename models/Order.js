const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
  },
  item: {
    type: mongoose.Schema.ObjectId,
    ref: "Item",
    required: true,
  },
  quantity: {
    type: Number,
    required: [true, "Please add the quantity to borrow"],
    min: 1,
  },
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected", "Returned", "Overdue"],
    default: "Pending",
  },
  borrowDate: {
    type: Date,
    default: Date.now,
  },
  expectedReturnDate: {
    type: Date,
    required: [true, "Please add an expected return date"],
  },
  actualReturnDate: {
    type: Date,
  },
  notes: {
    type: String,
    maxlength: 200,
  },
});

module.exports = mongoose.model("Order", orderSchema);
