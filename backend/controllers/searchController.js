const Opportunity = require('../models/Opportunity');
const Pickup = require('../models/Pickup');
const User = require('../models/User');

const errorResponse = (res, status, message) =>
  res.status(status).json({ error: true, message });

/**
 * GET /api/search?q=term&type=all|opportunities|pickups|users&page=1&limit=10
 *
 * Role-aware:
 *   - Volunteers see only open, non-deleted opportunities
 *   - Admins see their own opportunities (all statuses)
 *   - Users see their own pickups
 *   - Admins see all pickups
 */
async function universalSearch(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ results: [], total: 0 });
    if (q.length < 2) return errorResponse(res, 400, 'Search term must be at least 2 characters');

    const type = req.query.type || 'all';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    const role = req.user.role;

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const results = [];
    const promises = [];

    // ── Opportunities ────────────────────────────────────────────────────
    if (type === 'all' || type === 'opportunities') {
      const oppFilter = { isDeleted: false };

      if (role === 'volunteer' || role === 'user') {
        oppFilter.status = 'open';
      } else if (role === 'admin') {
        oppFilter.ngo_id = req.user._id;
      }

      oppFilter.$or = [
        { title: regex },
        { description: regex },
        { location: regex },
        { requiredSkills: regex },
      ];

      promises.push(
        Opportunity.find(oppFilter)
          .select('title description location status requiredSkills createdAt')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .then((docs) =>
            docs.forEach((d) => results.push({ ...d, _type: 'opportunity' }))
          )
      );
    }

    // ── Pickups ──────────────────────────────────────────────────────────
    if (type === 'all' || type === 'pickups') {
      const pickupFilter = {};

      if (role === 'user') {
        pickupFilter.user_id = req.user._id;
      } else if (role === 'volunteer') {
        pickupFilter.$or = [
          { volunteer_id: req.user._id },
          { status: 'Open' },
        ];
      }
      // Admin sees all pickups

      // Chain the text filter
      const textOr = [
        { title: regex },
        { description: regex },
        { address: regex },
        { wasteType: regex },
      ];

      // Merge $or conditions
      if (pickupFilter.$or) {
        pickupFilter.$and = [{ $or: pickupFilter.$or }, { $or: textOr }];
        delete pickupFilter.$or;
      } else {
        pickupFilter.$or = textOr;
      }

      promises.push(
        Pickup.find(pickupFilter)
          .select('title wasteType address status preferredDate createdAt')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .then((docs) =>
            docs.forEach((d) => results.push({ ...d, _type: 'pickup' }))
          )
      );
    }

    // ── Users ─────────────────────────────────────────────────────────────
    // Previously restricted to admins only; now all authenticated roles can
    // search by user name/email/username. This is used by the in‑app
    // messaging screen to start chats by username.
    if (type === 'all' || type === 'users') {
      const userFilter = {
        $or: [{ name: regex }, { email: regex }, { username: regex }],
      };

      promises.push(
        User.find(userFilter)
          .select('name email username role createdAt')
          .limit(limit)
          .lean()
          .then((docs) =>
            docs.forEach((d) => results.push({ ...d, _type: 'user' }))
          )
      );
    }

    await Promise.all(promises);

    // Sort combined results by createdAt descending
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ results: results.slice(0, limit), total: results.length, q });
  } catch (err) {
    console.error('universalSearch error:', err);
    errorResponse(res, 500, 'Search failed');
  }
}

module.exports = { universalSearch };
