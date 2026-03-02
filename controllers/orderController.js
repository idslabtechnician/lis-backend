const Order = require("../models/Order");
const Item = require("../models/Item");

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private (LabManagers and Teachers can see all, Students see their own)
exports.getOrders = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === "Student") {
      query.student = req.user.id;
    }

    const orders = await Order.find(query)
      .populate({
        path: "item",
        select: "name category status",
      })
      .populate({
        path: "student",
        select: "name email",
      });

    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Create new order (request to borrow)
// @route   POST /api/orders
// @access  Private (Students only)
exports.createOrder = async (req, res) => {
  try {
    // Add user to req.body
    req.body.student = req.user.id;

    const item = await Item.findById(req.body.item);

    if (!item) {
      return res.status(404).json({ success: false, error: "Item not found" });
    }

    // Check if enough quantity is available
    if (item.availableQuantity < req.body.quantity) {
      return res
        .status(400)
        .json({ success: false, error: "Not enough quantity available" });
    }

    const order = await Order.create(req.body);

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Update order status (Approve, Reject, or Return)
// @route   PUT /api/orders/:id/status
// @access  Private (LabManager or Teacher)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    let order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    // If approving, we need to deduct from available quantity
    if (status === "Approved" && order.status === "Pending") {
      const item = await Item.findById(order.item);
      if (item.availableQuantity < order.quantity) {
        return res
          .status(400)
          .json({
            success: false,
            error: "Not enough quantity available to approve",
          });
      }

      item.availableQuantity -= order.quantity;
      if (item.availableQuantity === 0) item.status = "Out of Stock";
      else if (item.availableQuantity < 5) item.status = "Low Stock";
      await item.save();
    }

    // If returning, add back to available quantity
    if (status === "Returned" && order.status === "Approved") {
      const item = await Item.findById(order.item);
      item.availableQuantity += order.quantity;

      if (item.availableQuantity > 0) item.status = "Available";
      await item.save();

      order.actualReturnDate = Date.now();
    }

    order.status = status;
    await order.save();

    res.status(200).json({ success: true, data: order });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};
