const mongoose = require("mongoose");

const withdrawalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    amount: Number,        // ₹ amount
    coinAmount: Number,    // coin amount
    requestUpiId: { type: String, default: "" },
    bankDetailsSnapshot: {
      accountHolderName: { type: String, default: "" },
      bankName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      branch: { type: String, default: "" },
      ifscCode: { type: String, default: "" },
      upiId: { type: String, default: "" },
      qrImage: { type: String, default: "" },
    },
    taxRate: { type: Number, default: 0.05 },
    taxAmount: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    type: {
      type: String,
      enum: ["coin", "bonus"],
      default: "coin",
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WithdrawalRequest", withdrawalSchema);
