const express = require('express');
const router = express.Router();
const { protect, adminOnly, volunteerOnly } = require('../middleware/auth');
const ctrl = require('../controllers/applicationController');

// All routes require authentication
router.use(protect);

// POST   /api/applications              — Volunteer applies to an opportunity
router.post('/', volunteerOnly, ctrl.applyToOpportunity);

// GET    /api/applications/my           — Volunteer's own applications
router.get('/my', ctrl.getMyApplications);

// GET    /api/applications/opportunity/:opportunityId — Admin lists apps for their opp
router.get('/opportunity/:opportunityId', adminOnly, ctrl.listApplicationsForOpportunity);

// PUT    /api/applications/:applicationId/decide      — Admin accepts/rejects
router.put('/:applicationId/decide', adminOnly, ctrl.decideApplication);

module.exports = router;
