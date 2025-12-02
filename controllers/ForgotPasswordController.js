const crypto = require('crypto');
const ForgotPasswordModel = require('../models/ForgotPassword');

const ForgotPasswordController = {
  forgotPasswordPage(req, res) {
    return res.render('forgotPassword', {
      messages: res.locals.messages,
      user: req.session && req.session.user
    });
  },

  async requestPasswordReset(req, res) {
    const email = req.body && req.body.email ? String(req.body.email).trim().toLowerCase() : '';
    const password = req.body && req.body.password ? String(req.body.password) : '';
    const confirmPassword = req.body && req.body.confirmPassword ? String(req.body.confirmPassword) : '';
    if (!email || !password || !confirmPassword) {
      req.flash('error', 'Email and both password fields are required.');
      return res.redirect('/forgot-password');
    }
    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect('/forgot-password');
    }
    if (password.length < 6) {
      req.flash('error', 'Password must be at least 6 characters.');
      return res.redirect('/forgot-password');
    }
    try {
      const user = await new Promise((resolve, reject) => {
        ForgotPasswordModel.getUserByEmail(email, (err, row) => (err ? reject(err) : resolve(row)));
      });
      if (!user) {
        req.flash('error', 'Account not found for that email.');
        return res.redirect('/forgot-password');
      }
      const hashedNewPassword = crypto.createHash('sha1').update(password).digest('hex');
      if (user.password && user.password === hashedNewPassword) {
        req.flash('error', 'New password must be different from your current password.');
        return res.redirect('/forgot-password');
      }
      await new Promise((resolve, reject) => {
        ForgotPasswordModel.updatePassword(user.id, password, (err) => (err ? reject(err) : resolve()));
      });
      console.info(`[Password Reset] Updated password for user #${user.id} (${user.email})`);
      req.flash('success', 'Password updated. Please log in with the new credentials.');
      return res.redirect('/login');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to reset password. Try again later.');
      return res.redirect('/forgot-password');
    }
  }
};

module.exports = ForgotPasswordController;
