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
    // Determine status automatically if not provided based on quantity
    if (!req.body.status) {
      if (req.body.totalQuantity === 0) req.body.status = "Out of Stock";
      else if (req.body.totalQuantity < 5) req.body.status = "Low Stock";
      else req.body.status = "Available";
    }

    // Default available quantity to total quantity on creation if not specified
    if (req.body.availableQuantity === undefined) {
      req.body.availableQuantity = req.body.totalQuantity;
    }

    const item = await Item.create(req.body);

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

    item = await Item.findByIdAndUpdate(req.params.id, req.body, {
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
