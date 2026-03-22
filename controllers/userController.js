const User = require("../models/User");
const Transaction = require("../models/Transaction");
const { getActivationFee, getCoinPrice } = require("../config/coinConfig");

const generateUniqueId = () => {
  const number = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `ZUX${number}`;
};

const ensureUniqueId = async (user) => {
  if (user.uniqueId) return;
  let isUnique = false;
  let newId;

  while (!isUnique) {
    newId = generateUniqueId();
    const existing = await User.findOne({ uniqueId: newId });
    if (!existing) isUnique = true;
  }

  user.uniqueId = newId;
};

const ensureUserFinancials = async (user) => {
  if (!user) return false;
  let updated = false;

  const shouldRecalcBonus =
    user.bonusWallet === undefined || user.bonusWallet === null || user.bonusWallet === 0;

  if (shouldRecalcBonus) {
    const bonusAgg = await Transaction.aggregate([
      {
        $match: {
          userId: user._id,
          type: { $in: ["direct_bonus", "milestone_bonus", "bonus_withdrawal"] },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const bonusTotal = bonusAgg[0]?.total || 0;
    if (bonusTotal !== user.bonusWallet) {
      user.bonusWallet = Math.max(bonusTotal, 0);
      updated = true;
    }
  }

  // Migration: Convert old activationAmountRemaining to coinWallet if needed
  if (user.isActivated && (!user.coinWallet || user.coinWallet === 0)) {
    const coinPrice = getCoinPrice();
    if (Number.isFinite(user.activationAmountRemaining) && user.activationAmountRemaining > 0) {
      user.coinWallet = user.activationAmountRemaining / coinPrice;
      updated = true;
    } else if (Number.isFinite(user.activationCoinsRemaining) && user.activationCoinsRemaining > 0) {
      user.coinWallet = user.activationCoinsRemaining;
      updated = true;
    }
  }

  return updated;
};

exports.activateAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user);

    if (!user)
      return res.status(404).json({ message: "User not found" });

    // Admin users don't need activation
    if (user.role === "admin")
      return res.status(400).json({ message: "Admin users cannot be activated" });

    if (user.isActivated)
      return res.status(400).json({ message: "Already activated" });

    // 🔥 Get total activated users BEFORE activation (exclude admins)
    const userFilter = { $or: [{ role: "user" }, { role: { $exists: false } }] };
    const totalActiveBefore = await User.countDocuments({
      isActivated: true,
      ...userFilter,
    });

    if (user.position === null || user.position === undefined) {
      const lastUser = await User.findOne({ role: { $ne: "admin" } })
        .sort({ position: -1 })
        .select("position");
      user.position = (lastUser?.position || 0) + 1;
    }
    user.isActivated = true;
    const activationFee = getActivationFee();
    const coinPrice = getCoinPrice();
    
    // Add coins to coinWallet based on activation fee and current price
    user.coinWallet = coinPrice > 0 ? activationFee / coinPrice : 0;
    
    // Reset deprecated fields
    user.activationAmountRemaining = 0;
    user.activationCoinsRemaining = 0;
    user.walletBalance = 0;
    user.bonusWallet = user.bonusWallet || 0;

    await user.save();

    // Record activation
    await Transaction.create({
      userId: user._id,
      amount: activationFee,
      type: "activation",
    });

    // 🔥 DIRECT BONUS - only for non-admin referrer
    if (user.referredBy) {
      const referrer = await User.findById(user.referredBy);
      if (referrer && (referrer.role === "user" || !referrer.role)) {
        referrer.bonusWallet += 2500;
        // bonus wallet only
        await referrer.save();

        await Transaction.create({
          userId: referrer._id,
          amount: 2500,
          type: "direct_bonus",
          fromUser: user._id,
        });
      }
    }

    // 🔥 MILESTONE ENGINE - only for non-admin users

    const totalActive = totalActiveBefore + 1;

    const checkMilestone = async (level, amount, field) => {
      const targetPosition = totalActive - level;

      if (targetPosition <= 0) return;

      const milestoneUser = await User.findOne({
        position: targetPosition,
        isActivated: true,
        $or: [{ role: "user" }, { role: { $exists: false } }],
      });

      if (milestoneUser && !milestoneUser.milestones[field]) {
        milestoneUser.bonusWallet += amount;
        // bonus wallet only
        milestoneUser.milestones[field] = true;

        await milestoneUser.save();

        await Transaction.create({
          userId: milestoneUser._id,
          amount: amount,
          type: "milestone_bonus",
          milestoneLevel: level,
        });
      }
    };

    await checkMilestone(50, 500, "m50");
    await checkMilestone(100, 1500, "m100");
    await checkMilestone(150, 2500, "m150");

    res.json({
      message: "Account Activated Successfully",
      position: user.position,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user).select("-password");
    if (user) {
      const hadUniqueId = Boolean(user.uniqueId);
      await ensureUniqueId(user);
      const updated = await ensureUserFinancials(user);
      if (updated || !hadUniqueId) {
        await user.save();
      }
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.getDashboardData = async (req, res) => {
  try {
    const user = await User.findById(req.user).select("-password");

    if (!user)
      return res.status(404).json({ message: "User not found" });

    const hadUniqueId = Boolean(user.uniqueId);
    await ensureUniqueId(user);
    const updated = await ensureUserFinancials(user);
    if (updated || !hadUniqueId) {
      await user.save();
    }

    // Don't show position data for admin users
    if (user.role === "admin") {
      return res.json({
        user,
        totalActive: 0,
        directReferrals: 0,
        activeBelow: 0,
      });
    }

    // Include users without role field (backward compatibility)
    const userFilter = { $or: [{ role: "user" }, { role: { $exists: false } }] };
    
    const totalActive = await User.countDocuments({
      isActivated: true,
      ...userFilter,
    });

    const directReferrals = await User.countDocuments({
      referredBy: user._id,
      ...userFilter,
    });

    let activeBelow = 0;

    // Count ACTIVATED users positioned BELOW this user (by position)
    // Works for both active and inactive users - milestones based on activated downline
    if (user.position) {
      activeBelow = await User.countDocuments({
        position: { $gt: user.position },
        isActivated: true,  // Only count ACTIVATED users in the hierarchy
        ...userFilter,
      });
    }

    res.json({
      user,
      totalActive,
      directReferrals,
      activeBelow,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.getTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({
      userId: req.user,
    }).sort({ createdAt: -1 });

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateBankDetails = async (req, res) => {
  try {
    const user = await User.findById(req.user);
    if (!user) return res.status(404).json({ message: "User not found" });

    const {
      accountHolderName,
      bankName,
      accountNumber,
      branch,
      ifscCode,
      upiId,
      qrImage,
    } = req.body || {};

    user.bankDetails = {
      accountHolderName: accountHolderName || "",
      bankName: bankName || "",
      accountNumber: accountNumber || "",
      branch: branch || "",
      ifscCode: ifscCode || "",
      upiId: upiId || "",
      qrImage: qrImage || "",
    };

    await user.save();
    const sanitizedUser = user.toObject({ virtuals: true });
    delete sanitizedUser.password;

    res.json({ message: "Bank details updated", user: sanitizedUser });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
