const Revenue = require('../models/Revenue');
const UserProfile = require('../models/UserProfile');

module.exports = {
  showDashboard(req, res) {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser || (sessionUser.role !== 'coach' && sessionUser.role !== 'admin')) {
      req.flash('error', 'Access denied');
      return res.redirect('/listingsManage');
    }

    let coachId = sessionUser.id;
    if (sessionUser.role === 'admin' && req.query && req.query.coachId) {
      const parsed = parseInt(req.query.coachId, 10);
      if (!Number.isNaN(parsed)) coachId = parsed;
    }

    Revenue.getCoachRevenue(coachId, (err, data) => {
      if (err) {
        console.error('Failed to load revenue', err);
        req.flash('error', 'Unable to load revenue right now.');
        // still attempt to get monthly (or render fallback)
        return UserProfile.getByUserId(coachId, (upErr, profile) => {
          const profilePhoto = profile && profile.photo ? profile.photo : null;
          return res.render('trackRevenue', { user: sessionUser, revenue: { totalEarned: 0, totalPending: 0, monthEarned: 0 }, profilePhoto, active: 'revenue' });
        });
      }

      Revenue.getCoachMonthlyRevenue(coachId, (err2, monthData) => {
        if (err2) {
          console.error('Failed to load monthly revenue', err2);
          monthData = { monthEarned: 0 };
        }
        const merged = Object.assign({}, data || { totalEarned: 0, totalPending: 0 }, monthData || { monthEarned: 0 });
        return UserProfile.getByUserId(coachId, (upErr, profile) => {
          const profilePhoto = profile && profile.photo ? profile.photo : null;
          return res.render('trackRevenue', { user: sessionUser, revenue: merged, profilePhoto, active: 'revenue' });
        });
      });
    });
  }
};
