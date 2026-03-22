const mongoose = require("mongoose");
const User = require("../models/User");
const WithdrawalRequest = require("../models/WithdrawalRequest");
const Transaction = require("../models/Transaction");
require("dotenv").config();

const backfillWithdrawalTransactions = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Find all approved withdrawal requests
    const approvedWithdrawals = await WithdrawalRequest.find({
      status: "approved"
    }).populate("userId");

    console.log(`Found ${approvedWithdrawals.length} approved withdrawals`);

    let created = 0;
    let skipped = 0;

    for (const withdrawal of approvedWithdrawals) {
      // Check if transaction already exists
      const existingTransaction = await Transaction.findOne({
        userId: withdrawal.userId._id,
        amount: -withdrawal.amount,
        type: "withdrawal",
        createdAt: withdrawal.approvedAt || withdrawal.createdAt
      });

      if (existingTransaction) {
        skipped++;
        continue;
      }

      // Create transaction with the approval date
      await Transaction.create({
        userId: withdrawal.userId._id,
        amount: -withdrawal.amount,
        type: "withdrawal",
        createdAt: withdrawal.approvedAt || withdrawal.createdAt
      });

      created++;
      console.log(`Created transaction for withdrawal ${withdrawal._id} - User: ${withdrawal.userId.name}`);
    }

    console.log(`\nBackfill complete!`);
    console.log(`Created: ${created}`);
    console.log(`Skipped (already exists): ${skipped}`);
    console.log(`Total: ${approvedWithdrawals.length}`);

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

backfillWithdrawalTransactions();
