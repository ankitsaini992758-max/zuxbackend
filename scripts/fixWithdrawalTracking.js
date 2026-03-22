// Fix existing withdrawal tracking data
// Run with: node server/scripts/fixWithdrawalTracking.js

const mongoose = require("mongoose");
const User = require("../models/User");
const WithdrawalRequest = require("../models/WithdrawalRequest");

const getToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
};

async function fixWithdrawalTracking() {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/zux");

    console.log("Connected to MongoDB");

    const today = getToday();

    // Get all users
    const users = await User.find({});

    for (const user of users) {
      if (user.role === "admin") {
        console.log(`Skipping admin user: ${user.email}`);
        continue;
      }

      // Recalculate withdrawnToday based on approved withdrawals for today only
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const approvedToday = await WithdrawalRequest.aggregate([
        {
          $match: {
            userId: user._id,
            status: "approved",
            approvedAt: { $gte: todayStart },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]);

      const totalApprovedToday = approvedToday.length > 0 ? approvedToday[0].total : 0;

      // Update user's withdrawal data
      user.withdrawalData.lastWithdrawalDate = today;
      user.withdrawalData.withdrawnToday = totalApprovedToday;

      await user.save();

      console.log(
        `Fixed ${user.email}: withdrawnToday = ${totalApprovedToday}, dailyLimit = ${user.coins * 0.1}`
      );
    }

    console.log("\n✅ Withdrawal tracking data fixed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

fixWithdrawalTracking();
