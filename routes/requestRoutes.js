const express = require("express");
const {
  getGroupedRequests,
  verifyRequests,
  getLogs,
  returnRequest,
  borrowRequest,
} = require("../controllers/requestController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// Require auth for all request routes
router.use(protect);

// Only Lab Managers and Admins should process requests
router.use(authorize("LabManager", "Admin"));

// Get all requests grouped into tickets
router.route("/").get(getGroupedRequests);

// Get all verified/borrowed logs
router.route("/logs").get(getLogs);

// Verify specific items in a request
router.route("/verify").put(verifyRequests);

// Mark item as borrowed (released)
router.route("/:id/borrow").put(borrowRequest);

// Mark item as returned
router.route("/:id/return").put(returnRequest);

module.exports = router;
