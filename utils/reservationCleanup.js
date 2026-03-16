const cron = require("node-cron");
const Reservation = require("../models/Reservation");

const initCleanupJob = () => {
  // Run every hour
  cron.schedule("0 * * * *", async () => {
    console.log("Running Reservation Cleanup Job...");
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

    try {
      const result = await Reservation.updateMany(
        {
          status: "pending_confirmation",
          verifiedAt: { $lt: twelveHoursAgo },
        },
        { status: "expired" }
      );
      if (result.modifiedCount > 0) {
        console.log(`Auto-expired ${result.modifiedCount} reservations.`);
      }
    } catch (err) {
      console.error("Cleanup job failed:", err);
    }
  });
};

module.exports = initCleanupJob;
