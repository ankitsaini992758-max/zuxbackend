const router = require("express").Router();
const { getPublicCoinPrice, getPublicYAxisRange, getPublicActivationFee } = require("../controllers/coinController");

router.get("/coin-price", getPublicCoinPrice);
router.get("/y-axis-range", getPublicYAxisRange);
router.get("/activation-fee", getPublicActivationFee);

module.exports = router;
