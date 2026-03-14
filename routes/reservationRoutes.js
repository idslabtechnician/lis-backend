const express = require("express");
const {
  getReservations,
  getAdminReservations,
  createReservation,
  verifyReservation,
  confirmReservation,
  denyReservation,
} = require("../controllers/reservationController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.route("/").get(getReservations).post(createReservation);

router.route("/confirm/:token").get(confirmReservation);

// Technician routes
router.use(protect);
router.use(authorize("LabManager", "Admin"));

router.route("/admin").get(getAdminReservations);
router.route("/:id/verify").put(verifyReservation);
router.route("/:id/deny").put(denyReservation);

module.exports = router;
