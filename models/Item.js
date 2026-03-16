const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please add an item name"],
    trim: true,
    maxlength: [100, "Name cannot be more than 100 characters"],
  },
  category: {
    type: String,
    required: [
      true,
      "Please add a category (e.g., Electronics, Glassware, Chemicals)",
    ],
    enum: ["Electronics", "Glassware", "Chemicals", "Hardware", "Other"],
  },
  type: {
    type: String,
    required: [true, "Please specify if the item is Equipment or Consumable"],
    enum: ["Equipment", "Consumable", "Bulk"],
    default: "Equipment",
  },
  unit: {
    type: String,
    enum: ["pcs", "ml", "grams", "mg", "L", "other"],
    default: "pcs",
  },
  description: {
    type: String,
    // required: [true, "Please add a description"],
    maxlength: [500, "Description cannot be more than 500 characters"],
  },
  totalQuantity: {
    type: Number,
    required: [true, "Please add the total quantity of this item"],
    min: [0, "Quantity cannot be less than 0"],
  },
  availableQuantity: {
    type: Number,
    required: [true, "Please add the available quantity of this item"],
    min: [0, "Available quantity cannot be less than 0"],
  },
  status: {
    type: String,
    enum: ["Available", "Low Stock", "Out of Stock", "Maintenance"],
    default: "Available",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Item", itemSchema);
