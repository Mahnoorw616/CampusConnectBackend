const mongoose = require('mongoose');
const { UNIVERSITY_OPTIONS } = require('../constants/universities');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [80, 'Name cannot exceed 80 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    index: true,
    lowercase: true,
    trim: true,
    match: [EMAIL_PATTERN, 'Please provide a complete and valid email address']
  },
  // Passwords are stored as bcrypt hashes. The raw password policy is
  // validated in authController before hashing.
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  university: {
    type: String,
    required: [true, 'University is required'],
    enum: {
      values: UNIVERSITY_OPTIONS,
      message: 'University must be one of: UOG, ILM, Superior, UOC, Swedish, UOP, or Other'
    }
  },
  batchYear: {
    type: Number,
    required: [true, 'Batch year is required'],
    min: [2000, 'Batch year must be 2000 or later'],
    max: [2100, 'Batch year must be 2100 or earlier']
  },
  whatsappNumber: {
    type: String,
    required: [true, 'WhatsApp number is required'],
    trim: true,
    minlength: [7, 'WhatsApp number is too short'],
    maxlength: [20, 'WhatsApp number is too long']
  },
  bio: {
    type: String,
    trim: true,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: ''
  },
  avatar: {
    type: String,
    trim: true,
    maxlength: [2000, 'Avatar URL cannot exceed 2000 characters'],
    default: ''
  },
  role: {
    type: String,
    enum: ['user', 'moderator', 'admin'],
    default: 'user',
    index: true
  }
}, { timestamps: true, versionKey: false });

userSchema.set('toJSON', { transform: (_document, returnedObject) => { delete returnedObject.password; return returnedObject; } });
module.exports = mongoose.model('User', userSchema);
