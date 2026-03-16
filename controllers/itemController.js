const Item = require("../models/Item");

// @desc    Get all inventory items
// @route   GET /api/inventory
// @access  Private (All Roles)
exports.getItems = async (req, res) => {
  try {
    const items = await Item.find({});
    res.status(200).json({ success: true, count: items.length, data: items });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Create a new inventory item
// @route   POST /api/inventory
// @access  Private (LabManager only)
exports.createItem = async (req, res) => {
  try {
    const { name, category, type, unit, description, totalQuantity } = req.body;

    // Determine status automatically based on quantity
    let status;
    if (totalQuantity === 0) status = "Out of Stock";
    else if (totalQuantity < 5) status = "Low Stock";
    else status = "Available";

    // Whitelisted creation — only allow known fields
    const item = await Item.create({
      name,
      category,
      type,
      unit,
      description,
      totalQuantity,
      availableQuantity: totalQuantity,
      status,
    });

    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Update an inventory item
// @route   PUT /api/inventory/:id
// @access  Private (LabManager only)
exports.updateItem = async (req, res) => {
  try {
    let item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ success: false, error: "Item not found" });
    }

    // Whitelist allowed fields for update
    const allowedFields = [
      "name", "category", "type", "unit", "description",
      "totalQuantity", "availableQuantity", "status",
    ];
    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    item = await Item.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Delete an inventory item
// @route   DELETE /api/inventory/:id
// @access  Private (LabManager only)
exports.deleteItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ success: false, error: "Item not found" });
    }

    await item.deleteOne();

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};
