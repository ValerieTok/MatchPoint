const AdminDashboard = require('../models/AdminDashboard');
const AdminCoaches = require('../models/AdminCoaches');
const AdminStudents = require('../models/AdminStudents');
const AdminServices = require('../models/AdminServices');
const AdminFeedback = require('../models/AdminFeedback');
const Account = require('../models/Account');
const Warnings = require('../models/Warnings');
const activityStore = require('../activityStore');

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
  },
  students: async function (req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const perPage = 8;
      const sort = req.query.sort === 'oldest' ? 'oldest' : 'newest';
      const search = req.query.search ? String(req.query.search) : '';

      const [stats, studentResult] = await Promise.all([
        new Promise((resolve, reject) => {
          AdminStudents.getStats((err, data) => (err ? reject(err) : resolve(data)));
        }),
        new Promise((resolve, reject) => {
          AdminStudents.getStudents({
            limit: perPage,
            offset: (page - 1) * perPage,
            sort,
            search
          }, (err, result) => (err ? reject(err) : resolve(result)));
        })
      ]);

      const activeIds = new Set(activityStore.getActiveUserIds({
        role: 'user',
        withinMs: activityStore.DEFAULT_ACTIVE_WINDOW_MS
      }));
      const students = (studentResult.rows || []).map((row) => {
        return {
          ...row,
          status: activeIds.has(String(row.id)) ? 'active' : 'inactive'
        };
      });

      const totalStudents = Number(studentResult.total || 0);
      const totalPages = Math.max(1, Math.ceil(totalStudents / perPage));

      return res.render('adminstudents', {
        user: req.session.user,
        messages: res.locals.messages,
        stats,
        activeStudents: activeIds.size,
        students,
        filters: { search, sort },
        pagination: {
          page,
          perPage,
          totalStudents,
          totalPages
        }
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to load students.');
      return res.redirect('/admindashboard');
    }
  },

  services: async function (req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const perPage = 8;
      const sort = req.query.sort === 'oldest' ? 'oldest' : 'newest';
      const search = req.query.search ? String(req.query.search) : '';

      const [stats, serviceResult] = await Promise.all([
        new Promise((resolve, reject) => {
          AdminServices.getStats((err, data) => (err ? reject(err) : resolve(data)));
        }),
        new Promise((resolve, reject) => {
          AdminServices.getServices({
            limit: perPage,
            offset: (page - 1) * perPage,
            sort,
            search
          }, (err, result) => (err ? reject(err) : resolve(result)));
        })
      ]);

      const totalServices = Number(serviceResult.total || 0);
      const totalPages = Math.max(1, Math.ceil(totalServices / perPage));

      return res.render('adminservices', {
        user: req.session.user,
        messages: res.locals.messages,
        stats,
        services: serviceResult.rows || [],
        filters: { search, sort },
        pagination: {
          page,
          perPage,
          totalServices,
          totalPages
        }
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to load services.');
      return res.redirect('/admindashboard');
    }
  },

  toggleService: async function (req, res) {
    try {
      const id = req.params.id;
      const isActive = req.body && req.body.is_active === '1';
      await new Promise((resolve, reject) => {
        AdminServices.setServiceActive(id, isActive, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Service updated.');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to update service.');
    }
    return res.redirect('/adminservices');
  },

  feedback: async function (req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const perPage = 6;
      const sort = req.query.sort || 'newest';
      const status = req.query.status ? String(req.query.status) : '';
      const search = req.query.search ? String(req.query.search) : '';

      const [stats, feedbackResult] = await Promise.all([
        new Promise((resolve, reject) => {
          AdminFeedback.getStats((err, data) => (err ? reject(err) : resolve(data)));
        }),
        new Promise((resolve, reject) => {
          AdminFeedback.getFeedback({
            limit: perPage,
            offset: (page - 1) * perPage,
            sort,
            status,
            search
          }, (err, result) => (err ? reject(err) : resolve(result)));
        })
      ]);

      const totalReviews = Number(feedbackResult.total || 0);
      const totalPages = Math.max(1, Math.ceil(totalReviews / perPage));

      return res.render('adminfeedback', {
        user: req.session.user,
        messages: res.locals.messages,
        stats,
        feedback: feedbackResult.rows || [],
        filters: { search, sort, status },
        pagination: {
          page,
          perPage,
          totalReviews,
          totalPages
        }
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to load feedback.');
      return res.redirect('/admindashboard');
    }
  },

  approveFeedback: async function (req, res) {
    try {
      const id = req.params.id;
      await new Promise((resolve, reject) => {
        AdminFeedback.updateStatus(id, 'approved', (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Feedback approved.');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to update feedback.');
    }
    return res.redirect('/adminfeedback');
  },

  rejectFeedback: async function (req, res) {
    try {
      const id = req.params.id;
      await new Promise((resolve, reject) => {
        AdminFeedback.updateStatus(id, 'rejected', (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Feedback rejected.');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to update feedback.');
    }
    return res.redirect('/adminfeedback');
  },

  approveCoach: async function (req, res) {
    try {
      const id = req.params.id;
      await new Promise((resolve, reject) => {
        AdminCoaches.setCoachStatus(id, 'approved', (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Coach approved.');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to approve coach.');
    }
    return res.redirect('/admincoaches');
  },

  rejectCoach: async function (req, res) {
    try {
      const id = req.params.id;
      await new Promise((resolve, reject) => {
        AdminCoaches.setCoachStatus(id, 'rejected', (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Coach rejected.');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to reject coach.');
    }
    return res.redirect('/admincoaches');
  },

  warnStudent: async function (req, res) {
    const comment = req.body && req.body.comment ? String(req.body.comment).trim() : '';
    if (!comment) {
      req.flash('error', 'Warning comment is required.');
      return res.redirect('/adminstudents');
    }
    try {
      const targetId = req.params.id;
      const target = await new Promise((resolve, reject) => {
        Account.getUserById(targetId, (err, user) => (err ? reject(err) : resolve(user)));
      });
      if (!target || target.role !== 'user') {
        req.flash('error', 'Student not found.');
        return res.redirect('/adminstudents');
      }
      await new Promise((resolve, reject) => {
        Warnings.createWarning({
          userId: target.id,
          targetRole: 'user',
          comment,
          createdBy: req.session && req.session.user ? req.session.user.id : null
        }, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Warning sent to student inbox.');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to issue warning.');
    }
    return res.redirect('/adminstudents');
  },

  warnCoach: async function (req, res) {
    const comment = req.body && req.body.comment ? String(req.body.comment).trim() : '';
    if (!comment) {
      req.flash('error', 'Warning comment is required.');
      return res.redirect('/admincoaches');
    }
    try {
      const targetId = req.params.id;
      const target = await new Promise((resolve, reject) => {
        Account.getUserById(targetId, (err, user) => (err ? reject(err) : resolve(user)));
      });
      if (!target || target.role !== 'coach') {
        req.flash('error', 'Coach not found.');
        return res.redirect('/admincoaches');
      }
      await new Promise((resolve, reject) => {
        Warnings.createWarning({
          userId: target.id,
          targetRole: 'coach',
          comment,
          createdBy: req.session && req.session.user ? req.session.user.id : null
        }, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Warning sent to coach inbox.');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to issue warning.');
    }
    return res.redirect('/admincoaches');
  }
};

module.exports = AdminController;
