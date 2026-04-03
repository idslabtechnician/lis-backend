const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("./models/User");
const Item = require("./models/Item");
const Reservation = require("./models/Reservation");

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGO_URI || "mongodb://localhost:27017/lab-system",
    );
    console.log("MongoDB Connected...");
  } catch (err) {
    console.error("MongoDB Connection Error:", err.message);
    process.exit(1);
  }
};

const mockItems = [
  {
    name: "Oscilloscope",
    category: "Electronics",
    type: "Equipment",
    description: "Digital storage oscilloscope",
    totalQuantity: 10,
    availableQuantity: 10,
  },
  {
    name: "Multimeter",
    category: "Electronics",
    type: "Equipment",
    description: "Fluke digital multimeter",
    totalQuantity: 25,
    availableQuantity: 25,
  },
  {
    name: "Beaker 500ml",
    category: "Glassware",
    type: "Consumable",
    description: "Borosilicate glass beaker",
    totalQuantity: 100,
    availableQuantity: 100,
  },
  {
    name: "Test Tube Rack",
    category: "Hardware",
    type: "Consumable",
    description: "Wooden rack for 12 tubes",
    totalQuantity: 30,
    availableQuantity: 30,
    status: "Available",
  },
];

// Import into DB
const importData = async () => {
  try {
    await connectDB();

    console.log("🧹 Clearing old data...");
    await User.deleteMany();
    await Item.deleteMany();
    await Reservation.deleteMany();

    // Generate secure passwords (use env vars in production)
    const crypto = require("crypto");
    const adminPassword =
      process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(12).toString("hex");
    const studentPassword =
      process.env.SEED_STUDENT_PASSWORD ||
      crypto.randomBytes(12).toString("hex");

    // Create Initial LabManager Account
    const adminUser = await User.create({
      name: "Admin Manager",
      email: process.env.SEED_ADMIN_EMAIL || "admin@lab.com",
      password: adminPassword,
      role: "LabManager",
    });

    console.log(`Admin Account Created: ${adminUser.email} / ${adminPassword}`);

    // Create Student Account
    const studentUser = await User.create({
      name: "Chesler Student",
      idNumber: "2023-1848",
      email: "chesler@student.com",
      password: studentPassword,
      role: "Student",
    });

    console.log(
      `Student Account Created: ${studentUser.email} / ${studentPassword}`,
    );

    // Create Inventory Items
    const createdItems = await Item.insertMany(mockItems);

    console.log("Mock Inventory Data Imported...");

    // Sample Items
    const sampleItemsFirst = createdItems.slice(0, 2);

    // Create Mock Reservations for Chesler Student
    const now = new Date();
    const startTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
    const endTime = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours from now

    await Reservation.create({
      studentInfo: {
        name: studentUser.name,
        studentId: studentUser.idNumber,
        email: studentUser.email,
        section: "BSIT 4-1",
        yearLevel: "4th Year",
        purpose: "Capstone Project",
      },
      items: sampleItemsFirst.map((item) => ({
        item: item._id,
        quantity: 1,
      })),
      startTime,
      endTime,
      status: "submitted",
    });

    // Create Alice Student Account
    const alicePassword = crypto.randomBytes(12).toString("hex");
    const aliceUser = await User.create({
      name: "Alice Smith",
      idNumber: "2024-0001",
      email: "alice@university.edu",
      password: alicePassword,
      role: "Student",
    });
    console.log(
      `Student Account Created: ${aliceUser.email} / ${alicePassword}`,
    );

    await Reservation.create({
      studentInfo: {
        name: aliceUser.name,
        studentId: aliceUser.idNumber,
        email: aliceUser.email,
        section: "BSCS 2-2",
        yearLevel: "2nd Year",
        purpose: "Basic Electronics Lab",
      },
      items: [{ item: createdItems[2]._id, quantity: 2 }],
      startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000), // tomorrow
      endTime: new Date(now.getTime() + 26 * 60 * 60 * 1000),
      status: "pending_confirmation",
      verifiedAt: Date.now(),
      technicianId: adminUser._id,
    });

    console.log("Mock Reservations Created...");

    console.log("Seeding Completed Successfully!");
    process.exit();
  } catch (err) {
    console.error("Seeding Error:", err);
    process.exit(1);
  }
};

// Delete data
const deleteData = async () => {
  try {
    await connectDB();

    await User.deleteMany();
    await Item.deleteMany();
    await Reservation.deleteMany();

    console.log("🗑️ Data Destroyed...");
    process.exit();
  } catch (err) {
    console.error("Delete Error:", err);
    process.exit(1);
  }
};

if (process.argv[2] === "-d") {
  deleteData();
} else {
  importData();
}
