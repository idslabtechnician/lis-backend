const User = require("../models/User");

// @desc    Get all users
// @route   GET /api/users
// @access  Private/LabManager
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({});
    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Create a user
// @route   POST /api/users
// @access  Private/LabManager
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check if role is valid
    if (!["LabManager", "Teacher", "Student"].includes(role)) {
      return res.status(400).json({ success: false, error: "Invalid role" });
    }

    const user = await User.create({ name, email, password, role });
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/LabManager
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};
