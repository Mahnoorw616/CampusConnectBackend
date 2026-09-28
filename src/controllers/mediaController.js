const { ObjectId } = require('mongodb');
const { getMediaBucket } = require('../config/mediaStore');

const getMedia = async (req, res, next) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid media ID' });
        }

        const id = new ObjectId(req.params.id);
        const files = await getMediaBucket().find({ _id: id }).toArray();
        const file = files[0];

        if (!file) {
            return res.status(404).json({ success: false, message: 'Media not found' });
        }

        res.set('Content-Type', file.contentType || 'application/octet-stream');
        res.set('Content-Length', String(file.length));
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');

        return getMediaBucket().openDownloadStream(id).pipe(res);
    } catch (error) {
        return next(error);
    }
};

const getMediaInfo = async (req, res, next) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid media ID' });
        }

        const files = await getMediaBucket()
            .find({ _id: new ObjectId(req.params.id) })
            .toArray();
        const file = files[0];

        if (!file) {
            return res.status(404).json({ success: false, message: 'Media not found' });
        }

        return res.json({
            success: true,
            contentType: file.contentType || 'application/octet-stream'
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = { getMedia, getMediaInfo };
