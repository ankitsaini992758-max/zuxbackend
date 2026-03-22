const User = require("../models/User");
const WithdrawalRequest = require("../models/WithdrawalRequest");
const Transaction = require("../models/Transaction");
const { getCoinPrice, getActivationFee } = require("../config/coinConfig");

const TAX_RATE = 0.05;

const normalizeBankDetails = (userLike = {}) => {
  const details = userLike.bankDetails || {};
  return {
    accountHolderName: (details.accountHolderName || userLike.accountHolderName || "").trim(),
    bankName: (details.bankName || userLike.bankName || "").trim(),
    accountNumber: (details.accountNumber || userLike.accountNumber || "").trim(),
    branch: (details.branch || userLike.branch || "").trim(),
    ifscCode: (details.ifscCode || userLike.ifscCode || "").trim(),
    upiId: (details.upiId || userLike.upiId || "").trim(),
    qrImage: details.qrImage || userLike.qrImage || "",
  };
};

const hasBankDetails = (details = {}) => {
  return Boolean(
    details.accountHolderName ||
      details.bankName ||
      details.accountNumber ||
      details.branch ||
      details.ifscCode ||
      details.upiId ||
      details.qrImage
  );
};

const getToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
};

const resetDailyCoinsIfNeeded = async (user) => {
  const today = getToday();
  const currentCoins = user.coinWallet || 0;

  if (user.withdrawalData.lastWithdrawalDate !== today) {
    user.withdrawalData.lastWithdrawalDate = today;
    user.withdrawalData.withdrawnTodayCoins = 0;
    user.withdrawalData.startOfDayCoins = currentCoins;
    await user.save();
    return;
  }

  if (!Number.isFinite(user.withdrawalData.withdrawnTodayCoins)) {
    user.withdrawalData.withdrawnTodayCoins = 0;
  }

  // Update startOfDayCoins if current coins are higher (admin updated coins mid-day)
  if (!Number.isFinite(user.withdrawalData.startOfDayCoins) || user.withdrawalData.startOfDayCoins <= 0) {
    if (currentCoins > 0) {
      user.withdrawalData.startOfDayCoins = currentCoins;
    }
  } else if (currentCoins > user.withdrawalData.startOfDayCoins) {
    // If coins increased (admin added coins), update the daily limit basis
    user.withdrawalData.startOfDayCoins = currentCoins;
  }

  await user.save();
};

