const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const ctrl = require('../controllers/opportunityController');
const multer = require('multer');

// Multer setup – files stored temporarily, then uploaded to Cloudinary
const upload = multer({ dest: 'uploads/' });

// All routes require authentication
router.use(protect);

// POST   /api/opportunities          — Admin creates opportunity
router.post('/', adminOnly, upload.single('image'), ctrl.createOpportunity);

// GET    /api/opportunities          — List opportunities (role-aware)
router.get('/', ctrl.listOpportunities);

// GET    /api/opportunities/:id      — Get single opportunity
router.get('/:id', ctrl.getOpportunity);

// PUT    /api/opportunities/:id      — Admin (owner) updates opportunity
router.put('/:id', adminOnly, upload.single('image'), ctrl.updateOpportunity);

// DELETE /api/opportunities/:id      — Admin (owner) soft-deletes opportunity
router.delete('/:id', adminOnly, ctrl.deleteOpportunity);

module.exports = router;
