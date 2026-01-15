const AdminDashboard = require('../models/AdminDashboard');
const AdminCoaches = require('../models/AdminCoaches');

const formatTimeAgo = (input) => {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};

const AdminController = {
  dashboard: async function (req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const perPage = 5;
      const sort = req.query.sort === 'oldest' ? 'oldest' : 'newest';
      const action = req.query.action ? String(req.query.action) : '';
      const search = req.query.search ? String(req.query.search) : '';

      const [stats, activityResult, actionOptions] = await Promise.all([
        new Promise((resolve, reject) => {
          AdminDashboard.getStats((err, data) => (err ? reject(err) : resolve(data)));
        }),
        new Promise((resolve, reject) => {
          AdminDashboard.getActivity({
            limit: perPage,
            offset: (page - 1) * perPage,
            sort,
            action,
            search
          }, (err, result) => (err ? reject(err) : resolve(result)));
        }),
        new Promise((resolve, reject) => {
          AdminDashboard.getActionOptions((err, actions) => (err ? reject(err) : resolve(actions)));
        })
      ]);

      const activityWithTime = (activityResult.rows || []).map((row) => ({
        user: row.user,
        action: row.action,
        status: row.status,
        time: formatTimeAgo(row.event_time),
        eventTime: row.event_time
      }));
      const totalActivities = Number(activityResult.total || 0);
      const totalPages = Math.max(1, Math.ceil(totalActivities / perPage));

      return res.render('admindashboard', {
        user: req.session.user,
        messages: res.locals.messages,
        stats,
        activity: activityWithTime,
        actionOptions,
        filters: { action, search, sort },
        pagination: {
          page,
          perPage,
          totalActivities,
          totalPages
        }
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to load admin dashboard.');
      return res.redirect('/listingsManage');
    }
  },
  coaches: async function (req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const perPage = 8;
      const sort = req.query.sort === 'oldest' ? 'oldest' : 'newest';
      const search = req.query.search ? String(req.query.search) : '';

      const [stats, coachResult] = await Promise.all([
        new Promise((resolve, reject) => {
          AdminCoaches.getStats((err, data) => (err ? reject(err) : resolve(data)));
        }),
        new Promise((resolve, reject) => {
          AdminCoaches.getCoaches({
            limit: perPage,
            offset: (page - 1) * perPage,
            sort,
            search
          }, (err, result) => (err ? reject(err) : resolve(result)));
        })
      ]);

      const totalCoaches = Number(coachResult.total || 0);
      const totalPages = Math.max(1, Math.ceil(totalCoaches / perPage));

      return res.render('admincoaches', {
        user: req.session.user,
        messages: res.locals.messages,
        stats,
        coaches: coachResult.rows || [],
        filters: { search, sort },
        pagination: {
          page,
          perPage,
          totalCoaches,
          totalPages
        }
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to load coaches.');
      return res.redirect('/admindashboard');
    }
  }
};

module.exports = AdminController;
