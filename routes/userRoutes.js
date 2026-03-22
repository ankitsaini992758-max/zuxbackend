const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { getProfile } = require("../controllers/userController");
const { getDashboardData, getTransactions, updateBankDetails } = require("../controllers/userController");
const { getUserGenealogy, getUserGenealogySearch } = require("../controllers/genealogyController");

// Auto-activation removed - activation now requires payment via payment gateway
router.get("/profile", auth, getProfile);
router.get("/dashboard", auth, getDashboardData);
router.get("/transactions", auth, getTransactions);
router.put("/bank-details", auth, updateBankDetails);
router.get("/genealogy/search", auth, getUserGenealogySearch);
router.get("/genealogy", auth, getUserGenealogy);
module.exports = router;
