const express = require("express");
const {
  getItems,
  createItem,
  seedItems,
} = require("../controllers/itemController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// Require auth for all inventory routes
router.use(protect);

// Anyone signed in can view items
router.route("/").get(getItems);

// Only Lab Managers can create or seed the inventory
router.route("/").post(authorize("LabManager"), createItem);

router.route("/seed").post(authorize("LabManager"), seedItems);

module.exports = router;