// USER REQUEST COIN WITHDRAWAL (10% daily limit)
exports.createWithdrawalRequest = async (req, res) => {
  try {
    const { coinAmount, requestUpiId } = req.body;

    const user = await User.findById(req.user);

    if (!user || !user.isActivated)
      return res.status(400).json({ message: "Invalid user" });

    const coinsRequested = Number(coinAmount);
    if (!Number.isFinite(coinsRequested) || coinsRequested <= 0)
      return res.status(400).json({ message: "Invalid coin amount" });

    // Only 1 pending COIN request allowed
    const existingPending = await WithdrawalRequest.findOne({
      userId: user._id,
      status: "pending",
      type: "coin",
    });

    if (existingPending)
      return res.status(400).json({
        message: "You already have a pending coin withdrawal request",
      });

    await resetDailyCoinsIfNeeded(user);

    const coinPrice = getCoinPrice();
    const currentCoins = user.coinWallet || 0;
    const startCoins = Number.isFinite(user.withdrawalData.startOfDayCoins)
      ? user.withdrawalData.startOfDayCoins
      : currentCoins;
    const dailyLimit = startCoins * 0.1;
    const remaining = dailyLimit - user.withdrawalData.withdrawnTodayCoins;

    if (coinsRequested > remaining)
      return res.status(400).json({
        message: `You can withdraw only ${remaining.toFixed(2)} coins today`,
      });

    if (coinsRequested > currentCoins)
      return res.status(400).json({ message: "Insufficient coin balance" });

    // Don't count pending - only increment withdrawnToday on approval

    const rupeeAmount = coinsRequested * coinPrice;

    const taxAmount = rupeeAmount * TAX_RATE;
    const netAmount = rupeeAmount - taxAmount;

    const normalizedRequestUpi = String(requestUpiId || "").trim();
    const bankDetailsSnapshot = normalizeBankDetails(user);
    if (normalizedRequestUpi) {
      bankDetailsSnapshot.upiId = normalizedRequestUpi;
    }

    const request = await WithdrawalRequest.create({
      userId: user._id,
      amount: rupeeAmount,
      coinAmount: coinsRequested,
      requestUpiId: normalizedRequestUpi,
      bankDetailsSnapshot,
      taxRate: TAX_RATE,
      taxAmount,
      netAmount,
      type: "coin",
    });

    res.json({
      message: "Withdrawal request submitted",
      remainingToday: (dailyLimit - user.withdrawalData.withdrawnTodayCoins).toFixed(2),
      request,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// USER REQUEST BONUS WITHDRAWAL
exports.createBonusWithdrawalRequest = async (req, res) => {
  try {
    const { amount, requestUpiId } = req.body;

    const user = await User.findById(req.user);

    if (!user || !user.isActivated)
      return res.status(400).json({ message: "Invalid user" });

    const rupeeAmount = Number(amount);
    if (!Number.isFinite(rupeeAmount) || rupeeAmount <= 0)
      return res.status(400).json({ message: "Invalid amount" });

    const existingPending = await WithdrawalRequest.findOne({
      userId: user._id,
      status: "pending",
      type: "bonus",
    });

    if (existingPending)
      return res.status(400).json({
        message: "You already have a pending bonus withdrawal request",
      });

    if (rupeeAmount > user.bonusWallet)
      return res.status(400).json({ message: "Insufficient bonus balance" });

    const taxAmount = rupeeAmount * TAX_RATE;
    const netAmount = rupeeAmount - taxAmount;

    const normalizedRequestUpi = String(requestUpiId || "").trim();
    const bankDetailsSnapshot = normalizeBankDetails(user);
    if (normalizedRequestUpi) {
      bankDetailsSnapshot.upiId = normalizedRequestUpi;
    }

    const request = await WithdrawalRequest.create({
      userId: user._id,
      amount: rupeeAmount,
      coinAmount: null,
      requestUpiId: normalizedRequestUpi,
      bankDetailsSnapshot,
      taxRate: TAX_RATE,
      taxAmount,
      netAmount,
      type: "bonus",
    });

    res.json({
      message: "Bonus withdrawal request submitted",
      request,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ADMIN APPROVE
exports.approveWithdrawal = async (req, res) => {
  try {
    const { requestId } = req.body;

    console.log("Approve request for ID:", requestId);

    const request = await WithdrawalRequest.findById(requestId).populate("userId");

    console.log("Found request:", request);

    if (!request) {
      return res.status(400).json({ message: "Withdrawal request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: `Cannot approve: Request status is ${request.status}` });
    }

    const user = request.userId;

    if (!user) {
      return res.status(400).json({ message: "User not found for this request" });
    }

    if (request.type === "bonus") {
      if (request.amount > user.bonusWallet) {
        return res.status(400).json({ message: "Insufficient bonus balance" });
      }
      user.bonusWallet -= request.amount;
      await Transaction.create({
        userId: user._id,
        amount: -request.amount,
        type: "bonus_withdrawal",
      });
    } else {
      const coinPrice = getCoinPrice();
      const coinAmount = Number.isFinite(request.coinAmount)
        ? request.coinAmount
        : request.amount / coinPrice;

      const currentCoins = user.coinWallet || 0;
      if (coinAmount > currentCoins) {
        return res.status(400).json({ message: "Insufficient coin balance" });
      }
      await resetDailyCoinsIfNeeded(user);
      user.coinWallet = Math.max((user.coinWallet || 0) - coinAmount, 0);
      user.withdrawalData.withdrawnTodayCoins += coinAmount;
      await Transaction.create({
        userId: user._id,
        amount: -request.amount,
        coinAmount: coinAmount,
        type: "coin_withdrawal",
      });
    }

    await user.save();

    request.status = "approved";
    request.approvedAt = new Date();
    await request.save();

    res.json({
      message: "Withdrawal approved successfully",
      updatedBonusWallet: user.bonusWallet,
      updatedCoins: user.coinWallet || 0,
      taxRate: request.taxRate ?? TAX_RATE,
      taxAmount: request.taxAmount ?? 0,
      netAmount: request.netAmount ?? request.amount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ADMIN REJECT
exports.rejectWithdrawal = async (req, res) => {
  try {
    const { requestId } = req.body;

    const request = await WithdrawalRequest.findById(requestId);

    if (!request || request.status !== "pending")
      return res.status(400).json({ message: "Invalid request" });

    // No need to reverse withdrawnToday since pending requests don't count anymore
    request.status = "rejected";
    await request.save();

    res.json({ message: "Withdrawal rejected" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// USER INFO API
exports.getWithdrawalInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user);

    await resetDailyCoinsIfNeeded(user);

    const coinPrice = getCoinPrice();
    const currentCoins = user.coinWallet || 0;
    const startCoins = Number.isFinite(user.withdrawalData.startOfDayCoins)
      ? user.withdrawalData.startOfDayCoins
      : currentCoins;
    const dailyLimit = startCoins * 0.1;
    const remaining = dailyLimit - user.withdrawalData.withdrawnTodayCoins;

    const history = await WithdrawalRequest.find({
      userId: user._id,
    }).sort({ createdAt: -1 });

    res.json({
      bonusWallet: user.bonusWallet,
      coins: currentCoins,
      coinPrice: coinPrice,
      coinWallet: user.coinWallet || 0,
      taxRate: TAX_RATE,
      dailyLimit,
      withdrawnTodayCoins: user.withdrawalData.withdrawnTodayCoins,
      remaining,
      history,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ADMIN GET ALL WITHDRAWALS
exports.getAllWithdrawals = async (req, res) => {
  try {
    const withdrawals = await WithdrawalRequest.find()
      .populate(
        "userId",
        "name email phone uniqueId bankDetails accountHolderName bankName accountNumber branch ifscCode upiId qrImage"
      )
      .sort({ createdAt: -1 });

    const withdrawalsWithBankDetails = withdrawals.map((request) => {
      const user = request.userId || {};
      const userBankDetails = normalizeBankDetails(user);
      const snapshotBankDetails = normalizeBankDetails(request.bankDetailsSnapshot || {});
      const effectiveBankDetails = hasBankDetails(userBankDetails)
        ? userBankDetails
        : snapshotBankDetails;
      const normalizedRequestUpi = String(request.requestUpiId || "").trim();
      if (normalizedRequestUpi) {
        effectiveBankDetails.upiId = normalizedRequestUpi;
      }

      const requestObj = request.toObject();
      const normalizedUser = requestObj.userId && typeof requestObj.userId === "object"
        ? {
            ...requestObj.userId,
            bankDetails: hasBankDetails(requestObj.userId.bankDetails)
              ? requestObj.userId.bankDetails
              : effectiveBankDetails,
          }
        : requestObj.userId;

      return {
        ...requestObj,
        userId: normalizedUser,
        bankDetails: effectiveBankDetails,
        effectiveBankDetails,
      };
    });

    res.json({ withdrawals: withdrawalsWithBankDetails });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
