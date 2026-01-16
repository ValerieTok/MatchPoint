const Account = require('../models/Account');
const Booking = require('../models/Booking');
const UserProfile = require('../models/UserProfile');

const getUserByIdAsync = (id) =>
  new Promise((resolve, reject) => {
    Account.getUserById(id, (err, user) => (err ? reject(err) : resolve(user)));
  });

const getUserByEmailAsync = (email) =>
  new Promise((resolve, reject) => {
    Account.getUserByEmail(email, (err, user) => (err ? reject(err) : resolve(user)));
  });

const getProfileByUserIdAsync = (id) =>
  new Promise((resolve, reject) => {
    UserProfile.getByUserId(id, (err, profile) => (err ? reject(err) : resolve(profile)));
  });

const upsertProfileAsync = (id, payload) =>
  new Promise((resolve, reject) => {
    UserProfile.upsertDetails(id, payload, (err) => (err ? reject(err) : resolve()));
  });

const upsertPhotoAsync = (id, fileName) =>
  new Promise((resolve, reject) => {
    UserProfile.upsertPhoto(id, fileName, (err) => (err ? reject(err) : resolve()));
  });

const updateProfileAsync = (id, payload) =>
  new Promise((resolve, reject) => {
    Account.updateProfile(id, payload, (err) => (err ? reject(err) : resolve()));
  });

const updatePasswordAsync = (id, password) =>
  new Promise((resolve, reject) => {
    Account.updatePassword(id, password, (err) => (err ? reject(err) : resolve()));
  });

const authenticateAsync = (email, password) =>
  new Promise((resolve, reject) => {
    const authFn = typeof Account.authenticate === 'function' ? Account.authenticate : Account.authenticateUser;
    if (!authFn) return resolve(null);
    authFn.call(Account, email, password, (err, user) => (err ? reject(err) : resolve(user)));
  });

const getUserSessionsAsync = (id) =>
  new Promise((resolve, reject) => {
    Booking.getUserDashboardSessions(id, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });

const ensureUserProfileAccess = (req, res) => {
  const sessionUser = req.session && req.session.user;
  if (!sessionUser) {
    req.flash('error', 'Access denied');
    res.redirect('/login');
    return null;
  }
  return sessionUser;
};

module.exports = {
  async showProfile(req, res) {
    const sessionUser = ensureUserProfileAccess(req, res);
    if (!sessionUser) return;
    try {
      const account = await getUserByIdAsync(sessionUser.id);
      const profile = await getProfileByUserIdAsync(sessionUser.id);
      const sessions = await getUserSessionsAsync(sessionUser.id);
      const pastSessions = sessions.filter((row) => row.session_completed).slice(0, 2);
      return res.render('profile', {
        user: sessionUser,
        account,
        profile,
        sessions: pastSessions,
        messages: res.locals.messages
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to load profile.');
      return res.redirect('/userdashboard');
    }
  },

  async updateProfile(req, res) {
    const sessionUser = ensureUserProfileAccess(req, res);
    if (!sessionUser) return;
    const firstName = req.body.first_name ? String(req.body.first_name).trim() : '';
    const lastName = req.body.last_name ? String(req.body.last_name).trim() : '';
    const email = req.body.email ? String(req.body.email).trim() : '';
    const phone = req.body.phone ? String(req.body.phone).trim() : '';
    const bio = req.body.bio ? String(req.body.bio).trim() : '';
    if (!firstName) {
      req.flash('error', 'First name is required.');
      return res.redirect('/prof');
    }
    if (!email) {
      req.flash('error', 'Email is required.');
      return res.redirect('/prof');
    }
    try {
      const existing = await getUserByEmailAsync(email);
      if (existing && String(existing.id) !== String(sessionUser.id)) {
        req.flash('error', 'Email is already in use.');
        return res.redirect('/prof');
      }
      const fullName = [firstName, lastName].filter(Boolean).join(' ');
      await updateProfileAsync(sessionUser.id, {
        full_name: fullName,
        email,
        contact: phone
      });
      await upsertProfileAsync(sessionUser.id, {
        first_name: firstName,
        last_name: lastName,
        phone,
        bio
      });
      sessionUser.full_name = fullName;
      sessionUser.username = fullName || sessionUser.username;
      sessionUser.email = email;
      sessionUser.contact = phone;
      req.flash('success', 'Profile updated.');
      return res.redirect('/prof');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to update profile.');
      return res.redirect('/prof');
    }
  },

  async updatePassword(req, res) {
    const sessionUser = ensureUserProfileAccess(req, res);
    if (!sessionUser) return;
    const currentPassword = req.body.current_password ? String(req.body.current_password) : '';
    const newPassword = req.body.new_password ? String(req.body.new_password) : '';
    const confirmPassword = req.body.confirm_password ? String(req.body.confirm_password) : '';
    if (!currentPassword || !newPassword || !confirmPassword) {
      req.flash('error', 'All password fields are required.');
      return res.redirect('/prof');
    }
    if (newPassword.length < 8) {
      req.flash('error', 'New password must be at least 8 characters.');
      return res.redirect('/prof');
    }
    if (newPassword !== confirmPassword) {
      req.flash('error', 'New password confirmation does not match.');
      return res.redirect('/prof');
    }
    try {
      const fullUser = await getUserByIdAsync(sessionUser.id);
      const authUser = await authenticateAsync(fullUser.email, currentPassword);
      if (!authUser) {
        req.flash('error', 'Current password is incorrect.');
        return res.redirect('/prof');
      }
      await updatePasswordAsync(sessionUser.id, newPassword);
      req.flash('success', 'Password updated.');
      return res.redirect('/prof');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to update password.');
      return res.redirect('/prof');
    }
  },

  async updatePhoto(req, res) {
    const sessionUser = ensureUserProfileAccess(req, res);
    if (!sessionUser) return;
    const fileName = req.file && req.file.filename ? req.file.filename : null;
    if (!fileName) {
      req.flash('error', 'Please upload a photo.');
      return res.redirect('/prof');
    }
    try {
      await upsertPhotoAsync(sessionUser.id, fileName);
      req.flash('success', 'Profile photo updated.');
      return res.redirect('/prof');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to update photo.');
      return res.redirect('/prof');
    }
  }
};
