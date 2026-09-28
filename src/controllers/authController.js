const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { UNIVERSITY_OPTIONS } = require('../constants/universities');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d\s])\S{8,}$/;

const PASSWORD_REQUIREMENTS =
  'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.';

const createToken = (userId) => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured. Add it to your .env file.');
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
};

const publicUser = (user) => ({
  id: user._id.toString(), name: user.name, email: user.email, university: user.university,
  batchYear: user.batchYear, whatsappNumber: user.whatsappNumber, createdAt: user.createdAt
});

const validateEmail = (email) => EMAIL_PATTERN.test(String(email).trim());

const validatePassword = (password) =>
  PASSWORD_PATTERN.test(String(password));

const register = async (req, res, next) => {
  try {
    const { name, email, password, university, batchYear, whatsappNumber } = req.body;
    if (!name || !email || !password || !university || batchYear === undefined || !whatsappNumber) {
      return res.status(400).json({ success: false, message: 'name, email, password, university, batchYear, and whatsappNumber are required' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a complete and valid email address, for example student@uog.edu.pk'
      });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        success: false,
        message: PASSWORD_REQUIREMENTS
      });
    }

    const normalizedName = String(name).trim();
    const normalizedUniversity = String(university).trim();
    const normalizedBatchYear = Number(batchYear);
    const normalizedWhatsapp = String(whatsappNumber).trim();

    if (normalizedName.length < 2 || normalizedName.length > 80) {
      return res.status(400).json({
        success: false,
        message: 'Name must be between 2 and 80 characters'
      });
    }

    if (!UNIVERSITY_OPTIONS.includes(normalizedUniversity)) {
      return res.status(400).json({
        success: false,
        message: `University must be one of: ${UNIVERSITY_OPTIONS.join(', ')}`
      });
    }

    if (!Number.isInteger(normalizedBatchYear) || normalizedBatchYear < 2000 || normalizedBatchYear > 2100) {
      return res.status(400).json({
        success: false,
        message: 'Batch year must be an integer between 2000 and 2100'
      });
    }

    if (!/^[0-9+\-\s()]{7,20}$/.test(normalizedWhatsapp)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid WhatsApp number'
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }
    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      password: await bcrypt.hash(String(password), 12),
      university: normalizedUniversity,
      batchYear: normalizedBatchYear,
      whatsappNumber: normalizedWhatsapp
    });
    return res.status(201).json({ success: true, message: 'Registration successful', token: createToken(user._id.toString()), user: publicUser(user) });
  } catch (error) { return next(error); }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a complete and valid email address'
      });
    }

    const user = await User.findOne({
      email: String(email).trim().toLowerCase()
    }).select('+password');

    const passwordMatches = user && await bcrypt.compare(String(password), user.password);
    if (!passwordMatches) return res.status(401).json({ success: false, message: 'Invalid email or password' });
    return res.status(200).json({ success: true, message: 'Login successful', token: createToken(user._id.toString()), user: publicUser(user) });
  } catch (error) { return next(error); }
};

module.exports = { register, login };