const mongoose = require("mongoose");

const coinTransferRequestSchema = new mongoose.Schema(
  {
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fromUniqueId: {
      type: String,
      required: true,
    },
    toUniqueId: {
      type: String,
      required: true,
    },
    coinAmount: {
      type: Number,
      required: true,
      min: [0.01, "Coin amount must be greater than 0"],
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectionReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Index for fast lookups
coinTransferRequestSchema.index({ toUserId: 1, status: 1 });
coinTransferRequestSchema.index({ fromUserId: 1, status: 1 });
coinTransferRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model("CoinTransferRequest", coinTransferRequestSchema);
