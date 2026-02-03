const Feedback = require('../models/Feedback');
const Booking = require('../models/Booking');

const createFeedbackAsync = (userId, feedbackData) =>
  new Promise((resolve, reject) => {
    Feedback.create(userId, feedbackData, (err, result) => (err ? reject(err) : resolve(result)));
  });

const getAllFeedbackAsync = () =>
  new Promise((resolve, reject) => {
    Feedback.getAll((err, feedback) => (err ? reject(err) : resolve(feedback)));
  });

const getOrderByIdAsync = (orderId) =>
  new Promise((resolve, reject) => {
    Booking.getOrderById(orderId, (err, order) => (err ? reject(err) : resolve(order)));
  });

const getReviewByOrderIdAsync = (orderId) =>
  new Promise((resolve, reject) => {
    Booking.getReviewByOrderId(orderId, (err, review) => (err ? reject(err) : resolve(review)));
  });

const getOrderItemsAsync = (orderId) =>
  new Promise((resolve, reject) => {
    Booking.getOrderItems(orderId, null, (err, items) => (err ? reject(err) : resolve(items || [])));
  });

const isOrderCompleted = (order, items) => {
  const completedAt = order && order.completed_at ? new Date(order.completed_at) : null;
  if (completedAt && !Number.isNaN(completedAt.getTime())) return true;
  const normalizeDate = (value) => {
    if (!value) return '';
    if (value instanceof Date) {
      const yyyy = value.getFullYear();
      const mm = String(value.getMonth() + 1).padStart(2, '0');
      const dd = String(value.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    const raw = String(value);
    return raw.includes('T') ? raw.split('T')[0] : raw;
  };
  const normalizeTime = (value) => {
    if (!value) return '00:00:00';
    const raw = String(value);
    return raw.length >= 8 ? raw.slice(0, 8) : `${raw}:00`;
  };
  const toLocalTimestamp = (dateStr, timeStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
    const [year, month, day] = parts;
    const t = (timeStr || '00:00:00').split(':').map(Number);
    const [hour, minute, second] = [
      Number.isNaN(t[0]) ? 0 : t[0],
      Number.isNaN(t[1]) ? 0 : t[1],
      Number.isNaN(t[2]) ? 0 : t[2]
    ];
    return new Date(year, month - 1, day, hour, minute, second).getTime();
  };

  return (items || []).some((item) => {
    const datePart = normalizeDate(item.session_date);
    const timePart = normalizeTime(item.session_time);
    const sessionLocal = toLocalTimestamp(datePart, timePart);
    return sessionLocal !== null && sessionLocal <= Date.now();
  });
};

module.exports = {
  async showFeedbackForm(req, res) {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please log in to submit feedback.');
      return res.redirect('/login');
    }
    try {
      const selectedBookingId = req.query && req.query.booking_id
        ? parseInt(req.query.booking_id, 10)
        : (req.session && req.session.pendingFeedbackBookingId
          ? parseInt(req.session.pendingFeedbackBookingId, 10)
          : null);
      if (!selectedBookingId || Number.isNaN(selectedBookingId)) {
        req.flash('error', 'Select a session from the ratings page first.');
        return res.redirect('/ratingsUser');
      }
      req.session.pendingFeedbackBookingId = selectedBookingId;
      const order = await getOrderByIdAsync(selectedBookingId);
      if (!order || order.user_id !== req.session.user.id) {
        req.flash('error', 'Booking not found.');
        return res.redirect('/ratingsUser');
      }
      const items = await getOrderItemsAsync(selectedBookingId);
      if (!isOrderCompleted(order, items)) {
        req.flash('error', 'Complete the session before leaving feedback.');
        return res.redirect('/ratingsUser');
      }
      const existing = await getReviewByOrderIdAsync(selectedBookingId);
      if (existing) {
        req.flash('info', 'Feedback already submitted.');
        return res.redirect('/ratingsUser');
      }
      return res.render('feedback', {
        user: req.session.user,
        selectedBookingId,
        messages: res.locals.messages
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to load feedback form.');
      return res.redirect('/userdashboard');
    }
  },

  async submitFeedback(req, res) {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please log in to submit feedback.');
      return res.redirect('/login');
    }

    const bookingId = req.body.booking_id ? parseInt(req.body.booking_id, 10) : null;
    const message = req.body.message ? String(req.body.message).trim() : '';
    const rating = req.body.rating ? parseInt(req.body.rating, 10) : null;

    if (!bookingId) {
      req.flash('error', 'Please select a session to review.');
      return res.redirect('/ratingsUser');
    }
    if (!message) {
      req.flash('error', 'Message is required.');
      return res.redirect('/feedback');
    }

    try {
      const order = await getOrderByIdAsync(bookingId);
      if (!order || order.user_id !== req.session.user.id) {
        req.flash('error', 'Booking not found.');
        return res.redirect('/ratingsUser');
      }
      const items = await getOrderItemsAsync(bookingId);
      if (!isOrderCompleted(order, items)) {
        req.flash('error', 'Complete the session before leaving feedback.');
        return res.redirect('/ratingsUser');
      }
      const existing = await getReviewByOrderIdAsync(bookingId);
      if (existing) {
        req.flash('info', 'Feedback already submitted.');
        return res.redirect('/ratingsUser');
      }
      await createFeedbackAsync(req.session.user.id, {
        booking_id: bookingId,
        message,
        rating
      });
      req.flash('success', 'Thank you! Your feedback has been submitted.');
      delete req.session.pendingFeedbackBookingId;
      return res.redirect('/ratingsUser');
    } catch (err) {
      console.error('Feedback submission error:', err);
      req.flash('error', 'Unable to submit feedback.');
      return res.redirect('/feedback');
    }
  },

  async listAllFeedback(req, res) {
    if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
      req.flash('error', 'Access denied');
      return res.redirect('/');
    }

    try {
      const feedback = await getAllFeedbackAsync();
      return res.render('adminfeedback', {
        feedback,
        user: req.session.user,
        messages: res.locals.messages
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to load feedback.');
      return res.redirect('/admindashboard');
    }
  }
};

