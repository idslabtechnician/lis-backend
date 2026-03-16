const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please add a name"],
  },
  idNumber: {
    type: String,
  },
  email: {
    type: String,
    required: [true, "Please add an email"],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      "Please add a valid email",
    ],
  },
  password: {
    type: String,
    required: [true, "Please add a password"],
    minlength: [8, "Password must be at least 8 characters"],
    select: false, // Don't return password by default
    validate: {
      validator: function (v) {
        // Only validate on create/password change — not on every save
        if (!this.isModified("password")) return true;
        return /[A-Z]/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v);
      },
      message:
        "Password must contain at least one uppercase letter, one lowercase letter, and one number",
    },
  },
  role: {
    type: String,
    enum: ["LabManager", "Teacher", "Student"],
    default: "Student",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Encrypt password using bcrypt
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
