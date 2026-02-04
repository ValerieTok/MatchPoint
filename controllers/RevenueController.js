const Revenue = require('../models/Revenue');
const UserProfile = require('../models/UserProfile');
const Payout = require('../models/Payout');

module.exports = {
  showDashboard(req, res) {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser || (sessionUser.role !== 'coach' && sessionUser.role !== 'admin')) {
      req.flash('error', 'Access denied');
      return res.redirect('/listingsManage');
    }

    if (sessionUser.role === 'admin' && !(req.query && req.query.coachId)) {
      return res.redirect('/adminRevenue');
    }

    let coachId = sessionUser.id;
    if (sessionUser.role === 'admin' && req.query && req.query.coachId) {
      const parsed = parseInt(req.query.coachId, 10);
      if (!Number.isNaN(parsed)) coachId = parsed;
    }

    const filters = {
      startDate: req.query && req.query.start ? String(req.query.start).trim() : '',
      endDate: req.query && req.query.end ? String(req.query.end).trim() : '',
      sport: req.query && req.query.sport ? String(req.query.sport).trim() : '',
      bookingId: req.query && req.query.bookingId ? parseInt(req.query.bookingId, 10) : null
    };
    if (Number.isNaN(filters.bookingId)) filters.bookingId = null;

    Revenue.getCoachRevenue(coachId, (err, data) => {
      if (err) {
        console.error('Failed to load revenue', err);
        req.flash('error', 'Unable to load revenue right now.');
        // still attempt to get monthly (or render fallback)
      return UserProfile.getByUserId(coachId, (upErr, profile) => {
          const profilePhoto = profile && profile.photo ? profile.photo : null;
          return res.render('trackRevenue', {
            user: sessionUser,
            revenue: { totalEarned: 0, totalPending: 0, monthEarned: 0, totalPaid: 0, availableBalance: 0 },
            payoutRequests: [],
            profilePhoto,
            active: 'revenue'
          });
        });
      }

      Revenue.getCoachMonthlyRevenue(coachId, (err2, monthData) => {
        if (err2) {
          console.error('Failed to load monthly revenue', err2);
          monthData = { monthEarned: 0 };
        }
        Revenue.getCoachTotalPaid(coachId, (err3, totalPaid) => {
          if (err3) {
            console.error('Failed to load paid total', err3);
            totalPaid = 0;
          }
          const merged = Object.assign({}, data || { totalEarned: 0, totalPending: 0 }, monthData || { monthEarned: 0 });
          merged.totalPaid = Number(totalPaid || 0);
          merged.availableBalance = Math.max(0, Number(merged.totalEarned || 0) - Number(merged.totalPaid || 0));
          return Payout.listRequestsByCoach(coachId, (reqErr, requests) => {
            if (reqErr) {
              console.error('Failed to load payout requests', reqErr);
              requests = [];
            }
            return Revenue.getCoachEarningsHistory(coachId, 15, filters, (histErr, history) => {
              if (histErr) {
                console.error('Failed to load earnings history', histErr);
                history = [];
              }
              return UserProfile.getByUserId(coachId, (upErr, profile) => {
                const profilePhoto = profile && profile.photo ? profile.photo : null;
                return res.render('trackRevenue', {
                  user: sessionUser,
                  revenue: merged,
                  payoutRequests: requests || [],
                  earningsHistory: history || [],
                  filters,
                  profilePhoto,
                  active: 'revenue'
                });
              });
            });
          });
        });
      });
    });
  }
};
