const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Generate random referral code
const generateReferralCode = () => {
  return (
    "ZUX" +
    Math.random().toString(36).substring(2, 8).toUpperCase()
  );
};

const generateUniqueId = () => {
  const number = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `ZUX${number}`;
};

const assignUniqueId = async (user) => {
  if (user.uniqueId) return;
  let isUnique = false;
  let newId;

  while (!isUnique) {
    newId = generateUniqueId();
    const existing = await User.findOne({ uniqueId: newId });
    if (!existing) isUnique = true;
  }

  user.uniqueId = newId;
};

exports.register = async (req, res) => {
  try {
    const { name, email, password, referralCode } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already exists" });

    const hashed = await bcrypt.hash(password, 10);

    let referrerUser = null;

    if (referralCode) {
      referrerUser = await User.findOne({ referralCode });
      if (!referrerUser)
        return res.status(400).json({ message: "Invalid referral code" });
    }

    let newReferralCode;
    let isUnique = false;

    while (!isUnique) {
      newReferralCode = generateReferralCode();
      const existingCode = await User.findOne({
        referralCode: newReferralCode,
      });
      if (!existingCode) isUnique = true;
    }

    const lastUser = await User.findOne({ role: { $ne: "admin" } })
      .sort({ position: -1 })
      .select("position");
    const nextPosition = (lastUser?.position || 0) + 1;

    const user = new User({
      name,
      email,
      password: hashed,
      referralCode: newReferralCode,
      referredBy: referrerUser ? referrerUser._id : null,
      position: nextPosition,
    });

    await assignUniqueId(user);
    await user.save();

    res.status(201).json({ message: "User Registered" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user)
      return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
