// routes/paymentRoutes.js
// === PAYMENT ROUTES - ACTIVATED ===
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const dotenv = require('dotenv');
dotenv.config();
const {
  buildPaymentSignString,
  buildCallbackSignStringCallback,
  md5GbkHex
} = require('../utils/watchpay');
const Order = require('../models/Order');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/authMiddleware');
const { getActivationFee, getCoinPrice } = require('../config/coinConfig');

// === PAYMENT CONFIGURATION AND ROUTES ===
const {
  WATCHPAY_MERCHANT_ID,
  WATCHPAY_KEY,
  WATCHPAY_API_DOMAIN,
  WATCHPAY_PAY_TYPE = '101',
  WATCHPAY_VERSION = '1.0',
  WATCHPAY_NOTIFY_URL
} = process.env;

if (!WATCHPAY_MERCHANT_ID || !WATCHPAY_KEY || !WATCHPAY_API_DOMAIN || !WATCHPAY_NOTIFY_URL) {
  console.warn('WATCHPAY: Missing env variables.');
} else {
  console.log('WATCHPAY: using domain=', WATCHPAY_API_DOMAIN, 'mch=', WATCHPAY_MERCHANT_ID ? 'present' : 'missing');
}

// --------------------- Helper Functions -----------------------

function makeMchOrderNo() {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD${ts}${rand}`;
}

function fmtDate(d) {
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// --------------------- CREATE PAYMENT ORDER --------------------

router.post('/watchpay/create', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user);
    
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    let { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    const mchOrderNo = makeMchOrderNo();

    const order = new Order({
      mchOrderNo,
      user: user._id,
      amount,
      status: 'PENDING'
    });
    await order.save();

    const order_date = fmtDate(new Date());

    const params = {
      version: WATCHPAY_VERSION,
      goods_name: 'ZUX Wallet Recharge',
      mch_id: WATCHPAY_MERCHANT_ID,
      mch_order_no: mchOrderNo,
      notify_url: WATCHPAY_NOTIFY_URL,
      order_date,
      pay_type: WATCHPAY_PAY_TYPE,
      trade_amount: String(amount)
    };

    // Build sign
    const signSource = buildPaymentSignString(params);
    const sign = md5GbkHex(signSource, WATCHPAY_KEY);

    // Raw body, not URL encoded
    const rawBody =
      `goods_name=${params.goods_name}` +
      `&mch_id=${params.mch_id}` +
      `&mch_order_no=${params.mch_order_no}` +
      `&notify_url=${params.notify_url}` +
      `&order_date=${params.order_date}` +
      `&pay_type=${params.pay_type}` +
      `&trade_amount=${params.trade_amount}` +
      `&version=${params.version}` +
      `&sign_type=MD5` +
      `&sign=${sign}`;

    const gatewayDomain = (WATCHPAY_API_DOMAIN || 'https://api.watchglb.com');
    const gatewayUrl = `${gatewayDomain.replace(/\/$/, '')}/pay/web`;

    console.log('WATCHPAY create -> notify_url:', params.notify_url, 'mchOrderNo:', mchOrderNo, 'trade_amount:', params.trade_amount, 'gatewayUrl:', gatewayUrl);

    const gwResp = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0'
      },
      body: rawBody
    });

    const text = await gwResp.text();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    order.respData = parsed || text;
    await order.save();

    if (parsed && parsed.respCode === 'SUCCESS') {
      return res.json({
        ok: true,
        payInfo: parsed.payInfo || null,
        orderId: order._id,
        raw: parsed
      });
    }

    return res.json({ ok: true, html: text, orderId: order._id });

  } catch (err) {
    console.error('watchpay create error', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// --------------------- CALLBACK --------------------

router.post('/watchpay/callback', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const body = req.body || {};

    const signSource = buildCallbackSignStringCallback(body);
    const expected = md5GbkHex(signSource, WATCHPAY_KEY);
    const incoming = (body.sign || '').toLowerCase();

    if (expected !== incoming) {
      console.warn('Callback signature mismatch', { expected, incoming });
      return res.status(400).send('Signature error');
    }

    const mchOrderNo = body.mchOrderNo || body.mch_order_no;
    const tradeResult = String(body.tradeResult || '0');
    const oriAmount = Number(body.oriAmount || body.tradeAmount || 0);

    const order = await Order.findOne({ mchOrderNo });
    if (!order) return res.status(404).send('Order not found');

    if (order.status === 'PAID') return res.send('success');

    if (tradeResult === '1') {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const user = await User.findById(order.user).session(session);
        const add = oriAmount || order.amount;

        if (!user.isActivated) {
          // FULL ACTIVATION PROCESS
          
          // Get total activated users BEFORE activation (exclude admins)
          const userFilter = { $or: [{ role: 'user' }, { role: { $exists: false } }] };
          const totalActiveBefore = await User.countDocuments({
            isActivated: true,
            ...userFilter,
          }).session(session);

          // Assign position
          user.position = totalActiveBefore + 1;
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

          await user.save({ session });

          // Record activation transaction
          await Transaction.create(
            [
              {
                userId: user._id,
                amount: activationFee,
                type: 'activation',
              },
            ],
            { session }
          );

          // DIRECT BONUS - for referrer
          if (user.referredBy) {
            const referrer = await User.findById(user.referredBy).session(session);
            if (referrer && (referrer.role === 'user' || !referrer.role)) {
              referrer.bonusWallet += 2500;
              await referrer.save({ session });

              await Transaction.create(
                [
                  {
                    userId: referrer._id,
                    amount: 2500,
                    type: 'direct_bonus',
                    fromUser: user._id,
                  },
                ],
                { session }
              );
            }
          }

          // MILESTONE BONUSES
          const totalActive = totalActiveBefore + 1;

          const checkMilestone = async (level, amount, field) => {
            const targetPosition = totalActive - level;
            if (targetPosition <= 0) return;

            const milestoneUser = await User.findOne({
              position: targetPosition,
              isActivated: true,
              $or: [{ role: 'user' }, { role: { $exists: false } }],
            }).session(session);

            if (milestoneUser && !milestoneUser.milestones[field]) {
              milestoneUser.bonusWallet += amount;
              milestoneUser.milestones[field] = true;
              await milestoneUser.save({ session });

              await Transaction.create(
                [
                  {
                    userId: milestoneUser._id,
                    amount: amount,
                    type: 'milestone_bonus',
                    milestoneLevel: level,
                  },
                ],
                { session }
              );
            }
          };

          await checkMilestone(50, 500, 'm50');
          await checkMilestone(100, 1000, 'm100');
          await checkMilestone(250, 3500, 'm250');
          await checkMilestone(500, 7500, 'm500');
          await checkMilestone(1000, 15000, 'm1000');
          await checkMilestone(2500, 40000, 'm2500');

          console.log('User activated via payment:', user.email, 'position:', user.position);
        } else {
          // User already activated - add to bonus wallet
          user.bonusWallet = (user.bonusWallet || 0) + add;
          await user.save({ session });

          await Transaction.create(
            [
              {
                userId: user._id,
                amount: add,
                type: 'bonus_payment',
              },
            ],
            { session }
          );

          console.log('Bonus added to existing user:', user.email, 'amount:', add);
        }

        order.status = 'PAID';
        order.gatewayOrderNo = body.orderNo || null;
        order.respData = body;
        await order.save({ session });

        await session.commitTransaction();
      } catch (e) {
        await session.abortTransaction();
        console.error('Callback processing failed', e);
        return res.status(500).send('Server error');
      } finally {
        session.endSession();
      }

      return res.send('success');
    }

    order.status = 'FAILED';
    order.respData = body;
    await order.save();
    return res.send('success');

  } catch (err) {
    console.error('watchpay callback error', err);
    res.status(500).send('Server error');
  }
});

// --------------------- ORDER STATUS --------------------

router.get('/watchpay/status/:orderId', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    
    // Check if user owns this order
    if (order.user.toString() !== req.user.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    return res.json({ ok: true, status: order.status, order });
  } catch (err) {
    console.error('watchpay status error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
