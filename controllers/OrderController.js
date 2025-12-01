const Order = require('../models/Order');
const userModel = require('../models/User');

const buildOrderDetails = (order) =>
  new Promise((resolve) => {
    Order.getOrderItems(order.id, (itemsErr, items) => {
      Order.getReviewByOrderId(order.id, (reviewErr, review) => {
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
    Order.getOrderById(id, (err, order) => (err ? reject(err) : resolve(order)));
  });

module.exports = {
  listAllOrders(req, res) {
    Order.getAllOrders((err, orders) => {
      if (err) {
        console.error('Failed to load orders', err);
        req.flash('error', 'Unable to load orders right now.');
        return res.redirect('/inventory');
      }
      const withItems = Promise.all(orders.map((o) => buildOrderDetails(o)));
      withItems.then((ordersWithItems) =>
        res.render('orders', {
          user: req.session && req.session.user,
          orders: ordersWithItems
        })
      );
    });
  },

  userOrders(req, res) {
    const userId = req.session.user.id;
    Order.getOrdersByUser(userId, (err, orders) => {
      if (err) {
        console.error('Failed to load order history', err);
        req.flash('error', 'Unable to load your orders right now.');
        return res.redirect('/shopping');
      }
      const withItems = Promise.all(orders.map((o) => buildOrderDetails(o)));
      withItems.then((ordersWithItems) =>
        res.render('orders_user', {
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
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      req.flash('error', 'Invalid order');
      return res.redirect('/my-orders');
    }
    try {
      const order = await getOrderByIdAsync(orderId);
      if (!order || order.userId !== userId) {
        req.flash('error', 'Order not found');
        return res.redirect('/my-orders');
      }
      if (!order.delivered_at) {
        await new Promise((resolve, reject) => {
          Order.markOrderDelivered(orderId, (err) => (err ? reject(err) : resolve()));
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
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      req.flash('error', 'Invalid order');
      return res.redirect('/my-orders');
    }
    try {
      const order = await getOrderByIdAsync(orderId);
      if (!order || order.userId !== userId) {
        req.flash('error', 'Order not found');
        return res.redirect('/my-orders');
      }
      if (!order.delivered_at) {
        req.flash('error', 'Confirm delivery first');
        return res.redirect('/my-orders');
      }
      const detailed = await buildOrderDetails(order);
      if (detailed.review) {
        req.flash('info', 'Review already submitted');
        return res.redirect('/my-orders');
      }
      return res.render('reviewOrder', {
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
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      req.flash('error', 'Invalid order');
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
        req.flash('error', 'Order not found');
        return res.redirect('/my-orders');
      }
      if (!order.delivered_at) {
        req.flash('error', 'Confirm delivery first');
        return res.redirect('/my-orders');
      }
      const existing = await new Promise((resolve, reject) => {
        Order.getReviewByOrderId(orderId, (err, review) => (err ? reject(err) : resolve(review)));
      });
      if (existing) {
        req.flash('info', 'Review already submitted');
        return res.redirect('/my-orders');
      }
      await new Promise((resolve, reject) => {
        Order.createReview(
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
      req.flash('error', 'Invalid order');
      return res.redirect('/orders');
    }
    try {
      await new Promise((resolve, reject) => {
        Order.deleteReviewByOrder(orderId, (err) => (err ? reject(err) : resolve()));
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
