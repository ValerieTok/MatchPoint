const userModel = require('../models/Account');
const userProfileModel = require('../models/UserProfile');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const getAdminCount = () =>
  new Promise((resolve, reject) => {
    userModel.getAdminCount((err, count) => (err ? reject(err) : resolve(count || 0)));
  });

const getUserByIdAsync = (id) =>
  new Promise((resolve, reject) => {
    userModel.getUserById(id, (err, u) => (err ? reject(err) : resolve(u)));
  });

const ensureAdminOnly = (req, res) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return true;
  }
  req.flash('error', 'Access denied');
  res.redirect('/listingsManage');
  return false;
};

function buildSafeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    contact: user.contact,
    role: user.role,
    is_2fa_enabled: user.is_2fa_enabled ? 1 : 0
  };
}

const AccountController = {
  registerPage(req, res) {
    const formData = req.flash('formData')[0] || {};
    return res.render('register', { messages: res.locals.messages, formData, user: req.session && req.session.user });
  },

  async registerUser(req, res) {
    const { username, email, password, contact, role } = req.body || {};
    if (!email || !password) {
      req.flash('error', 'Email and password required');
      req.flash('formData', { username, email, contact, role });
      return res.redirect('/register');
    }
    if (password.length < 8) {
      req.flash('error', 'Password must be at least 8 characters');
      req.flash('formData', { username, email, contact, role });
      return res.redirect('/register');
    }
    try {
      const existing = await new Promise((resolve, reject) => {
        userModel.getUserByEmail(email, (err, user) => (err ? reject(err) : resolve(user)));
      });
      if (existing) {
        req.flash('error', 'Email already registered');
        req.flash('formData', { username, email, contact, role });
        return res.redirect('/register');
      }
      await new Promise((resolve, reject) => {
        userModel.addUser({ username, email, password, contact, role }, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Registration successful. Log in.');
      return res.redirect('/login');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to register');
      return res.redirect('/register');
    }
  },

  loginPage(req, res) {
    return res.render('login', { messages: res.locals.messages, user: req.session && req.session.user });
  },

  async loginUser(req, res) {
    const { email, password } = req.body || {};
    if (!email || !password) {
      req.flash('error', 'Email and password required');
      return res.redirect('/login');
    }
    try {
      const authFn = typeof userModel.authenticate === 'function' ? userModel.authenticate : userModel.authenticateUser;
      const user = await new Promise((resolve, reject) => {
        if (!authFn) return resolve(null);
        authFn.call(userModel, email, password, (err, u) => (err ? reject(err) : resolve(u)));
      });
      if (!user) {
        req.flash('error', 'Invalid credentials');
        return res.redirect('/login');
      }
      const safeUser = buildSafeUser(user);
      if (safeUser.is_2fa_enabled) {
        await new Promise(function (resolve, reject) {
          req.session.regenerate(function (err) {
            return err ? reject(err) : resolve();
          });
        });
        req.session.pending2FAUserId = safeUser.id;
        req.flash('success', 'Enter your authentication code to finish logging in.');
        return req.session.save(function () {
          return res.redirect('/login2FA');
        });
      }
      await new Promise(function (resolve, reject) {
        req.session.regenerate(function (err) {
          return err ? reject(err) : resolve();
        });
      });
      req.session.user = safeUser;
      req.session.cart = [];
      req.flash('success', 'Login successful');
      return req.session.save(function () {
        return res.redirect(safeUser.role === 'admin' || safeUser.role === 'coach' ? '/listingsManage' : '/userdashboard');
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Authentication failed');
      return res.redirect('/login');
    }
  },

  logoutUser(req, res) {
    req.session.regenerate((err) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Logout failed, please try again.');
        return res.redirect('/');
      }
      req.flash('success', 'Logged out successfully');
      return res.redirect('/login');
    });
  },

  // admin helpers
  async listAllUsers(req, res) {
    if (!ensureAdminOnly(req, res)) return;
    try {
      const users = await new Promise((resolve, reject) => {
        userModel.getAllUsers((err, rows) => (err ? reject(err) : resolve(rows)));
      });
      return res.render('accounts', { users, user: req.session && req.session.user });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to load users');
      return res.redirect('/');
    }
  },

  async addUser(req, res) {
    if (!ensureAdminOnly(req, res)) return;
    const payload = {
      username: req.body.username,
      email: req.body.email,
      password: req.body.password,
      contact: req.body.contact || null,
      role: req.body.role || 'user'
    };
    if (payload.password && payload.password.length < 8) {
      req.flash('error', 'Password must be at least 8 characters');
      return res.redirect('/accounts');
    }
    try {
      const existing = await new Promise((resolve, reject) => {
        userModel.getUserByEmail(payload.email, (err, user) => (err ? reject(err) : resolve(user)));
      });
      if (existing) {
        req.flash('error', 'Email already registered');
        return res.redirect('/accounts');
      }

      await new Promise((resolve, reject) => {
        userModel.addUser(payload, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'User added');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to add user');
    }
    return res.redirect('/accounts');
  },

  async updateUser(req, res) {
    if (!ensureAdminOnly(req, res)) return;
    const id = req.params.id;
    let existingUser;
    try {
      existingUser = await getUserByIdAsync(id);
    } catch (err) {
      console.error(err);
    }
    if (!existingUser) {
      req.flash('error', 'User not found');
      return res.redirect('/accounts');
    }
    const updated = {
      username: req.body.username,
      email: req.body.email,
      contact: req.body.contact || null,
      role: req.body.role || 'user'
    };
    if (req.body.password) {
      if (req.body.password.length < 8) {
        req.flash('error', 'Password must be at least 8 characters');
        return res.redirect('/accounts');
      }
      updated.password = req.body.password;
    }
    try {
      if (existingUser.role === 'admin' && updated.role !== 'admin') {
        const adminCount = await getAdminCount();
        if (adminCount <= 1) {
          req.flash('error', 'Cannot remove the last remaining admin');
          return res.redirect('/accounts');
        }
      }
      await new Promise((resolve, reject) => {
        userModel.updateUser(id, updated, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'User updated');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to update user');
    }
    return res.redirect('/accounts');
  },

  async deleteUser(req, res) {
    if (!ensureAdminOnly(req, res)) return;
    const id = req.params.id;
    try {
      const userToDelete = await getUserByIdAsync(id);
      if (!userToDelete) {
        req.flash('error', 'User not found');
        return res.redirect('/accounts');
      }
      if (userToDelete.role === 'admin') {
        const adminCount = await getAdminCount();
        if (adminCount <= 1) {
          req.flash('error', 'Cannot delete the last remaining admin');
          return res.redirect('/accounts');
        }
      }
      await new Promise((resolve, reject) => {
        userModel.deleteUser(id, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'User deleted');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to delete user');
    }
    return res.redirect('/accounts');
  },

  async disableTwoFactor(req, res) {
    if (!ensureAdminOnly(req, res)) return;
    const id = req.params.id;
    try {
      await new Promise(function (resolve, reject) {
        userModel.disableTwoFactor(id, function (err) {
          return err ? reject(err) : resolve();
        });
      });
      if (req.session && req.session.user && String(req.session.user.id) === String(id)) {
        req.session.user.is_2fa_enabled = 0;
      }
      req.flash('success', 'Two-factor authentication disabled for user #' + id);
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not disable two-factor authentication for this user.');
    }
    return res.redirect('/accounts');
  },

  async disableOwnTwoFactor(req, res) {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please log in');
      return res.redirect('/login');
    }
    const id = req.session.user.id;
    try {
      await new Promise(function (resolve, reject) {
        userModel.disableTwoFactor(id, function (err) {
          return err ? reject(err) : resolve();
        });
      });
      req.session.user.is_2fa_enabled = 0;
      delete req.session.temp2FASecret;
      req.flash('success', 'Two-factor authentication disabled.');
      await new Promise(function (resolve, reject) {
        req.session.save(function (err) {
          return err ? reject(err) : resolve();
        });
      });
      return res.redirect('/2FASetup');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not disable two-factor authentication.');
      return res.redirect('/2FASetup');
    }
  },

  showTwoFactorSetup: async function (req, res) {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please log in');
      return res.redirect('/login');
    }
    const currentUser = req.session.user;
    if (currentUser.is_2fa_enabled) {
      delete req.session.temp2FASecret;
      return res.render('2FASetup', {
        user: req.session.user,
        messages: res.locals.messages,
        qrCodeDataURL: null,
        manualKey: null,
        alreadyEnabled: 1
      });
    }
    let secret;
    try {
      secret = speakeasy.generateSecret({ name: 'MatchPoint Coaching (' + (currentUser.email || currentUser.username || '') + ')' });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not start two-factor setup.');
      return res.redirect('/');
    }
    req.session.temp2FASecret = secret.base32;
    QRCode.toDataURL(secret.otpauth_url, function (err, dataUrl) {
      if (err) {
        console.error(err);
        req.flash('error', 'Could not generate QR code.');
        return res.redirect('/');
      }
      return res.render('2FASetup', {
        user: req.session.user,
        messages: res.locals.messages,
        qrCodeDataURL: dataUrl,
        manualKey: secret.base32,
        alreadyEnabled: currentUser.is_2fa_enabled ? 1 : 0
      });
    });
  },

  verifyTwoFactorSetup: async function (req, res) {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please log in');
      return res.redirect('/login');
    }
    const token = req.body && req.body.token ? String(req.body.token).trim() : '';
    const tempSecret = req.session.temp2FASecret;
    if (!tempSecret) {
      req.flash('error', 'Setup session expired. Start again.');
      return res.redirect('/2FASetup');
    }
    const verified = speakeasy.totp.verify({
      secret: tempSecret,
      encoding: 'base32',
      token: token,
      window: 1
    });
    if (!verified) {
      req.flash('error', 'Invalid authentication code.');
      return res.redirect('/2FASetup');
    }
    try {
      await new Promise(function (resolve, reject) {
        userModel.saveTwoFactorSecret(req.session.user.id, tempSecret, function (err) {
          return err ? reject(err) : resolve();
        });
      });
      req.session.user.is_2fa_enabled = 1;
      delete req.session.temp2FASecret;
      req.flash('success', 'Two-factor authentication enabled.');
      return req.session.save(function () {
        return res.redirect('/');
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not enable two-factor authentication.');
      return res.redirect('/2FASetup');
    }
  },

  showTwoFactorLogin: function (req, res) {
    if (!req.session || !req.session.pending2FAUserId) {
      req.flash('error', 'No pending login.');
      return res.redirect('/login');
    }
    return res.render('login2FA', { user: null, messages: res.locals.messages });
  },

  verifyTwoFactorLogin: async function (req, res) {
    const pendingId = req.session && req.session.pending2FAUserId;
    if (!pendingId) {
      req.flash('error', 'No pending login.');
      return res.redirect('/login');
    }
    const token = req.body && req.body.token ? String(req.body.token).trim() : '';
    if (!token) {
      req.flash('error', 'Enter the 6-digit code.');
      return res.redirect('/login2FA');
    }
    let user;
    try {
      user = await getUserByIdAsync(pendingId);
    } catch (err) {
      console.error(err);
    }
    if (!user || !user.twofactor_secret) {
      req.flash('error', 'Login session expired.');
      return res.redirect('/login');
    }
    const verified = speakeasy.totp.verify({
      secret: user.twofactor_secret,
      encoding: 'base32',
      token: token,
      window: 1
    });
    if (!verified) {
      req.flash('error', 'Invalid authentication code.');
      return res.redirect('/login2FA');
    }
    const safeUser = buildSafeUser(user);
    req.session.pending2FAUserId = null;
    await new Promise(function (resolve, reject) {
      req.session.regenerate(function (err) {
        return err ? reject(err) : resolve();
      });
    });
    req.session.user = safeUser;
    req.session.cart = [];
    req.flash('success', 'Login successful');
    return req.session.save(function () {
      return res.redirect(safeUser.role === 'admin' || safeUser.role === 'coach' ? '/listingsManage' : '/listingsBrowse');
    });  },

  async showProfile(req, res) {
    const userId = req.session?.user?.id;
    if (!userId) {
      req.flash('error', 'Please log in to view your profile');
      return res.redirect('/login');
    }

    try {
      const user = await getUserByIdAsync(userId);
      if (!user) {
        req.flash('error', 'User not found');
        return res.redirect('/');
      }

      const profile = await new Promise((resolve, reject) => {
        userProfileModel.getByUserId(userId, (err, row) => (err ? reject(err) : resolve(row)));
      });

      // Get past bookings
      const Booking = require('../models/Booking');
      const bookings = await new Promise((resolve, reject) => {
        Booking.getOrdersByUser(userId, (err, result) => {
          if (err) return reject(err);
          resolve(result || []);
        });
      });

      // Get booking items for past sessions
      const sessionsWithDetails = await Promise.all(
        bookings.map(async (booking) => {
          const items = await new Promise((resolve, reject) => {
            Booking.getOrderItems(booking.id, null, (err, result) => {
              if (err) return reject(err);
              resolve(result || []);
            });
          });
          return { ...booking, items };
        })
      );

      return res.render('profile', {
        user,
        profile,
        messages: res.locals.messages,
        sessions: sessionsWithDetails
      });
    } catch (err) {
      console.error('Error loading profile:', err);
      req.flash('error', 'Failed to load profile');
      return res.redirect('/userdashboard');
    }
  },

  async updateProfile(req, res) {
    const userId = req.session?.user?.id;
    if (!userId) {
      req.flash('error', 'Please log in');
      return res.redirect('/login');
    }

    const { first_name, last_name, email, contact, bio } = req.body || {};
    const photo = req.file ? `/images/${req.file.filename}` : undefined;

    if (!first_name || !email) {
      req.flash('error', 'First name and email are required');
      return res.redirect('/prof');
    }

    try {
      const existingProfile = await new Promise((resolve, reject) => {
        userProfileModel.getByUserId(userId, (err, row) => (err ? reject(err) : resolve(row)));
      });

      await new Promise((resolve, reject) => {
        userProfileModel.upsert(
          userId,
          {
            first_name,
            last_name,
            email,
            phone_number: contact,
            bio,
            photo: photo !== undefined ? photo : (existingProfile ? existingProfile.photo : null)
          },
          (err, result) => (err ? reject(err) : resolve(result))
        );
      });

      await new Promise((resolve, reject) => {
        userModel.updateUser(userId, { username: req.session.user.username, email, contact: req.session.user.contact, role: req.session.user.role }, (err, result) => {
          if (err) return reject(err);
          resolve(result);
        });
      });

      // Update session user data
      const updatedUser = await getUserByIdAsync(userId);
      if (updatedUser) {
        req.session.user = buildSafeUser(updatedUser);
      }

      req.flash('success', 'Profile updated successfully');
      return res.redirect('/prof');
    } catch (err) {
      console.error('Error updating profile:', err);
      req.flash('error', 'Failed to update profile');
      return res.redirect('/prof');
    }
  },

  async resetPassword(req, res) {
    const userId = req.session?.user?.id;
    if (!userId) {
      req.flash('error', 'Please log in');
      return res.redirect('/login');
    }

    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    if (!currentPassword || !newPassword || !confirmPassword) {
      req.flash('error', 'All password fields are required');
      return res.redirect('/prof');
    }

    if (newPassword.length < 8) {
      req.flash('error', 'New password must be at least 8 characters');
      return res.redirect('/prof');
    }

    if (newPassword !== confirmPassword) {
      req.flash('error', 'New passwords do not match');
      return res.redirect('/prof');
    }

    try {
      const user = await getUserByIdAsync(userId);
      if (!user) {
        req.flash('error', 'User not found');
        return res.redirect('/prof');
      }

      // Verify current password
      const bcrypt = require('bcryptjs');
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        req.flash('error', 'Current password is incorrect');
        return res.redirect('/prof');
      }

      // Update password
      await new Promise((resolve, reject) => {
        userModel.updateUser(userId, { username: user.username, email: user.email, contact: user.contact, role: user.role, password: newPassword }, (err, result) => {
          if (err) return reject(err);
          resolve(result);
        });
      });

      // Log the user out after a successful password reset
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          console.error('Session regenerate failed after password reset', regenErr);
        }
        req.flash('success', 'Password updated successfully. Please log in again.');
        return res.redirect('/login');
      });
      return undefined;
    } catch (err) {
      console.error('Error resetting password:', err);
      req.flash('error', 'Failed to reset password');
      return res.redirect('/prof');
    }
  }
};

module.exports = AccountController;

