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
  .get(authorize("LabManager"), getDamageReports)
  .post(authorize("LabManager"), createDamageReport);

// Only LabManagers can mark damages as cleared or replaced
router.route("/:id/status").put(authorize("LabManager"), updateDamageStatus);

module.exports = router;
