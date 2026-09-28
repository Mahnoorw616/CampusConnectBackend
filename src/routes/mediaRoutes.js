const express = require('express');
const { getMedia } = require('../controllers/mediaController');

const router = express.Router();

// Browser image/video elements cannot attach the application's Bearer token.
router.get('/:id', getMedia);

module.exports = router;