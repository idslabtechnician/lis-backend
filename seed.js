const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("./models/User");
const Item = require("./models/Item");

// Load env vars
dotenv.config();

// Connect to DB
mongoose.connect(
  process.env.MONGO_URI || "mongodb://localhost:27017/lab-system",
);

const mockItems = [
  {
    name: "Oscilloscope",
    category: "Electronics",
    description: "Digital storage oscilloscope",
    totalQuantity: 10,
    availableQuantity: 10,
  },
  {
    name: "Multimeter",
    category: "Electronics",
    description: "Fluke digital multimeter",
    totalQuantity: 25,
    availableQuantity: 25,
  },
  {
    name: "Beaker 500ml",
    category: "Glassware",
    description: "Borosilicate glass beaker",
    totalQuantity: 100,
    availableQuantity: 100,
  },
  {
    name: "Test Tube Rack",
    category: "Hardware",
    description: "Wooden rack for 12 tubes",
    totalQuantity: 30,
    availableQuantity: 30,
    status: "Available",
  },
];

// Import into DB
const importData = async () => {
  try {
    await User.deleteMany();
    await Item.deleteMany();

    // Create Initial LabManager Account
    const adminUser = await User.create({
      name: "Admin Manager",
      email: "admin@lab.com",
      password: "password123",
      role: "LabManager",
    });

    console.log(`✅ Admin Account Created: ${adminUser.email} / password123`);

    // Create Inventory Items
    await Item.insertMany(mockItems);

    console.log("✅ Mock Inventory Data Imported...");
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

// Delete data
const deleteData = async () => {
  try {
    await User.deleteMany();
    await Item.deleteMany();

    console.log("🗑️ Data Destroyed...");
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

if (process.argv[2] === "-d") {
  deleteData();
} else {
  importData();
}
