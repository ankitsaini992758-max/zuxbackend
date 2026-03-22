const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    amount: Number,
    coinAmount: { type: Number, default: null },

    type: {
      type: String,
      enum: [
        "activation",
        "direct_bonus",
        "milestone_bonus",
        "bonus_withdrawal",
        "coin_withdrawal",
        "coin_transfer_sent",
        "coin_transfer_received",
      ],
    },

    milestoneLevel: {
      type: Number,
      default: null,
    },

    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    description: {
      type: String,
      default: null,
    },

    relatedTransferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CoinTransferRequest",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);
