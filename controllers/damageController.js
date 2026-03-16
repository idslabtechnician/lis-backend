const DamageReport = require("../models/DamageReport");
const Item = require("../models/Item");
const User = require("../models/User");

// @desc    Get all damage reports
// @route   GET /api/damages
// @access  Private (LabManagers & Teachers)
exports.getDamageReports = async (req, res) => {
  try {
    const reports = await DamageReport.find()
      .populate({
        path: "item",
        select: "name category",
      })
      .populate({
        path: "liableUser",
        select: "name email idNumber",
      })
      .populate({
        path: "issuedBy",
        select: "name role",
      });

    res
      .status(200)
      .json({ success: true, count: reports.length, data: reports });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Create a damage report
// @route   POST /api/damages
// @access  Private (LabManagers & Teachers)
exports.createDamageReport = async (req, res) => {
  try {
    req.body.issuedBy = req.user.id;

    const item = await Item.findById(req.body.item);
    if (!item) {
      return res.status(404).json({ success: false, error: "Item not found" });
    }

    const liableUser = await User.findById(req.body.liableUser);
    if (!liableUser) {
      return res
        .status(404)
        .json({ success: false, error: "Liable user not found" });
    }

    const report = await DamageReport.create(req.body);

    res.status(201).json({ success: true, data: report });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Update damage report status (e.g., mark as Paid/Cleared)
// @route   PUT /api/damages/:id/status
// @access  Private (LabManagers Only)
exports.updateDamageStatus = async (req, res) => {
  try {
    const { status } = req.body;
    let report = await DamageReport.findById(req.params.id);

    if (!report) {
      return res
        .status(404)
        .json({ success: false, error: "Damage report not found" });
    }

    report.status = status;

    if (status === "Paid" || status === "Cleared") {
      report.resolvedDate = Date.now();
    }

    await report.save();

    res.status(200).json({ success: true, data: report });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};
