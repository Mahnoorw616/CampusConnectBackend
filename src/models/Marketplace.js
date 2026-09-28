const mongoose = require('mongoose');
const { UNIVERSITY_OPTIONS } = require('../constants/universities');

const marketplaceSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Listing title is required'],
        trim: true,
        minlength: [3, 'Listing title must be at least 3 characters'],
        maxlength: [140, 'Listing title cannot exceed 140 characters']
    },
    courseName: {
        type: String,
        required: [true, 'Course name is required'],
        trim: true,
        minlength: [2, 'Course name must be at least 2 characters'],
        maxlength: [120, 'Course name cannot exceed 120 characters']
    },
    courseCode: {
        type: String,
        required: [true, 'Course code is required'],
        trim: true,
        uppercase: true,
        minlength: [2, 'Course code must be at least 2 characters'],
        maxlength: [30, 'Course code cannot exceed 30 characters']
    },
    pricePKR: {
        type: Number,
        required: [true, 'Price in PKR is required'],
        min: [0, 'Price cannot be negative'],
        max: [100000000, 'Price cannot exceed 100,000,000 PKR']
    },
    universityTag: {
        type: String,
        required: [true, 'University tag is required'],
        enum: {
            values: UNIVERSITY_OPTIONS,
            message:
                'University tag must be one of: UOG, ILM, Superior, UOC, Swedish, UOP, or Other'
        },
        index: true
    },
    sellerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Seller is required'],
        index: true
    },
    description: {
        type: String,
        required: [true, 'Listing description is required'],
        trim: true,
        minlength: [1, 'Listing description cannot be empty'],
        maxlength: [2000, 'Listing description cannot exceed 2000 characters']
    },
    driveLink: {
        type: String,
        default: '',
        trim: true,
        maxlength: [500, 'Google Drive link cannot exceed 500 characters'],
        match: [
            /^(|https:\/\/(drive\.google\.com|docs\.google\.com|sheets\.google\.com|forms\.google\.com)\/.+)$/i,
            'driveLink must be a valid HTTPS Google Drive or Google Docs link'
        ]
    },
    coverImage: {
        type: String,
        default: '',
        trim: true,
        maxlength: [1000, 'Cover image URL cannot exceed 1000 characters']
    }
}, {
    timestamps: true,
    versionKey: false
});

module.exports = mongoose.model('Marketplace', marketplaceSchema);
