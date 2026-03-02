const express = require("express");
const {
  getOrders,
  createOrder,
  updateOrderStatus,
} = require("../controllers/orderController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.route("/").get(getOrders).post(authorize("Student"), createOrder);

router
  .route("/:id/status")
  .put(authorize("LabManager", "Teacher"), updateOrderStatus);

module.exports = router;
