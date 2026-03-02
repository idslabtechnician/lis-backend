const express = require("express");
const {
  getDamageReports,
  createDamageReport,
  updateDamageStatus,
} = require("../controllers/damageController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router
  .route("/")
  .get(authorize("LabManager", "Teacher"), getDamageReports)
  .post(authorize("LabManager", "Teacher"), createDamageReport);

// Only LabManagers can mark damages as cleared or paid
router.route("/:id/status").put(authorize("LabManager"), updateDamageStatus);

module.exports = router;
