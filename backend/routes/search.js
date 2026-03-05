const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { universalSearch } = require('../controllers/searchController');

// GET /api/search?q=term&type=all|opportunities|pickups|users
router.get('/', protect, universalSearch);

module.exports = router;
