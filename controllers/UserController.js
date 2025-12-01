const userModel = require('../models/User');
const crypto = require('crypto');

const getAdminCount = () =>
  new Promise((resolve, reject) => {
    userModel.getAdminCount((err, count) => (err ? reject(err) : resolve(count || 0)));
  });

const getUserByIdAsync = (id) =>
  new Promise((resolve, reject) => {
    userModel.getUserById(id, (err, u) => (err ? reject(err) : resolve(u)));
  });

const UserController = {
  registerPage(req, res) {
    const formData = req.flash('formData')[0] || {};
    return res.render('register', { messages: res.locals.messages, formData, user: req.session && req.session.user });
  },

  async registerUser(req, res) {
    const { username, email, password, address, contact, role } = req.body || {};
    if (!email || !password) {
      req.flash('error', 'Email and password required');
      req.flash('formData', { username, email, address, contact, role });
      return res.redirect('/register');
    }
    if (password.length < 6) {
      req.flash('error', 'Password must be at least 6 characters');
      req.flash('formData', { username, email, address, contact, role });
      return res.redirect('/register');
    }
    try {
      const existing = await new Promise((resolve, reject) => {
        userModel.getUserByEmail(email, (err, user) => (err ? reject(err) : resolve(user)));
      });
      if (existing) {
        req.flash('error', 'Email already registered');
        req.flash('formData', { username, email, address, contact, role });
        return res.redirect('/register');
      }
      await new Promise((resolve, reject) => {
        userModel.addUser({ username, email, password, address, contact, role }, (err) => (err ? reject(err) : resolve()));
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
      let user = await new Promise((resolve, reject) => {
        if (!authFn) return resolve(null);
        authFn.call(userModel, email, password, (err, u) => (err ? reject(err) : resolve(u)));
      });
      if (!user) {
        user = await new Promise((resolve, reject) => {
          userModel.getUserByEmail(email, (err, u) => {
            if (err) return reject(err);
            if (!u) return resolve(null);
            const hashed = crypto.createHash('sha1').update(password).digest('hex');
            if (u.password !== hashed) return resolve(null);
            return resolve(u);
          });
        });
      }
      if (!user) {
        req.flash('error', 'Invalid credentials');
        return res.redirect('/login');
      }
      const safeUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        address: user.address,
        contact: user.contact,
        role: user.role,
        free_delivery: user.free_delivery ? 1 : 0
      };
      await new Promise((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });
      req.session.user = safeUser;
      req.session.cart = [];
      req.flash('success', 'Login successful');
      return req.session.save(() =>
        res.redirect(safeUser.role === 'admin' ? '/inventory' : '/shopping')
      );
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
    try {
      const users = await new Promise((resolve, reject) => {
        userModel.getAllUsers((err, rows) => (err ? reject(err) : resolve(rows)));
      });
      return res.render('users', { users, user: req.session && req.session.user });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to load users');
      return res.redirect('/');
    }
  },

  async getUserById(req, res) {
    const id = req.params.id;
    try {
      const user = await new Promise((resolve, reject) => {
        userModel.getUserById(id, (err, u) => (err ? reject(err) : resolve(u)));
      });
      if (!user) {
        req.flash('error', 'User not found');
        return res.redirect('/users');
      }
      return res.render('user', { user, currentUser: req.session && req.session.user });
    } catch (err) {
      console.error(err);
      req.flash('error', 'User not found');
      return res.redirect('/users');
    }
  },

  async addUser(req, res) {
    const payload = {
      username: req.body.username,
      email: req.body.email,
      password: req.body.password,
      address: req.body.address || null,
      contact: req.body.contact || null,
      role: req.body.role || 'user'
    };
    try {
      await new Promise((resolve, reject) => {
        userModel.addUser(payload, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'User added');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to add user');
    }
    return res.redirect('/users');
  },

  async updateUser(req, res) {
    const id = req.params.id;
    let existingUser;
    try {
      existingUser = await getUserByIdAsync(id);
    } catch (err) {
      console.error(err);
    }
    if (!existingUser) {
      req.flash('error', 'User not found');
      return res.redirect('/users');
    }
    const updated = {
      username: req.body.username,
      email: req.body.email,
      address: req.body.address || null,
      contact: req.body.contact || null,
      role: req.body.role || 'user'
    };
    if (req.body.password) {
      updated.password = req.body.password;
    }
    try {
      if (existingUser.role === 'admin' && updated.role !== 'admin') {
        const adminCount = await getAdminCount();
        if (adminCount <= 1) {
          req.flash('error', 'Cannot remove the last remaining admin');
          return res.redirect('/users');
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
    return res.redirect('/users');
  },

  async deleteUser(req, res) {
    const id = req.params.id;
    try {
      const userToDelete = await getUserByIdAsync(id);
      if (!userToDelete) {
        req.flash('error', 'User not found');
        return res.redirect('/users');
      }
      if (userToDelete.role === 'admin') {
        const adminCount = await getAdminCount();
        if (adminCount <= 1) {
          req.flash('error', 'Cannot delete the last remaining admin');
          return res.redirect('/users');
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
    return res.redirect('/users');
  }
};

module.exports = UserController;
