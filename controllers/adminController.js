const User = require("../models/User");
const Transaction = require("../models/Transaction");
const WithdrawalRequest = require("../models/WithdrawalRequest");
const bcrypt = require("bcryptjs");
const {
  getCoinPrice,
  setCoinPrice,
  getActivationFee,
  setActivationFee,
  getYAxisRange,
  setYAxisRange,
} = require("../config/coinConfig");

const generateUniqueId = () => {
  const number = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `ZUX${number}`;
};

const ensureUniqueId = async (user) => {
  if (user.uniqueId) return false;
  let isUnique = false;
  let newId;

  while (!isUnique) {
    newId = generateUniqueId();
    const existing = await User.findOne({ uniqueId: newId });
    if (!existing) isUnique = true;
  }

  user.uniqueId = newId;
  return true;
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

exports.getAdminStats = async (req, res) => {
  try {
    // USERS (exclude admin users from counts) - also include old users without role field
    const userFilter = { $or: [{ role: "user" }, { role: { $exists: false } }] };
    const totalUsers = await User.countDocuments(userFilter);
    const activeUsers = await User.countDocuments({ ...userFilter, isActivated: true });

    // REVENUE (Activation)
    const activationRevenue = await Transaction.aggregate([
      { $match: { type: "activation" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const totalRevenue = activationRevenue[0]?.total || 0;

    // DIRECT BONUS
    const directBonus = await Transaction.aggregate([
      { $match: { type: "direct_bonus" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const totalDirectBonus = directBonus[0]?.total || 0;

    // MILESTONE BONUS
    const milestoneBonus = await Transaction.aggregate([
      { $match: { type: "milestone_bonus" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const totalMilestoneBonus = milestoneBonus[0]?.total || 0;

    // WITHDRAWALS
    const withdrawalApproved = await WithdrawalRequest.aggregate([
      { $match: { status: "approved" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const totalWithdrawals = withdrawalApproved[0]?.total || 0;

    const pendingWithdrawals = await WithdrawalRequest.aggregate([
      { $match: { status: "pending" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const totalPendingWithdrawals = pendingWithdrawals[0]?.total || 0;

    // SYSTEM BALANCE
    const totalPayout =
      totalDirectBonus + totalMilestoneBonus + totalWithdrawals;

    const systemBalance = totalRevenue - totalPayout;
    const inactiveUsers = totalUsers - activeUsers;

    res.json({
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalRevenue,
      totalDirectBonus,
      totalMilestoneBonus,
      totalWithdrawals,
      totalPendingWithdrawals,
      totalPayout,
      systemBalance,
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.getRevenueChart = async (req, res) => {
  try {
    const days = 30; // last 30 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Revenue (activation)
    const revenueData = await Transaction.aggregate([
      {
        $match: {
          type: "activation",
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Withdrawals (using approvedAt for better accuracy)
    const withdrawalData = await WithdrawalRequest.aggregate([
      {
        $match: {
          status: "approved",
          approvedAt: { $exists: true, $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$approvedAt" },
          },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Create a complete date range for last 30 days
    const dateLabels = [];
    const revenueMap = {};
    const withdrawalMap = {};

    // Populate maps with existing data
    revenueData.forEach(item => {
      revenueMap[item._id] = item.total;
    });

    withdrawalData.forEach(item => {
      withdrawalMap[item._id] = item.total;
    });

    // Generate all dates in the range
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dateLabels.push(dateStr);
    }

    // Create aligned data arrays
    const revenueValues = dateLabels.map(date => revenueMap[date] || 0);
    const withdrawalValues = dateLabels.map(date => withdrawalMap[date] || 0);

    res.json({
      labels: dateLabels,
      revenueValues,
      withdrawalValues,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { status = "all", q } = req.query;
    const filter = { $or: [{ role: "user" }, { role: { $exists: false } }] };

    if (status === "active") {
      filter.isActivated = true;
    } else if (status === "inactive") {
      filter.isActivated = false;
    }

    if (q) {
      filter.$and = [
        {
          $or: [
            { name: { $regex: q, $options: "i" } },
            { email: { $regex: q, $options: "i" } },
          ],
        },
      ];
    }

    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 });

    const updates = [];
    for (const user of users) {
      const hadUniqueId = Boolean(user.uniqueId);
      const idUpdated = await ensureUniqueId(user);
      const financialUpdated = await ensureUserFinancials(user);
      if (idUpdated || financialUpdated || !hadUniqueId) {
        updates.push(user.save());
      }
    }

    if (updates.length) {
      await Promise.all(updates);
    }

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateUserWallet = async (req, res) => {
  try {
    const { walletBalance, bonusWallet, coins } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Update bonus wallet if provided
    if (bonusWallet !== undefined) {
      const parsedBonus = Number(bonusWallet);
      if (!Number.isFinite(parsedBonus)) {
        return res.status(400).json({ message: "Invalid bonus wallet balance" });
      }
      user.bonusWallet = parsedBonus;
    }

    // Update coins if provided
    if (coins !== undefined) {
      const parsedCoins = Number(coins);
      if (!Number.isFinite(parsedCoins) || parsedCoins < 0) {
        return res.status(400).json({ message: "Invalid coin amount" });
      }
      
      // Directly set coinWallet
      user.coinWallet = parsedCoins;
      
      // Update startOfDayCoins to reflect new coin amount for daily limit calculation
      if (!Number.isFinite(user.withdrawalData.startOfDayCoins) || user.withdrawalData.startOfDayCoins < parsedCoins) {
        user.withdrawalData.startOfDayCoins = parsedCoins;
      }
    }

    await user.save();

    const sanitizedUser = user.toObject({ virtuals: true });
    delete sanitizedUser.password;

    res.json(sanitizedUser);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateUserPassword = async (req, res) => {
  try {
    const password = req.body.password || req.body.newPassword;
    if (!password || typeof password !== "string" || password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.password = await bcrypt.hash(password, 10);
    await user.save();

    res.json({ message: "Password updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role === "admin") {
      return res.status(400).json({ message: "Cannot delete admin user" });
    }

    await user.deleteOne();
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCoinPrice = async (req, res) => {
  try {
    res.json({ coinPrice: getCoinPrice() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateCoinPrice = async (req, res) => {
  try {
    const { coinPrice } = req.body;
    const updated = await setCoinPrice(coinPrice);
    res.json({ coinPrice: updated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getActivationFee = async (req, res) => {
  try {
    res.json({ activationFee: getActivationFee() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateActivationFee = async (req, res) => {
  try {
    const { activationFee } = req.body;
    const updated = await setActivationFee(activationFee);
    res.json({ activationFee: updated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getYAxisRange = async (req, res) => {
  try {
    res.json(getYAxisRange());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateYAxisRange = async (req, res) => {
  try {
    const { minYAxis, maxYAxis } = req.body;
    const updated = await setYAxisRange(minYAxis, maxYAxis);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
