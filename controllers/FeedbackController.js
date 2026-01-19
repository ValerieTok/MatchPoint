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

module.exports = {
  async showFeedbackForm(req, res) {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please log in to submit feedback.');
      return res.redirect('/login');
    }
    try {
      const selectedBookingId = req.query && req.query.booking_id ? parseInt(req.query.booking_id, 10) : null;
      if (!selectedBookingId || Number.isNaN(selectedBookingId)) {
        req.flash('error', 'Select a session from the ratings page first.');
        return res.redirect('/ratingsUser');
      }
      const order = await getOrderByIdAsync(selectedBookingId);
      if (!order || order.user_id !== req.session.user.id) {
        req.flash('error', 'Booking not found.');
        return res.redirect('/ratingsUser');
      }
      if (!order.completed_at) {
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
      return res.redirect(`/feedback?booking_id=${bookingId}`);
    }

    try {
      const order = await getOrderByIdAsync(bookingId);
      if (!order || order.user_id !== req.session.user.id) {
        req.flash('error', 'Booking not found.');
        return res.redirect('/ratingsUser');
      }
      if (!order.completed_at) {
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
      return res.redirect('/ratingsUser');
    } catch (err) {
      console.error('Feedback submission error:', err);
      req.flash('error', 'Unable to submit feedback.');
      return res.redirect(`/feedback?booking_id=${bookingId}`);
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

