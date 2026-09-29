const mongoose = require('mongoose');
const Marketplace = require('../models/Marketplace');
const User = require('../models/User');
const Notification = require('../models/Notifications');
const { UNIVERSITY_OPTIONS } = require('../constants/universities');
const {
    normalizeMediaValue,
    deleteMediaById
} = require('../config/mediaStore');

const GOOGLE_DRIVE_HOSTS = new Set([
    'drive.google.com',
    'docs.google.com',
    'sheets.google.com',
    'forms.google.com'
]);

const isValidGoogleDriveLink = (value) => {
    try {
        const parsedUrl = new URL(String(value));

        return (
            parsedUrl.protocol === 'https:' &&
            GOOGLE_DRIVE_HOSTS.has(parsedUrl.hostname.toLowerCase())
        );
    } catch (_error) {
        return false;
    }
};

const populateListing = (query) =>
    query.populate(
        'sellerId',
        'name email university batchYear whatsappNumber'
    );

const getPagination = (query) => {
    const requestedPage = Number.parseInt(query.page, 10);
    const requestedLimit = Number.parseInt(query.limit, 10);
    const page = Number.isInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 20;

    return { page, limit, skip: (page - 1) * limit };
};

const getRequestOrigin = (req) =>
    (process.env.PUBLIC_API_ORIGIN || `${req.protocol}://${req.get('host')}`)
        .replace(/\/+$/, '');

const extractStoredMediaId = (mediaUrl) => {
    const match = String(mediaUrl || '').match(/\/api\/media\/([a-f0-9]{24})$/i);
    return match ? match[1] : '';
};

const serializeListing = (listing, viewerId) => {
    const returnedListing = listing.toObject();

    returnedListing.isOwner = Boolean(
        viewerId &&
        listing.sellerId &&
        listing.sellerId._id &&
        listing.sellerId._id.toString() === viewerId.toString()
    );

    return returnedListing;
};

const notifyUniversityStudents = async ({ university, sellerId, listingId, title, sellerName }) => {
    try {
        const recipients = await User.find({
            university,
            _id: { $ne: sellerId }
        }).select('_id').lean();

        if (!recipients.length) return 0;

        const notificationDocuments = recipients.map((recipient) => ({
            recipient: recipient._id,
            sender: sellerId,
            type: 'MARKETPLACE',
            message: `${sellerName || 'A student'} listed a new study resource: ${title}`,
            marketplace: listingId
        }));

        const createdNotifications = await Notification.insertMany(
            notificationDocuments,
            { ordered: true }
        );
        return createdNotifications.length;
    } catch (error) {
        console.error('Could not create marketplace notifications:', error);
        return 0;
    }
};

const getListings = async (req, res, next) => {
    try {
        const university = req.query.uni
            ? String(req.query.uni).trim()
            : '';
        const type = req.query.type
            ? String(req.query.type).trim()
            : 'all';
        const search = req.query.q
            ? String(req.query.q).trim()
            : '';

        const filter = {};
        const { page, limit, skip } = getPagination(req.query);

        if (university) {
            if (!UNIVERSITY_OPTIONS.includes(university)) {
                return res.status(400).json({
                    success: false,
                    message: `uni must be one of: ${UNIVERSITY_OPTIONS.join(', ')}`
                });
            }

            filter.universityTag = university;
        }

        if (!['all', 'free', 'paid'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'type must be one of: all, free, paid'
            });
        }

        if (type === 'free') filter.pricePKR = 0;
        if (type === 'paid') filter.pricePKR = { $gt: 0 };

        if (search) {
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchPattern = new RegExp(escapedSearch, 'i');
            filter.$or = [
                { title: searchPattern },
                { courseName: searchPattern },
                { courseCode: searchPattern }
            ];
        }

        const [listings, total] = await Promise.all([
            populateListing(
                Marketplace.find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
            ),
            Marketplace.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            count: listings.length,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
            listings: listings.map((listing) =>
                serializeListing(listing, req.user._id)
            )
        });
    } catch (error) {
        return next(error);
    }
};

const createListing = async (req, res, next) => {
    try {
        const {
            title,
            courseName,
            courseCode,
            pricePKR,
            universityTag,
            driveLink,
            description,
            coverImage
        } = req.body;

        if (
            !title ||
            !courseName ||
            !courseCode ||
            pricePKR === undefined ||
            pricePKR === null ||
            pricePKR === '' ||
            (typeof pricePKR === 'string' && !pricePKR.trim()) ||
            !universityTag ||
            !description
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'title, courseName, courseCode, pricePKR, universityTag, and description are required'
            });
        }

        const numericPrice = Number(pricePKR);

        if (!Number.isFinite(numericPrice) || numericPrice < 0) {
            return res.status(400).json({
                success: false,
                message: 'pricePKR must be a non-negative number'
            });
        }

        const normalizedUniversity = String(universityTag).trim();

        if (!UNIVERSITY_OPTIONS.includes(normalizedUniversity)) {
            return res.status(400).json({
                success: false,
                message: `universityTag must be one of: ${UNIVERSITY_OPTIONS.join(', ')}`
            });
        }

        const normalizedDriveLink = driveLink
            ? String(driveLink).trim()
            : '';

        if (
            normalizedDriveLink &&
            !isValidGoogleDriveLink(normalizedDriveLink)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'driveLink must be a valid HTTPS Google Drive or Google Docs link'
            });
        }

        const normalizedCoverImage = await normalizeMediaValue({
            value: coverImage,
            kind: 'marketplace',
            requestOrigin: getRequestOrigin(req)
        });

        const listing = await Marketplace.create({
            title: String(title).trim(),
            courseName: String(courseName).trim(),
            courseCode: String(courseCode).trim().toUpperCase(),
            pricePKR: numericPrice,
            universityTag: normalizedUniversity,
            sellerId: req.user._id,
            description: String(description).trim(),
            driveLink: normalizedDriveLink,
            coverImage: normalizedCoverImage
        });

        const populatedListing = await populateListing(
            Marketplace.findById(listing._id)
        );

        const notifiedCount = await notifyUniversityStudents({
            university: normalizedUniversity,
            sellerId: req.user._id,
            listingId: listing._id,
            title: listing.title,
            sellerName: req.user.name
        });

        return res.status(201).json({
            success: true,
            message: 'Marketplace listing created successfully',
            notifiedCount,
            listing: serializeListing(
                await populatedListing,
                req.user._id
            )
        });
    } catch (error) {
        return next(error);
    }
};

const deleteListing = async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid marketplace listing ID'
            });
        }

        const listing = await Marketplace.findById(req.params.id);

        if (!listing) {
            return res.status(404).json({
                success: false,
                message: 'Marketplace listing not found'
            });
        }

        if (listing.sellerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete your own marketplace listings'
            });
        }

        await Marketplace.findByIdAndDelete(listing._id);
        const mediaId = extractStoredMediaId(listing.coverImage);
        if (mediaId) await deleteMediaById(mediaId);

        return res.status(200).json({
            success: true,
            message: 'Marketplace listing deleted successfully'
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getListings,
    createListing,
    deleteListing
};