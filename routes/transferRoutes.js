const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const transferController = require("../controllers/transferController");

// Create transfer request
router.post("/request", authMiddleware, transferController.createTransferRequest);

// Get pending requests for recipient
router.get("/pending", authMiddleware, transferController.getPendingRequests);

// Approve transfer
router.post("/approve", authMiddleware, transferController.approveTransfer);

// Approve transfer with payment
router.post(
  "/approve-with-payment",
  authMiddleware,
  transferController.approveTransferWithPayment
);

// Reject transfer
router.post("/reject", authMiddleware, transferController.rejectTransfer);

// Get transfer history
router.get("/history", authMiddleware, transferController.getTransferHistory);

module.exports = router;
