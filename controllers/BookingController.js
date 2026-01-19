const Booking = require('../models/Booking');

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
    const searchTerm = req.query && req.query.search ? String(req.query.search) : '';
    const user = req.session && req.session.user;
    const isCoach = user && user.role === 'coach';
    const loader = isCoach
      ? (cb) => Booking.getBookingsByCoach(user.id, searchTerm, cb)
      : (cb) => Booking.getAllOrders(searchTerm, cb);
    loader((err, orders) => {
      if (err) {
        console.error('Failed to load bookings', err);
        req.flash('error', 'Unable to load bookings right now.');
        return res.render('bookingsManage', {
          user: req.session && req.session.user,
          orders: [],
          searchTerm: searchTerm
        });
      }
      const withItems = Promise.all(orders.map((o) => buildOrderDetails(o, isCoach ? user.id : null)));
      withItems.then((ordersWithItems) =>
        res.render('bookingsManage', {
          user: req.session && req.session.user,
          orders: ordersWithItems,
          searchTerm: searchTerm
        })
      );
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
      if (!order.completed_at) {
        await new Promise((resolve, reject) => {
          Booking.markOrderDelivered(orderId, (err) => (err ? reject(err) : resolve()));
        });
      }
      return res.redirect(`/feedback?booking_id=${orderId}`);
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to confirm delivery');
      return res.redirect('/ratingsUser');
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
    if (!user || (user.role !== 'admin' && user.role !== 'coach')) {
      req.flash('error', 'Access denied');
      return res.redirect('/bookingsManage');
    }
    const orderId = parseInt(req.params.id, 10);
    const status = req.body && req.body.status ? String(req.body.status).trim().toLowerCase() : '';
    if (Number.isNaN(orderId) || !allowedStatuses.has(status)) {
      req.flash('error', 'Invalid booking status update');
      return res.redirect('/bookingsManage');
    }
    try {
      const order = await getOrderByIdAsync(orderId);
      if (!order) {
        req.flash('error', 'Booking not found');
        return res.redirect('/bookingsManage');
      }
      if (user.role === 'coach') {
        const items = await new Promise((resolve, reject) => {
          Booking.getOrderItems(orderId, user.id, (err, rows) => (err ? reject(err) : resolve(rows || [])));
        });
        if (!items.length) {
          req.flash('error', 'Access denied');
          return res.redirect('/bookingsManage');
        }
      }
      await new Promise((resolve, reject) => {
        Booking.updateOrderStatus(orderId, status, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', `Booking marked as ${status}.`);
      return res.redirect('/bookingsManage');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to update booking status');
      return res.redirect('/bookingsManage');
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
      return withItems.then((ordersWithItems) => {
        const upcomingSessions = [];
        const completedSessions = [];
        ordersWithItems.forEach((order) => {
          const status = (order.status || '').toLowerCase();
          const items = Array.isArray(order.items) ? order.items : [];
          if (status === 'accepted' && !order.completed_at) {
            items.forEach((item) => {
              upcomingSessions.push({
                bookingId: order.id,
                status,
                coach: item.username,
                sport: item.sport,
                location: item.session_location || order.session_location,
                date: item.session_date,
                time: item.session_time
              });
            });
          }

          if (order.completed_at && order.review) {
            items.forEach((item) => {
              completedSessions.push({
                bookingId: order.id,
                completedAt: order.completed_at,
                review: order.review,
                coach: item.username,
                sport: item.sport,
                location: item.session_location || order.session_location,
                date: item.session_date,
                time: item.session_time
              });
            });
          }
        });
        return res.render('userRatings', {
          user: req.session && req.session.user,
          upcomingSessions,
          completedSessions
        });
      });
    });
  }
};
