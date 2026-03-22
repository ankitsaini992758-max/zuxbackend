const { getCoinPrice, getYAxisRange, getActivationFee } = require("../config/coinConfig");

exports.getPublicCoinPrice = async (req, res) => {
  try {
    const coinPrice = getCoinPrice();
    res.json({ coinPrice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getPublicYAxisRange = async (req, res) => {
  try {
    const yAxisRange = getYAxisRange();
    res.json(yAxisRange);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getPublicActivationFee = async (req, res) => {
  try {
    const activationFee = getActivationFee();
    res.json({ activationFee });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
