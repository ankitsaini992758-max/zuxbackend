const mongoose = require("mongoose");

const coinSettingSchema = new mongoose.Schema(
  {
    coinPrice: { type: Number, required: true },
    activationFee: { type: Number, required: true },
    minYAxis: { type: Number, required: false, default: 1 },
    maxYAxis: { type: Number, required: false, default: 2 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CoinSetting", coinSettingSchema);
