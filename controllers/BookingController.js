const Booking = require('../models/Booking');
const Refunds = require('../models/Refunds');

const buildOrderDetails = (order, coachId) =>
  new Promise((resolve) => {
    Booking.getOrderItems(order.id, coachId, (itemsErr, items) => {
      Booking.getReviewByOrderId(order.id, (reviewErr, review) => {
        resolve(
          Object.assign({}, order, {
            items: itemsErr ? [] : items,
            review: reviewErr ? null : review
          })
        );
      });
    });
  });

const getOrderByIdAsync = (id) =>
  new Promise((resolve, reject) => {
    Booking.getOrderById(id, (err, order) => (err ? reject(err) : resolve(order)));
  });

const allowedStatuses = new Set(['pending', 'accepted', 'rejected']);

module.exports = {
  listAllOrders(req, res) {
    const searchTerm = req.query && req.query.search ? String(req.query.search).trim() : '';
    const statusFilter = req.query && req.query.status ? String(req.query.status).trim().toLowerCase() : 'all';
    const page = Math.max(1, parseInt(req.query && req.query.page, 10) || 1);
    const perPage = 10;
    const user = req.session && req.session.user;
    const isCoach = user && user.role === 'coach';
    const loader = isCoach
      ? (cb) => Booking.getBookingsByCoach(user.id, searchTerm, statusFilter, cb)
      : (cb) => Booking.getAllOrders(searchTerm, statusFilter, cb);
    loader((err, orders) => {
      if (err) {
        console.error('Failed to load bookings', err);
        req.flash('error', 'Unable to load bookings right now.');
        return res.render('bookingsManage', {
          user: req.session && req.session.user,
          orders: [],
          searchTerm: searchTerm,
          statusFilter: statusFilter,
          pagination: { page, perPage, totalOrders: 0, totalPages: 1 }
        });
      }
      const withItems = Promise.all(orders.map((o) => buildOrderDetails(o, isCoach ? user.id : null)));
      withItems.then((ordersWithItems) => {
        let filtered = ordersWithItems
          .slice()
          .sort((a, b) => {
            const aTime = a && a.created_at ? new Date(a.created_at).getTime() : 0;
            const bTime = b && b.created_at ? new Date(b.created_at).getTime() : 0;
            if (aTime !== bTime) return bTime - aTime;
            return Number(b && b.id ? b.id : 0) - Number(a && a.id ? a.id : 0);
          });
        if (isCoach && statusFilter === 'all') {
          filtered = filtered.filter((order) => !order.completed_at);
        }

        const totalOrders = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalOrders / perPage));
        const start = (page - 1) * perPage;
        const paged = filtered.slice(start, start + perPage);

        return res.render('bookingsManage', {
          user: req.session && req.session.user,
          orders: paged,
          searchTerm: searchTerm,
          statusFilter: statusFilter,
          pagination: { page, perPage, totalOrders, totalPages }
        });
      });
    });
  },

  async confirmDelivery(req, res) {
    const userId = req.session && req.session.user && req.session.user.id;
    if (!userId) {
      req.flash('error', 'Please log in');
      return res.redirect('/login');
    }
    if (req.session.user.role !== 'user') {
      req.flash('error', 'Access denied');
      return res.redirect('/listingsManage');
    }
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      req.flash('error', 'Invalid booking');
      return res.redirect('/ratingsUser');
    }
    try {
      const order = await getOrderByIdAsync(orderId);
      if (!order || order.user_id !== userId) {
        req.flash('error', 'Booking not found');
        return res.redirect('/ratingsUser');
      }
      if (order.status && String(order.status).toLowerCase() !== 'accepted') {
        req.flash('error', 'Booking must be accepted before confirmation.');
        return res.redirect('/ratingsUser');
      }
      await new Promise((resolve, reject) => {
        Booking.getOrderItems(orderId, null, (err, rows) => (err ? reject(err) : resolve(rows || [])));
      });
      if (!order.completed_at) {
        await new Promise((resolve, reject) => {
          Booking.markOrderDelivered(orderId, (err) => (err ? reject(err) : resolve()));
        });
      }
      const refreshed = await getOrderByIdAsync(orderId);
      if (refreshed && refreshed.completed_at) {
        req.session.pendingFeedbackBookingId = orderId;
        return req.session.save(() => res.redirect('/ratingsUser'));
      }
      req.flash('info', 'Your completion is recorded. Waiting for the coach to confirm.');
      return res.redirect('/ratingsUser');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to confirm delivery');
      return res.redirect('/ratingsUser');
    }
  },

  async confirmCoachCompletion(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'coach') {
      req.flash('error', 'Access denied');
      return res.redirect('/bookingsManage');
    }
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      req.flash('error', 'Invalid booking');
      return res.redirect('/bookingsManage');
    }
    try {
      const items = await new Promise((resolve, reject) => {
        Booking.getOrderItems(orderId, user.id, (err, rows) => (err ? reject(err) : resolve(rows || [])));
      });
      if (!items.length) {
        req.flash('error', 'Access denied');
        return res.redirect('/bookingsManage');
      }
      await new Promise((resolve, reject) => {
        Booking.markOrderCompletedByCoach(orderId, (err) => (err ? reject(err) : resolve()));
      });
      const refreshed = await getOrderByIdAsync(orderId);
      if (refreshed && refreshed.completed_at) {
        req.flash('success', 'Session marked completed.');
      } else {
        req.flash('info', 'Your completion is recorded. Waiting for the student to confirm.');
      }
      return res.redirect('/bookingsManage');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to confirm completion');
      return res.redirect('/bookingsManage');
    }
  },

  async deleteReview(req, res) {
    if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
      req.flash('error', 'Access denied');
      return res.redirect('/bookingsManage');
    }
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      req.flash('error', 'Invalid booking');
      return res.redirect('/bookingsManage');
    }
    try {
      await new Promise((resolve, reject) => {
        Booking.deleteReviewByOrder(orderId, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Review deleted');
      return res.redirect('/bookingsManage');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to delete review');
      return res.redirect('/bookingsManage');
    }
  },

  async updateStatus(req, res) {
    const user = req.session && req.session.user;
    const redirectParams = new URLSearchParams();
    if (req.body && req.body.page) redirectParams.set('page', String(req.body.page));
    if (req.body && req.body.search) redirectParams.set('search', String(req.body.search));
    if (req.body && req.body.filterStatus) redirectParams.set('status', String(req.body.filterStatus));
    const redirectSuffix = redirectParams.toString();
    const redirectUrl = redirectSuffix ? `/bookingsManage?${redirectSuffix}` : '/bookingsManage';
    if (!user || (user.role !== 'admin' && user.role !== 'coach')) {
      req.flash('error', 'Access denied');
      return res.redirect(redirectUrl);
    }
    req.flash('error', 'Booking status updates are disabled. Use availability slots and completion confirmations.');
    return res.redirect(redirectUrl);
  },

  async showOrderDetails(req, res) {
    if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
      req.flash('error', 'Access denied');
      return res.redirect('/bookingsManage');
    }
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      req.flash('error', 'Invalid booking');
      return res.redirect('/bookingsManage');
    }
    try {
      const order = await getOrderByIdAsync(orderId);
      if (!order) {
        req.flash('error', 'Booking not found');
        return res.redirect('/bookingsManage');
      }
      const detailed = await buildOrderDetails(order, null);
      return res.render('bookingDetail', {
        user: req.session.user,
        order: detailed,
        messages: req.flash()
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to load booking details');
      return res.redirect('/bookingsManage');
    }
  },

  async listHistory(req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash('error', 'Please log in');
      return res.redirect('/login');
    }
    try {
      if (user.role === 'coach') {
        const orders = await new Promise((resolve, reject) => {
          Booking.getBookingsByCoach(user.id, '', 'completed', (err, rows) => (err ? reject(err) : resolve(rows || [])));
        });
        const withItems = await Promise.all(orders.map((o) => buildOrderDetails(o, user.id)));
        return res.render('historyCoach', {
          user,
          orders: withItems,
          messages: req.flash()
        });
      }
      if (user.role === 'user') {
        const orders = await new Promise((resolve, reject) => {
          Booking.getOrdersByUser(user.id, (err, rows) => (err ? reject(err) : resolve(rows || [])));
        });
        const completedOnly = (orders || []).filter((o) => o.completed_at);
        const withItems = await Promise.all(completedOnly.map((o) => buildOrderDetails(o, null)));
        return res.render('historyUser', {
          user,
          orders: withItems,
          messages: req.flash()
        });
      }
      return res.redirect('/admindashboard');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to load history');
      return res.redirect('/userdashboard');
    }
  },

  listCoachRatings(req, res) {
    const user = req.session && req.session.user;
    if (!user || (user.role !== 'coach' && user.role !== 'admin')) {
      req.flash('error', 'Access denied');
      return res.redirect('/bookingsManage');
    }
    let coachId = null;
    if (user.role === 'coach') {
      coachId = user.id;
    } else if (user.role === 'admin' && req.query.coachId) {
      coachId = parseInt(req.query.coachId, 10);
    }
    if (!coachId || Number.isNaN(coachId)) {
      req.flash('error', 'Select a coach to view ratings.');
      return res.render('ratingsManage', {
        user: req.session.user,
        ratings: []
      });
    }
    Booking.getCoachReviews(coachId, (err, rows) => {
      if (err) {
        console.error('Failed to load ratings', err);
        req.flash('error', 'Unable to load ratings right now.');
        return res.render('ratingsManage', {
          user: req.session.user,
          ratings: []
        });
      }
      return res.render('ratingsManage', {
        user: req.session.user,
        ratings: rows || []
      });
    });
  },

  userRatings(req, res) {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser || sessionUser.role !== 'user') {
      req.flash('error', 'Access denied');
      return res.redirect('/listingsManage');
    }
    const userId = sessionUser.id;
    Booking.getOrdersByUser(userId, (err, orders) => {
      if (err) {
        console.error('Failed to load ratings list', err);
        req.flash('error', 'Unable to load your ratings list right now.');
        return res.render('userRatings', {
          user: req.session && req.session.user,
          sessions: []
        });
      }
      const withItems = Promise.all(orders.map((o) => buildOrderDetails(o, null)));
      const withRefunds = new Promise((resolve, reject) => {
        Refunds.getUserRefunds(userId, (refundErr, refundRows) => (refundErr ? reject(refundErr) : resolve(refundRows || [])));
      });
        return Promise.all([withItems, withRefunds]).then(([ordersWithItems, refunds]) => {
          const refundMap = new Map((refunds || []).map((r) => [Number(r.booking_item_id), r]));
          const completedSessions = [];
          ordersWithItems.forEach((order) => {
            const items = Array.isArray(order.items) ? order.items : [];
            const completedAtRaw = order.completed_at || null;
            const userCompletedAtRaw = order.user_completed_at || null;
            const userConfirmed = Boolean(userCompletedAtRaw);

            items.forEach((item) => {
              if (!userConfirmed) return;

              const refund = refundMap.get(Number(item.booking_item_id)) || null;
              completedSessions.push({
                bookingId: order.id,
                itemId: item.booking_item_id,
                completedAt: completedAtRaw,
                userCompletedAt: userCompletedAtRaw,
                review: order.review,
                coach: item.username,
                sport: item.sport,
                location: item.session_location || order.session_location,
                date: item.session_date,
                time: item.session_time,
                price: item.price,
                quantity: item.quantity,
                refund
              });
            });
          });
          completedSessions.sort((a, b) => {
            const aReviewTime = a.review && a.review.created_at ? new Date(a.review.created_at).getTime() : 0;
            const bReviewTime = b.review && b.review.created_at ? new Date(b.review.created_at).getTime() : 0;
            if (aReviewTime !== bReviewTime) return bReviewTime - aReviewTime;
            const aCompleted = a.completedAt ? new Date(a.completedAt).getTime() : 0;
            const bCompleted = b.completedAt ? new Date(b.completedAt).getTime() : 0;
            if (aCompleted !== bCompleted) return bCompleted - aCompleted;
            return Number(b.bookingId || 0) - Number(a.bookingId || 0);
          });
          return res.render('userRatings', {
            user: req.session && req.session.user,
            completedSessions,
            messages: res.locals.messages
          });
        }).catch((err) => {
          console.error('Failed to load ratings list', err);
          req.flash('error', 'Unable to load your ratings list right now.');
          return res.render('userRatings', {
            user: req.session && req.session.user,
            completedSessions: [],
            messages: res.locals.messages
          });
        });
      });
  }
};
