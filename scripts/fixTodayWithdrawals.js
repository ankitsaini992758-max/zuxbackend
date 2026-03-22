// Fix withdrawal tracking for today's data
// Run with: node server/scripts/fixTodayWithdrawals.js

const mongoose = require("mongoose");
const User = require("../models/User");
const WithdrawalRequest = require("../models/WithdrawalRequest");

const getToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
};

async function fixTodayWithdrawals() {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/zux");
    console.log("Connected to MongoDB");

    const today = getToday();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Get all users
    const users = await User.find({ role: { $ne: "admin" } });

    for (const user of users) {
      // Find all approved withdrawals for today
      const approvedToday = await WithdrawalRequest.find({
        userId: user._id,
        status: "approved",
        approvedAt: { $gte: todayStart },
      });

      const totalWithdrawnToday = approvedToday.reduce(
        (sum, w) => sum + w.amount,
        0
      );

      // Calculate what the starting coins were
      // startOfDayCoins = currentCoins + totalWithdrawnToday
      const startOfDayCoins = user.coins + totalWithdrawnToday;

      // Update user
      user.withdrawalData.lastWithdrawalDate = today;
      user.withdrawalData.withdrawnToday = totalWithdrawnToday;
      user.withdrawalData.startOfDayCoins = startOfDayCoins;

      await user.save();

      const dailyLimit = startOfDayCoins * 0.1;
      const remaining = dailyLimit - totalWithdrawnToday;

      console.log(`\n✅ Fixed ${user.email}:`);
      console.log(`   Current Coins: ${user.coins}`);
      console.log(`   Start of Day Coins: ${startOfDayCoins}`);
      console.log(`   Daily Limit (10%): ${dailyLimit.toFixed(2)}`);
      console.log(`   Withdrawn Today: ${totalWithdrawnToday}`);
      console.log(`   Remaining: ${remaining.toFixed(2)}`);
    }

    console.log("\n✅ Today's withdrawal data fixed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

fixTodayWithdrawals();
