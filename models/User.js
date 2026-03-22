const mongoose = require("mongoose");
const { getCoinPrice } = require("../config/coinConfig");

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    password: String,

    uniqueId: { type: String, unique: true, sparse: true },

    referralCode: { type: String, unique: true },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isActivated: { type: Boolean, default: false },

    position: {
      type: Number,
      default: null,
      index: true,
    },

    walletBalance: { type: Number, default: 0 },
    bonusWallet: { type: Number, default: 0 },
    coinWallet: { type: Number, default: 0 }, // Actual coin balance
    activationAmountRemaining: { type: Number, default: 0 }, // Deprecated - kept for migration
    activationCoinsRemaining: { type: Number, default: 0 }, // Deprecated - kept for migration

    bankDetails: {
      accountHolderName: { type: String, default: "" },
      bankName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      branch: { type: String, default: "" },
      ifscCode: { type: String, default: "" },
      upiId: { type: String, default: "" },
      qrImage: { type: String, default: "" },
    },

    milestones: {
      m50: { type: Boolean, default: false },
      m100: { type: Boolean, default: false },
      m250: { type: Boolean, default: false },
      m500: { type: Boolean, default: false },
      m1000: { type: Boolean, default: false },
      m2500: { type: Boolean, default: false },
    },

    withdrawalData: {
      lastWithdrawalDate: { type: String, default: null },
      withdrawnTodayCoins: { type: Number, default: 0 },
      startOfDayCoins: { type: Number, default: 0 },
    },
    role: {
  type: String,
  enum: ["user", "admin"],
  default: "user",
},
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual field: Return coins from coinWallet for backward compatibility
userSchema.virtual("coins").get(function () {
  return this.coinWallet || 0;
});

module.exports = mongoose.model("User", userSchema);
