const User = require("../models/User");
const { getCoinPrice } = require("../config/coinConfig");

const DEFAULT_LIMIT = 100;

const parsePagination = (req) => {
	const page = Math.max(parseInt(req.query.page || "1", 10), 1);
	const limit = Math.min(
		Math.max(parseInt(req.query.limit || String(DEFAULT_LIMIT), 10), 1),
		500
	);
	const skip = (page - 1) * limit;
	return { page, limit, skip };
};

const selectFields =
	"name email uniqueId referralCode position isActivated bonusWallet walletBalance coinWallet createdAt referredBy coins";

const mapUser = (user) => {
	const coins = user.coinWallet || 0;

	return ({
	_id: user._id,
	name: user.name,
	email: user.email,
	uniqueId: user.uniqueId,
	referralCode: user.referralCode,
	position: user.position,
	isActivated: user.isActivated,
	walletBalance: user.walletBalance ?? user.bonusWallet ?? 0,
	bonusWallet: user.bonusWallet ?? 0,
	coins: coins,
	coinWallet: coins,
	referredBy: user.referredBy
		? {
				name: user.referredBy.name,
				email: user.referredBy.email,
				referralCode: user.referredBy.referralCode,
		  }
		: null,
	createdAt: user.createdAt,
});
};

// GET /api/admin/genealogy
exports.getAdminGenealogy = async (req, res) => {
	try {
		const { page, limit, skip } = parsePagination(req);
		const search = (req.query.q || "").trim();

		const query = { role: { $ne: "admin" } };
		if (search) {
			const regex = new RegExp(search, "i");
			query.$or = [{ email: regex }, { referralCode: regex }];
		}

		const total = await User.countDocuments(query);
		const users = await User.find(query)
			.select(selectFields)
			.populate("referredBy", "name email referralCode")
			.sort({ position: 1, createdAt: 1 })
			.skip(skip)
			.limit(limit)
			.lean();

		res.json({
			success: true,
			page,
			limit,
			total,
			totalPages: Math.max(Math.ceil(total / limit), 1),
			users: users.map(mapUser),
		});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// GET /api/user/genealogy
exports.getUserGenealogy = async (req, res) => {
	try {
		const { page, limit, skip } = parsePagination(req);
		const search = (req.query.q || "").trim();

		const currentUser = await User.findById(req.user).select("position");
		if (!currentUser) {
			return res.status(404).json({ message: "User not found" });
		}

		if (currentUser.position === null || currentUser.position === undefined) {
			return res.status(400).json({ message: "User position not assigned" });
		}

		const query = {
			role: { $ne: "admin" },
			position: { $gte: currentUser.position },
		};

		if (search) {
			const regex = new RegExp(search, "i");
			query.$or = [
				{ email: regex },
				{ name: regex },
				{ referralCode: regex },
			];
		}

		const total = await User.countDocuments(query);
		const users = await User.find(query)
			.select(selectFields)
			.populate("referredBy", "name email referralCode")
			.sort({ position: 1, createdAt: 1 })
			.skip(skip)
			.limit(limit)
			.lean();

		res.json({
			success: true,
			page,
			limit,
			total,
			totalPages: Math.max(Math.ceil(total / limit), 1),
			startPosition: currentUser.position,
			currentUserId: currentUser._id,
			users: users.map(mapUser),
		});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// GET /api/user/genealogy/search - Search suggestions for user genealogy
exports.getUserGenealogySearch = async (req, res) => {
	try {
		const search = (req.query.q || "").trim();
		
		if (search.length < 2) {
			return res.json([]);
		}

		const currentUser = await User.findById(req.user).select("position");
		if (!currentUser || currentUser.position === null || currentUser.position === undefined) {
			return res.json([]);
		}

		const regex = new RegExp(search, "i");
		const query = {
			role: { $ne: "admin" },
			position: { $gte: currentUser.position },
			$or: [
				{ email: regex },
				{ name: regex },
				{ referralCode: regex },
			],
		};

		const suggestions = await User.find(query)
			.select(selectFields)
			.populate("referredBy", "name email referralCode")
			.sort({ position: 1, createdAt: 1 })
			.limit(10)
			.lean();

		res.json(suggestions.map(mapUser));
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// GET /api/admin/genealogy/search - Search suggestions for admin genealogy
exports.getAdminGenealogySearch = async (req, res) => {
	try {
		const search = (req.query.q || "").trim();
		
		if (search.length < 2) {
			return res.json([]);
		}

		const regex = new RegExp(search, "i");
		const query = {
			role: { $ne: "admin" },
			$or: [
				{ email: regex },
				{ name: regex },
				{ referralCode: regex },
			],
		};

		const suggestions = await User.find(query)
			.select(selectFields)
			.populate("referredBy", "name email referralCode")
			.sort({ position: 1, createdAt: 1 })
			.limit(10)
			.lean();

		res.json(suggestions.map(mapUser));
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
