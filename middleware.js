// Centralized middleware helpers for auth and view locals
const Booking = require('./models/Booking');

const toInboxStatus = (row) => {
  if (row && row.completed_at) return { status: 'completed', label: 'COMPLETED' };
  const raw = row && row.status ? String(row.status).toLowerCase() : 'pending';
  if (raw === 'accepted') return { status: 'approved', label: 'APPROVED' };
  if (raw === 'rejected') return { status: 'rejected', label: 'REJECTED' };
  return { status: 'pending', label: 'PENDING' };
};

const buildUserInboxItems = (rows) =>
  (rows || []).map((row) => {
    const who = row.coach_name;
    const title = who ? `Booking #${row.id} with ${who}` : `Booking #${row.id}`;
    const when = row.created_at
      ? new Date(row.created_at).toLocaleDateString('en-GB')
      : '';
    const statusInfo = toInboxStatus(row);
    return {
      title,
      when,
      status: statusInfo.status,
      statusLabel: statusInfo.label
    };
  });

const buildCoachInboxItems = (rows) =>
  (rows || []).map((row) => {
    const who = row.student_name;
    const title = who
      ? `New review from ${who} (Booking #${row.booking_id})`
      : `New review (Booking #${row.booking_id})`;
    const when = row.created_at
      ? new Date(row.created_at).toLocaleDateString('en-GB')
      : '';
    return {
      title,
      when,
      status: 'submitted',
      statusLabel: 'SUBMITTED'
    };
  });

const attachUser = (req, res, next) => {
  const user = req.session && req.session.user;
  res.locals.user = user;
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error'),
    info: req.flash('info')
  };

  if (!user || (user.role !== 'user' && user.role !== 'coach')) {
    res.locals.inboxItems = [];
    return next();
  }

  const limit = 3;
  const loader = user.role === 'coach'
    ? Booking.getRecentCoachInbox
    : Booking.getRecentUserInbox;

  return loader(user.id, limit, (err, rows) => {
    if (err) {
      console.error('Failed to load inbox items:', err);
      res.locals.inboxItems = [];
      return next();
    }
    res.locals.inboxItems = user.role === 'coach'
      ? buildCoachInboxItems(rows)
      : buildUserInboxItems(rows);
    return next();
  });
};

const checkAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) return next();
  req.flash('error', 'Please log in');
  return res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  req.flash('error', 'Access denied');
  return res.redirect('/userdashboard');
};

const checkAdminOrCoach = (req, res, next) => {
  if (!req.session || !req.session.user) {
    req.flash('error', 'Please log in');
    return res.redirect('/login');
  }
  if (req.session.user.role === 'admin' || req.session.user.role === 'coach') return next();
  req.flash('error', 'Access denied');
  return res.redirect('/userdashboard');
};

const checkCoachApproved = (req, res, next) => {
  const user = req.session && req.session.user;
  if (!user) return next();
  if (user.role !== 'coach') return next();
  if (user.coach_status === 'approved') return next();
  req.flash('error', 'Your coach account is pending approval. Upload your certification and wait for admin approval.');
  return res.redirect('/coachProfile');
};

module.exports = {
  attachUser,
  checkAuthenticated,
  checkAdmin,
  checkAdminOrCoach,
  checkCoachApproved
};
