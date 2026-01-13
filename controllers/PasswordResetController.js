const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const PasswordResetModel = require('../models/PasswordReset');

const SALT_ROUNDS = 12;
const isBcryptHash = (value) => typeof value === 'string' && value.startsWith('$2');
const sha1 = (value) => crypto.createHash('sha1').update(value).digest('hex');
const isSamePassword = async (plain, hash) => {
  if (!hash) return false;
  if (isBcryptHash(hash)) return bcrypt.compare(plain, hash);
  return sha1(plain) === hash;
};

const PasswordResetController = {
  forgotPasswordPage(req, res) {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please log in to change your password.');
      return res.redirect('/login');
    }
    return res.render('forgotPassword', {
      messages: res.locals.messages,
      user: req.session && req.session.user
    });
  },

  async requestPasswordReset(req, res) {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please log in to change your password.');
      return res.redirect('/login');
    }
    const password = req.body && req.body.password ? String(req.body.password) : '';
    const confirmPassword = req.body && req.body.confirmPassword ? String(req.body.confirmPassword) : '';
    if (!password || !confirmPassword) {
      req.flash('error', 'Both password fields are required.');
      return res.redirect('/forgot-password');
    }
    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect('/forgot-password');
    }
    if (password.length < 8) {
      req.flash('error', 'Password must be at least 8 characters.');
      return res.redirect('/forgot-password');
    }
    try {
      const userId = req.session.user.id;
      const user = await new Promise((resolve, reject) => {
        PasswordResetModel.getUserById(userId, (err, row) => (err ? reject(err) : resolve(row)));
      });
      if (!user) {
        req.flash('error', 'Account not found.');
        return res.redirect('/login');
      }
      if (await isSamePassword(password, user.password)) {
        req.flash('error', 'New password must be different from your current password.');
        return res.redirect('/forgot-password');
      }
      const hashedNewPassword = await bcrypt.hash(password, SALT_ROUNDS);
      await new Promise((resolve, reject) => {
        PasswordResetModel.updatePassword(user.id, hashedNewPassword, (err) => (err ? reject(err) : resolve()));
      });
      console.info(`[Password Reset] Updated password for user #${user.id} (${user.email})`);
      req.flash('success', 'Password updated.');
      return res.redirect('/');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to reset password. Try again later.');
      return res.redirect('/forgot-password');
    }
  }
};

module.exports = PasswordResetController;
