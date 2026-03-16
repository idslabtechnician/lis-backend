const express = require("express");
const {
  getItems,
  createItem,
  updateItem,
  deleteItem,
} = require("../controllers/itemController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// Anyone can view inventory items (needed for Student App)
router.route("/").get(getItems);

// Require auth for all other inventory routes (POST, PUT, DELETE)
router.use(protect);

// Only Lab Managers can create or seed the inventory
router.route("/").post(authorize("LabManager"), createItem);

router
  .route("/:id")
  .put(authorize("LabManager"), updateItem)
  .delete(authorize("LabManager"), deleteItem);

module.exports = router;
