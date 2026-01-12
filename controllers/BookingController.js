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
        return res.redirect('/inventory');
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

  userOrders(req, res) {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser || sessionUser.role !== 'user') {
      req.flash('error', 'Access denied');
      return res.redirect('/inventory');
    }
    const userId = sessionUser.id;
    Booking.getOrdersByUser(userId, (err, orders) => {
      if (err) {
        console.error('Failed to load booking history', err);
        req.flash('error', 'Unable to load your bookings right now.');
        return res.redirect('/shopping');
      }
      const withItems = Promise.all(orders.map((o) => buildOrderDetails(o, null)));
      withItems.then((ordersWithItems) =>
        res.render('bookingsUser', {
          user: req.session && req.session.user,
          orders: ordersWithItems
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
      return res.redirect('/inventory');
    }
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      req.flash('error', 'Invalid booking');
      return res.redirect('/my-orders');
    }
    try {
      const order = await getOrderByIdAsync(orderId);
    if (!order || order.userId !== userId) {
      req.flash('error', 'Booking not found');
      return res.redirect('/my-orders');
    }
    if (!order.delivered_at) {
      await new Promise((resolve, reject) => {
          Booking.markOrderDelivered(orderId, (err) => (err ? reject(err) : resolve()));
        });
      }
      return res.redirect(`/orders/${orderId}/review`);
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to confirm delivery');
      return res.redirect('/my-orders');
    }
  },

  async reviewOrderPage(req, res) {
    const userId = req.session && req.session.user && req.session.user.id;
    if (!userId) {
      req.flash('error', 'Please log in');
      return res.redirect('/login');
    }
    if (req.session.user.role !== 'user') {
      req.flash('error', 'Access denied');
      return res.redirect('/inventory');
    }
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      req.flash('error', 'Invalid booking');
      return res.redirect('/my-orders');
    }
    try {
      const order = await getOrderByIdAsync(orderId);
    if (!order || order.userId !== userId) {
      req.flash('error', 'Booking not found');
      return res.redirect('/my-orders');
    }
    if (!order.delivered_at) {
      req.flash('error', 'Confirm session first');
        return res.redirect('/my-orders');
      }
      const detailed = await buildOrderDetails(order, null);
      if (detailed.review) {
        req.flash('info', 'Review already submitted');
        return res.redirect('/my-orders');
      }
      return res.render('reviewBooking', {
        user: req.session && req.session.user,
        order: detailed
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to load review form');
      return res.redirect('/my-orders');
    }
  },

  async submitReview(req, res) {
    const userId = req.session && req.session.user && req.session.user.id;
    if (!userId) {
      req.flash('error', 'Please log in');
      return res.redirect('/login');
    }
    if (req.session.user.role !== 'user') {
      req.flash('error', 'Access denied');
      return res.redirect('/inventory');
    }
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      req.flash('error', 'Invalid booking');
      return res.redirect('/my-orders');
    }
    const rating = Math.min(5, Math.max(1, Math.round(Number(req.body.rating) || 0)));
    const comment = (req.body.comment || '').trim();
    if (!rating) {
      req.flash('error', 'Provide a rating between 1 and 5');
      return res.redirect(`/orders/${orderId}/review`);
    }
    try {
      const order = await getOrderByIdAsync(orderId);
      if (!order || order.userId !== userId) {
      req.flash('error', 'Booking not found');
        return res.redirect('/my-orders');
      }
      if (!order.delivered_at) {
      req.flash('error', 'Confirm session first');
        return res.redirect('/my-orders');
      }
      const existing = await new Promise((resolve, reject) => {
        Booking.getReviewByOrderId(orderId, (err, review) => (err ? reject(err) : resolve(review)));
      });
      if (existing) {
        req.flash('info', 'Review already submitted');
        return res.redirect('/my-orders');
      }
      await new Promise((resolve, reject) => {
        Booking.createReview(
          {
            order_id: orderId,
            user_id: userId,
            rating,
            comment
          },
          (err) => (err ? reject(err) : resolve())
        );
      });
      req.flash('success', 'Review saved');
      return res.redirect('/my-orders');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to save review');
      return res.redirect(`/orders/${orderId}/review`);
    }
  }

  ,
  async deleteReview(req, res) {
    if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
      req.flash('error', 'Access denied');
      return res.redirect('/orders');
    }
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      req.flash('error', 'Invalid booking');
      return res.redirect('/orders');
    }
    try {
      await new Promise((resolve, reject) => {
        Booking.deleteReviewByOrder(orderId, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Review deleted');
      return res.redirect('/orders');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to delete review');
      return res.redirect('/orders');
    }
  }
};
