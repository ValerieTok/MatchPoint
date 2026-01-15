const Account = require('../models/Account');

const getUserByIdAsync = (id) =>
  new Promise((resolve, reject) => {
    Account.getUserById(id, (err, user) => (err ? reject(err) : resolve(user)));
  });

const getUserByEmailAsync = (email) =>
  new Promise((resolve, reject) => {
    Account.getUserByEmail(email, (err, user) => (err ? reject(err) : resolve(user)));
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

const updateCertAsync = (id, title, fileName) =>
  new Promise((resolve, reject) => {
    Account.updateCertification(id, title, fileName, (err) => (err ? reject(err) : resolve()));
  });

module.exports = {
  async showProfile(req, res) {
    const user = req.session && req.session.user;
    if (!user || (user.role !== 'coach' && user.role !== 'admin')) {
      req.flash('error', 'Access denied');
      return res.redirect('/listingsManage');
    }
    try {
      const profile = await getUserByIdAsync(user.id);
      return res.render('coachProfile', {
        user,
        profile,
        messages: res.locals.messages
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to load profile.');
      return res.redirect('/listingsManage');
    }
  },

  async updateProfile(req, res) {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser || (sessionUser.role !== 'coach' && sessionUser.role !== 'admin')) {
      req.flash('error', 'Access denied');
      return res.redirect('/listingsManage');
    }
    const fullName = req.body.full_name ? String(req.body.full_name).trim() : '';
    const email = req.body.email ? String(req.body.email).trim() : '';
    const contact = req.body.contact ? String(req.body.contact).trim() : '';
    if (!fullName) {
      req.flash('error', 'Full name is required.');
      return res.redirect('/coachProfile');
    }
    if (!email) {
      req.flash('error', 'Email is required.');
      return res.redirect('/coachProfile');
    }
    try {
      const existing = await getUserByEmailAsync(email);
      if (existing && String(existing.id) !== String(sessionUser.id)) {
        req.flash('error', 'Email is already in use.');
        return res.redirect('/coachProfile');
      }
      await updateProfileAsync(sessionUser.id, {
        full_name: fullName,
        email,
        contact
      });
      sessionUser.username = fullName || sessionUser.username;
      sessionUser.full_name = fullName;
      sessionUser.email = email;
      sessionUser.contact = contact;
      req.flash('success', 'Profile updated.');
      return res.redirect('/coachProfile');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to update profile.');
      return res.redirect('/coachProfile');
    }
  },

  async updatePassword(req, res) {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser || (sessionUser.role !== 'coach' && sessionUser.role !== 'admin')) {
      req.flash('error', 'Access denied');
      return res.redirect('/listingsManage');
    }
    const currentPassword = req.body.current_password ? String(req.body.current_password) : '';
    const newPassword = req.body.new_password ? String(req.body.new_password) : '';
    const confirmPassword = req.body.confirm_password ? String(req.body.confirm_password) : '';
    if (!currentPassword || !newPassword || !confirmPassword) {
      req.flash('error', 'All password fields are required.');
      return res.redirect('/coachProfile');
    }
    if (newPassword.length < 8) {
      req.flash('error', 'New password must be at least 8 characters.');
      return res.redirect('/coachProfile');
    }
    if (newPassword !== confirmPassword) {
      req.flash('error', 'New password confirmation does not match.');
      return res.redirect('/coachProfile');
    }
    try {
      const fullUser = await getUserByIdAsync(sessionUser.id);
      const authUser = await authenticateAsync(fullUser.email, currentPassword);
      if (!authUser) {
        req.flash('error', 'Current password is incorrect.');
        return res.redirect('/coachProfile');
      }
      await updatePasswordAsync(sessionUser.id, newPassword);
      req.flash('success', 'Password updated.');
      return res.redirect('/coachProfile');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to update password.');
      return res.redirect('/coachProfile');
    }
  },

  async updateCertification(req, res) {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser || (sessionUser.role !== 'coach' && sessionUser.role !== 'admin')) {
      req.flash('error', 'Access denied');
      return res.redirect('/listingsManage');
    }
    const title = req.body.cert_title ? String(req.body.cert_title).trim() : '';
    const fileName = req.file && req.file.filename ? req.file.filename : null;
    if (!title) {
      req.flash('error', 'Certification title is required.');
      return res.redirect('/coachProfile');
    }
    if (!fileName) {
      req.flash('error', 'Please upload a certification file.');
      return res.redirect('/coachProfile');
    }
    try {
      await updateCertAsync(sessionUser.id, title, fileName);
      req.flash('success', 'Certification updated.');
      return res.redirect('/coachProfile');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to update certification.');
      return res.redirect('/coachProfile');
    }
  }
};
