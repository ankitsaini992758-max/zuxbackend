const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const admin = require("../middleware/AdminMiddleware");
const { getAdminGenealogy, getAdminGenealogySearch } = require("../controllers/genealogyController");
const {
	getRevenueChart,
	getAdminStats,
	getUsers,
	updateUserWallet,
	updateUserPassword,
	deleteUser,
	getCoinPrice,
	updateCoinPrice,
	getActivationFee,
	updateActivationFee,
	getYAxisRange,
	updateYAxisRange,
} = require("../controllers/adminController");

router.get("/stats", auth, admin, getAdminStats);
router.get("/revenue-chart", auth, admin, getRevenueChart);
router.get("/users", auth, admin, getUsers);
router.patch("/users/:id/wallet", auth, admin, updateUserWallet);
router.patch("/users/:id/password", auth, admin, updateUserPassword);
router.delete("/users/:id", auth, admin, deleteUser);
router.get("/coin-price", auth, admin, getCoinPrice);
router.patch("/coin-price", auth, admin, updateCoinPrice);
router.get("/activation-fee", auth, admin, getActivationFee);
router.patch("/activation-fee", auth, admin, updateActivationFee);
router.get("/y-axis-range", auth, admin, getYAxisRange);
router.patch("/y-axis-range", auth, admin, updateYAxisRange);
router.get("/genealogy/search", auth, admin, getAdminGenealogySearch);
router.get("/genealogy", auth, admin, getAdminGenealogy);
module.exports = router;
