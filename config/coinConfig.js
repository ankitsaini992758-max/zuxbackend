/**
 * COIN PRICE CONFIGURATION
 * 
 * This file controls the coin price for the entire system.
 * Coins are calculated from activation coin balance.
 * 
 * Formula: rupeeValue = coinAmount * COIN_PRICE
 * 
 * Examples:
 * - COIN_PRICE = 1: ₹7200 wallet = 7200 coins
 * - COIN_PRICE = 2: ₹7200 wallet = 3600 coins
 * - COIN_PRICE = 0.5: ₹7200 wallet = 14400 coins
 * 
 * IMPORTANT: Changing this value affects rupee value of coin withdrawals.
 * 
 * No database migration needed - coins are calculated in real-time!
 */

let COIN_PRICE = 1; // 1 coin = ₹1 (default)
let ACTIVATION_FEE = 7200; // default activation fee in INR
let MIN_Y_AXIS = 1; // default minimum y-axis value
let MAX_Y_AXIS = 2; // default maximum y-axis value

const loadCoinPrice = async () => {
  try {
    const CoinSetting = require("../models/CoinSetting");
    const setting = await CoinSetting.findOne();
    if (setting) {
      if (Number.isFinite(setting.coinPrice)) {
        COIN_PRICE = setting.coinPrice;
      }
      if (Number.isFinite(setting.activationFee)) {
        ACTIVATION_FEE = setting.activationFee;
      }
      if (Number.isFinite(setting.minYAxis)) {
        MIN_Y_AXIS = setting.minYAxis;
      }
      if (Number.isFinite(setting.maxYAxis)) {
        MAX_Y_AXIS = setting.maxYAxis;
      }
      return COIN_PRICE;
    }

    const created = await CoinSetting.create({
      coinPrice: COIN_PRICE,
      activationFee: ACTIVATION_FEE,
      minYAxis: MIN_Y_AXIS,
      maxYAxis: MAX_Y_AXIS,
    });
    COIN_PRICE = created.coinPrice;
    ACTIVATION_FEE = created.activationFee;
    MIN_Y_AXIS = created.minYAxis;
    MAX_Y_AXIS = created.maxYAxis;
    return COIN_PRICE;
  } catch (err) {
    return COIN_PRICE;
  }
};

const getCoinPrice = () => COIN_PRICE;
const getActivationFee = () => ACTIVATION_FEE;
const getMinYAxis = () => MIN_Y_AXIS;
const getMaxYAxis = () => MAX_Y_AXIS;

const getYAxisRange = () => ({
  minYAxis: MIN_Y_AXIS,
  maxYAxis: MAX_Y_AXIS,
});

const setCoinPrice = async (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new Error("Coin price must be a positive number");
  }

  const CoinSetting = require("../models/CoinSetting");
  const updated = await CoinSetting.findOneAndUpdate(
    {},
    { coinPrice: numericValue },
    { new: true, upsert: true }
  );

  COIN_PRICE = updated.coinPrice;
  return COIN_PRICE;
};

const setActivationFee = async (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new Error("Activation fee must be a positive number");
  }

  const CoinSetting = require("../models/CoinSetting");
  const updated = await CoinSetting.findOneAndUpdate(
    {},
    { activationFee: numericValue },
    { new: true, upsert: true }
  );

  ACTIVATION_FEE = updated.activationFee;
  return ACTIVATION_FEE;
};

const setYAxisRange = async (minValue, maxValue) => {
  const minNum = Number(minValue);
  const maxNum = Number(maxValue);
  
  if (!Number.isFinite(minNum) || !Number.isFinite(maxNum)) {
    throw new Error("Y-axis range values must be valid numbers");
  }
  
  if (minNum >= maxNum) {
    throw new Error("Minimum Y-axis value must be less than maximum");
  }

  const CoinSetting = require("../models/CoinSetting");
  const updated = await CoinSetting.findOneAndUpdate(
    {},
    { minYAxis: minNum, maxYAxis: maxNum },
    { new: true, upsert: true }
  );

  MIN_Y_AXIS = updated.minYAxis;
  MAX_Y_AXIS = updated.maxYAxis;
  return getYAxisRange();
};

module.exports = {
  getCoinPrice,
  getActivationFee,
  setCoinPrice,
  setActivationFee,
  getMinYAxis,
  getMaxYAxis,
  getYAxisRange,
  setYAxisRange,
  loadCoinPrice,
};
