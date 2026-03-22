const User = require("../models/User");
const CoinTransferRequest = require("../models/CoinTransferRequest");
const Transaction = require("../models/Transaction");
const Order = require("../models/Order");
const { getCoinPrice } = require("../config/coinConfig");

// CREATE TRANSFER REQUEST
exports.createTransferRequest = async (req, res) => {
  try {
    const { recipientUniqueId, coinAmount } = req.body;

    const sender = await User.findById(req.user);
    if (!sender || !sender.isActivated) {
      return res.status(400).json({ message: "Invalid sender account" });
    }

    // Validate coin amount
    const coins = Number(coinAmount);
    if (!Number.isFinite(coins) || coins <= 0) {
      return res.status(400).json({ message: "Coin amount must be greater than 0" });
    }

    // Find recipient by unique ID
    const recipient = await User.findOne({ uniqueId: recipientUniqueId });
    if (!recipient) {
      return res
        .status(404)
        .json({ message: "Recipient with this ID not found" });
    }

    // Prevent self-transfer
    if (sender._id.toString() === recipient._id.toString()) {
      return res
        .status(400)
        .json({ message: "You cannot send coins to yourself" });
    }

    // Check sender has sufficient coins
    const senderCoins = sender.coinWallet || 0;
    if (coins > senderCoins) {
      return res.status(400).json({
        message: `Insufficient coins. You have ${senderCoins.toFixed(2)} coins`,
      });
    }

    // Check if a pending request already exists from this sender to this recipient
    const existingPending = await CoinTransferRequest.findOne({
      fromUserId: sender._id,
      toUserId: recipient._id,
      status: "pending",
    });

    if (existingPending) {
      return res.status(400).json({
        message: "You already have a pending transfer request to this user",
      });
    }

    const transferRequest = await CoinTransferRequest.create({
      fromUserId: sender._id,
      toUserId: recipient._id,
      fromUniqueId: sender.uniqueId,
      toUniqueId: recipient.uniqueId,
      coinAmount: coins,
      status: "pending",
    });

    res.json({
      message: "Transfer request sent successfully",
      request: transferRequest,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET PENDING TRANSFER REQUESTS FOR RECIPIENT
exports.getPendingRequests = async (req, res) => {
  try {
    const user = await User.findById(req.user);
    if (!user) {
      return res.status(400).json({ message: "Invalid user" });
    }

    const requests = await CoinTransferRequest.find({
      toUserId: user._id,
      status: "pending",
    })
      .populate("fromUserId", "uniqueId")
      .sort({ createdAt: -1 });

    res.json({
      requests,
      count: requests.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// APPROVE TRANSFER REQUEST
exports.approveTransfer = async (req, res) => {
  try {
    const { transferId } = req.body;

    const transferRequest = await CoinTransferRequest.findById(transferId);
    if (!transferRequest) {
      return res.status(404).json({ message: "Transfer request not found" });
    }

    const user = await User.findById(req.user);
    if (!user) {
      return res.status(400).json({ message: "Invalid user" });
    }

    // Verify user is the recipient
    if (transferRequest.toUserId.toString() !== user._id.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to approve this request" });
    }

    if (transferRequest.status !== "pending") {
      return res
        .status(400)
        .json({ message: `Request is already ${transferRequest.status}` });
    }

    // Get sender and verify they still have coins
    const sender = await User.findById(transferRequest.fromUserId);
    if (!sender) {
      return res.status(404).json({ message: "Sender account not found" });
    }

    const coinPrice = getCoinPrice();
    const senderCoins = sender.coinWallet || 0;
    if (senderCoins < transferRequest.coinAmount) {
      return res.status(400).json({
        message: "Sender no longer has sufficient coins to complete this transfer",
      });
    }

    // Calculate transfer amount
    const transferValue = transferRequest.coinAmount * coinPrice;

    // SENDER SIDE
    // Deduct coins from sender's coin wallet
    sender.coinWallet = Math.max(0, (sender.coinWallet || 0) - transferRequest.coinAmount);

    // Credit transfer value to sender's bonus wallet (as payment)
    sender.bonusWallet = (sender.bonusWallet || 0) + transferValue;
    await sender.save();

    // RECEIVER SIDE
    // Add coins to receiver's coin wallet
    user.coinWallet = (user.coinWallet || 0) + transferRequest.coinAmount;
    await user.save();

    // Update transfer status
    transferRequest.status = "approved";
    await transferRequest.save();

    // Create transaction records for sender
    await Transaction.create({
      userId: sender._id,
      type: "coin_transfer_sent",
      amount: transferRequest.coinAmount,
      description: `Sent ${transferRequest.coinAmount.toFixed(2)} coins to ${transferRequest.toUniqueId}`,
      relatedTransferId: transferRequest._id,
    });

    await Transaction.create({
      userId: sender._id,
      type: "transfer_bonus",
      amount: transferValue,
      description: `Received ₹${transferValue.toFixed(2)} bonus from transfer payment`,
      relatedTransferId: transferRequest._id,
    });

    // Create transaction record for recipient
    await Transaction.create({
      userId: user._id,
      type: "coin_transfer_received",
      amount: transferRequest.coinAmount,
      description: `Received ${transferRequest.coinAmount.toFixed(2)} coins from ${transferRequest.fromUniqueId}`,
      relatedTransferId: transferRequest._id,
    });

    res.json({
      message: "Transfer approved successfully",
      request: transferRequest,
      newBalance: user.coinWallet || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// REJECT TRANSFER REQUEST
exports.rejectTransfer = async (req, res) => {
  try {
    const { transferId, reason } = req.body;

    const transferRequest = await CoinTransferRequest.findById(transferId);
    if (!transferRequest) {
      return res.status(404).json({ message: "Transfer request not found" });
    }

    const user = await User.findById(req.user);
    if (!user) {
      return res.status(400).json({ message: "Invalid user" });
    }

    // Verify user is the recipient
    if (transferRequest.toUserId.toString() !== user._id.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to reject this request" });
    }

    if (transferRequest.status !== "pending") {
      return res
        .status(400)
        .json({ message: `Request is already ${transferRequest.status}` });
    }

    // Update transfer status
    transferRequest.status = "rejected";
    transferRequest.rejectionReason = reason || null;
    await transferRequest.save();

    res.json({
      message: "Transfer request rejected",
      request: transferRequest,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET TRANSFER HISTORY (sent and received)
exports.getTransferHistory = async (req, res) => {
  try {
    const user = await User.findById(req.user);
    if (!user) {
      return res.status(400).json({ message: "Invalid user" });
    }

    // Get all transfers (sent and received)
    const transfers = await CoinTransferRequest.find({
      $or: [
        { fromUserId: user._id },
        { toUserId: user._id },
      ],
    })
      .populate("fromUserId", "uniqueId")
      .populate("toUserId", "uniqueId")
      .sort({ createdAt: -1 });

    // Categorize into sent and received
    const sent = transfers.filter(
      (t) => t.fromUserId._id.toString() === user._id.toString()
    );
    const received = transfers.filter(
      (t) => t.toUserId._id.toString() === user._id.toString()
    );

    res.json({
      sent,
      received,
      total: transfers.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// APPROVE TRANSFER WITH PAYMENT
// Verifies payment was completed, then processes the coin transfer
exports.approveTransferWithPayment = async (req, res) => {
  try {
    const { transferId, paymentOrderId } = req.body;

    const transferRequest = await CoinTransferRequest.findById(transferId);
    if (!transferRequest) {
      return res.status(404).json({ message: "Transfer request not found" });
    }

    const user = await User.findById(req.user);
    if (!user) {
      return res.status(400).json({ message: "Invalid user" });
    }

    // Verify user is the recipient
    if (transferRequest.toUserId.toString() !== user._id.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to approve this request" });
    }

    if (transferRequest.status !== "pending") {
      return res
        .status(400)
        .json({ message: `Request is already ${transferRequest.status}` });
    }

    // Verify payment was successful
    const payment = await Order.findById(paymentOrderId);
    if (!payment || payment.status !== "PAID") {
      return res.status(400).json({ message: "Payment not completed or not found" });
    }

    // Get sender and verify they still have coins
    const sender = await User.findById(transferRequest.fromUserId);
    if (!sender) {
      return res.status(404).json({ message: "Sender account not found" });
    }

    const coinPrice = getCoinPrice();
    const senderCoins = sender.coinWallet || 0;
    if (senderCoins < transferRequest.coinAmount) {
      return res.status(400).json({
        message: "Sender no longer has sufficient coins to complete this transfer",
      });
    }

    // CALCULATE TRANSFER AMOUNT
    const transferValue = transferRequest.coinAmount * coinPrice;

    // SENDER SIDE
    // Deduct coins from sender's coin wallet
    sender.coinWallet = Math.max(0, (sender.coinWallet || 0) - transferRequest.coinAmount);

    // Add transfer value to sender's bonus wallet
    sender.bonusWallet = (sender.bonusWallet || 0) + transferValue;
    await sender.save();

    // RECEIVER SIDE
    // Add coins to receiver's coin wallet
    user.coinWallet = (user.coinWallet || 0) + transferRequest.coinAmount;
    await user.save();

    // UPDATE TRANSFER STATUS
    transferRequest.status = "approved";
    await transferRequest.save();

    // CREATE TRANSACTION RECORDS
    // Sender: coins sent (deduction)
    await Transaction.create({
      userId: sender._id,
      type: "coin_transfer_sent",
      amount: transferRequest.coinAmount,
      description: `Sent ${transferRequest.coinAmount.toFixed(2)} coins to ${transferRequest.toUniqueId}`,
      relatedTransferId: transferRequest._id,
    });

    // Sender: bonus received from payment
    await Transaction.create({
      userId: sender._id,
      type: "transfer_bonus",
      amount: transferValue,
      description: `Received ₹${transferValue.toFixed(2)} bonus from transfer payment`,
      relatedTransferId: transferRequest._id,
    });

    // Recipient: coins received
    await Transaction.create({
      userId: user._id,
      type: "coin_transfer_received",
      amount: transferRequest.coinAmount,
      description: `Received ${transferRequest.coinAmount.toFixed(2)} coins from ${transferRequest.fromUniqueId}`,
      relatedTransferId: transferRequest._id,
    });

    res.json({
      message: "Transfer approved successfully with payment",
      request: transferRequest,
      paymentAmount: transferValue,
      newBalance: user.coinWallet || 0,
      senderBonus: sender.bonusWallet,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
