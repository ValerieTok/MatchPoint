const Feedback = require('../models/Feedback');
const Booking = require('../models/Booking');

const getFeedbackByUserIdAsync = (userId) =>
  new Promise((resolve, reject) => {
    Feedback.getByUserId(userId, (err, feedback) => (err ? reject(err) : resolve(feedback)));
  });

const createFeedbackAsync = (userId, feedbackData) =>
  new Promise((resolve, reject) => {
    Feedback.create(userId, feedbackData, (err, result) => (err ? reject(err) : resolve(result)));
  });

const getAllFeedbackAsync = () =>
  new Promise((resolve, reject) => {
    Feedback.getAll((err, feedback) => (err ? reject(err) : resolve(feedback)));
  });

const getUserSessionsAsync = (userId) =>
  new Promise((resolve, reject) => {
    Booking.getAllUserSessions(userId, (err, sessions) => (err ? reject(err) : resolve(sessions || [])));
  });

module.exports = {
  async showFeedbackForm(req, res) {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please log in to submit feedback.');
      return res.redirect('/login');
    }
    try {
      const sessions = await getUserSessionsAsync(req.session.user.id);
      return res.render('feedback', {
        user: req.session.user,
        sessions,
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

    console.log('Feedback submission:', { bookingId, message, rating, userId: req.session.user.id });

    if (!bookingId) {
      req.flash('error', 'Please select a session to review.');
      return res.redirect('/feedback');
    }
    if (!message) {
      req.flash('error', 'Message is required.');
      return res.redirect('/feedback');
    }

    try {
      await createFeedbackAsync(req.session.user.id, {
        booking_id: bookingId,
        message,
        rating
      });
      req.flash('success', 'Thank you! Your feedback has been submitted.');
      return res.redirect('/prof');
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
