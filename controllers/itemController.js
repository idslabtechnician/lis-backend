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

// @desc    Seed mock inventory items
// @route   POST /api/inventory/seed
// @access  Private (LabManager only)
exports.seedItems = async (req, res) => {
  try {
    const mockData = [
      {
        name: "Oscilloscope",
        category: "Electronics",
        description: "Digital storage oscilloscope",
        totalQuantity: 10,
        availableQuantity: 10,
      },
      {
        name: "Multimeter",
        category: "Electronics",
        description: "Fluke digital multimeter",
        totalQuantity: 25,
        availableQuantity: 25,
      },
      {
        name: "Beaker 500ml",
        category: "Glassware",
        description: "Borosilicate glass beaker",
        totalQuantity: 100,
        availableQuantity: 100,
      },
      {
        name: "Test Tube Rack",
        category: "Hardware",
        description: "Wooden rack for 12 tubes",
        totalQuantity: 30,
        availableQuantity: 30,
        status: "Available",
      },
    ];

    // Clear existing
    await Item.deleteMany();

    // Seed new
    const items = await Item.insertMany(mockData);

    res.status(201).json({ success: true, count: items.length, data: items });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};
