const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const admin = require("../middleware/AdminMiddleware");
const {
  createWithdrawalRequest,
  createBonusWithdrawalRequest,
  approveWithdrawal,
  getWithdrawalInfo,
  rejectWithdrawal,
    getAllWithdrawals
} = require("../controllers/WithdrawalController");

router.get("/info", auth, getWithdrawalInfo);
router.post("/request", auth, createWithdrawalRequest);
router.post("/bonus-request", auth, createBonusWithdrawalRequest);
router.post("/approve", auth, admin, approveWithdrawal);
router.post("/reject", auth, admin, rejectWithdrawal);
router.get("/all", auth, admin, getAllWithdrawals);

module.exports = router;
