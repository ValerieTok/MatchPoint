// Centralized middleware helpers for auth and view locals
const Booking = require('./models/Booking');
const Warnings = require('./models/Warnings');
const Inbox = require('./models/Inbox');
const UserBan = require('./models/UserBan');

const formatInboxDate = (input) => {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB');
};

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
    const when = formatInboxDate(row.created_at);
    const statusInfo = toInboxStatus(row);
    return {
      itemType: 'booking',
      itemId: row.id,
      title,
      when,
      status: statusInfo.status,
      statusLabel: statusInfo.label,
      createdAt: row.created_at
    };
  });

const buildCoachInboxItems = (rows) =>
  (rows || []).map((row) => {
    const reviewId = row.review_id || row.id;
    const who = row.student_name;
    const title = who
      ? `New review from ${who} (Booking #${row.booking_id})`
      : `New review (Booking #${row.booking_id})`;
    const when = formatInboxDate(row.created_at);
    return {
      itemType: 'review',
      itemId: reviewId,
      title,
      when,
      status: 'submitted',
      statusLabel: 'SUBMITTED',
      createdAt: row.created_at
    };
  });

const buildWarningItems = (rows) =>
  (rows || []).map((row) => ({
    itemType: 'warning',
    itemId: row.id,
    title: 'Warning from admin',
    body: row.comment,
    when: formatInboxDate(row.created_at),
    status: 'warning',
    statusLabel: 'WARNING',
    createdAt: row.created_at
  }));

const sortInboxItems = (items) =>
  (items || []).sort((a, b) => {
    const aTime = a && a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b && b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

const getInboxItems = (user, limit = 3) => {
  if (!user || (user.role !== 'user' && user.role !== 'coach')) {
    return Promise.resolve({ items: [], ban: null });
  }

  const capped = Number.isFinite(Number(limit)) ? Number(limit) : 3;
  const loader = user.role === 'coach'
    ? Booking.getRecentCoachInbox
    : Booking.getRecentUserInbox;

  const inboxPromise = new Promise((resolve, reject) => {
    loader(user.id, capped, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });

  const warningsPromise = new Promise((resolve, reject) => {
    Warnings.getRecentWarnings(user.id, capped, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });

  const statusPromise = new Promise((resolve) => {
    Inbox.getStatuses(user.id, (err, rows) => {
      if (err) {
        console.error('Failed to load inbox status:', err);
        return resolve([]);
      }
      return resolve(rows || []);
    });
  });

  const banPromise = new Promise((resolve) => {
    UserBan.getActiveBan(user.id, (err, banRow) => {
      if (err) {
        console.error('Failed to load ban status:', err);
        return resolve(null);
      }
      return resolve(banRow);
    });
  });

  return Promise.all([inboxPromise, warningsPromise, statusPromise, banPromise])
    .then(([inboxRows, warningRows, statusRows, banRow]) => {
      const baseItems = user.role === 'coach'
        ? buildCoachInboxItems(inboxRows)
        : buildUserInboxItems(inboxRows);
      const warningItems = buildWarningItems(warningRows);
      const merged = sortInboxItems([...warningItems, ...baseItems]);

      const statusMap = new Map();
      statusRows.forEach((row) => {
        const key = `${row.item_type}:${row.item_id}`;
        statusMap.set(key, {
          isRead: Boolean(row.is_read),
          isDeleted: Boolean(row.is_deleted)
        });
      });

      return {
        items: merged
        .filter((item) => {
          const key = `${item.itemType}:${item.itemId}`;
          const status = statusMap.get(key);
          return !(status && status.isDeleted);
        })
        .map((item) => {
          const key = `${item.itemType}:${item.itemId}`;
          const status = statusMap.get(key);
          return {
            ...item,
            isRead: status ? status.isRead : false
          };
        })
        .slice(0, capped),
        ban: banRow || null
      };
    });
};

const attachUser = (req, res, next) => {
  const user = req.session && req.session.user;
  res.locals.user = user;
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error'),
    info: req.flash('info')
  };

  return getInboxItems(user, 3)
    .then((result) => {
      res.locals.inboxItems = result.items || [];
      res.locals.activeBan = result.ban || null;
      return next();
    })
    .catch((err) => {
      console.error('Failed to load inbox items:', err);
      res.locals.inboxItems = [];
      res.locals.activeBan = null;
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
  getInboxItems,
  checkAuthenticated,
  checkAdmin,
  checkAdminOrCoach,
  checkCoachApproved
};
