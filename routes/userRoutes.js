const express = require("express");
const {
  getUsers,
  createUser,
  deleteUser,
} = require("../controllers/userController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// All routes below require auth and LabManager role
router.use(protect);
router.use(authorize("LabManager"));

router.route("/").get(getUsers).post(createUser);

router.route("/:id").delete(deleteUser);

module.exports = router;
