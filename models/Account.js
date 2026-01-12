const db = require('../db');

module.exports = {
  getAllUsers: function (callback) {
    const sql = 'SELECT id, username, email, password, address, contact, role, is_2fa_enabled, twofactor_secret FROM users';
    db.query(sql, function (err, results) {
      return callback(err, results);
    });
  },

  getUserById: function (id, callback) {
    const sql = 'SELECT id, username, email, password, address, contact, role, is_2fa_enabled, twofactor_secret FROM users WHERE id = ? LIMIT 1';
    db.query(sql, [id], function (err, results) {
      return callback(err, results && results[0] ? results[0] : null);
    });
  },

  getUserByEmail: function (email, callback) {
    const sql = 'SELECT id, username, email, password, address, contact, role, is_2fa_enabled, twofactor_secret FROM users WHERE email = ? LIMIT 1';
    db.query(sql, [email], function (err, results) {
      return callback(err, results && results[0] ? results[0] : null);
    });
  },

  addUser: function (userData, callback) {
    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    const params = [
      userData.username,
      userData.email,
      userData.password, // plain; hashed by SHA1() in SQL
      userData.address || null,
      userData.contact || null,
      userData.role || 'user'
    ];
    db.query(sql, params, (err, result) => callback(err, result));
  },

  updateUser: function (id, updatedData, callback) {
    let sql, params;
    if (updatedData.password) {
      sql = 'UPDATE users SET username = ?, email = ?, password = SHA1(?), address = ?, contact = ?, role = ? WHERE id = ?';
      params = [
        updatedData.username,
        updatedData.email,
        updatedData.password,
        updatedData.address || null,
        updatedData.contact || null,
        updatedData.role || 'user',
        id
      ];
    } else {
      sql = 'UPDATE users SET username = ?, email = ?, address = ?, contact = ?, role = ? WHERE id = ?';
      params = [
        updatedData.username,
        updatedData.email,
        updatedData.address || null,
        updatedData.contact || null,
        updatedData.role || 'user',
        id
      ];
    }
    db.query(sql, params, (err, result) => callback(err, result));
  },

  deleteUser: function (id, callback) {
    const sql = 'DELETE FROM users WHERE id = ?';
    db.query(sql, [id], (err, result) => callback(err, result));
  },

  getAdminCount: function (callback) {
    const sql = 'SELECT COUNT(*) AS count FROM users WHERE role = "admin"';
    db.query(sql, (err, rows) => {
      if (err) return callback(err, 0);
      const count = rows && rows[0] ? rows[0].count : 0;
      return callback(null, count);
    });
  },

  authenticate: function (email, password, callback) {
    const sql = 'SELECT id, username, email, password, address, contact, role, is_2fa_enabled, twofactor_secret FROM users WHERE email = ? AND password = SHA1(?) LIMIT 1';
    db.query(sql, [email, password], function (err, results) {
      return callback(err, results && results[0] ? results[0] : null);
    });
  },

  updateAddressOnly: function (id, address, callback) {
    const sql = 'UPDATE users SET address = ? WHERE id = ?';
    db.query(sql, [address || null, id], (err, result) => callback(err, result));
  },

  saveTwoFactorSecret: function (id, secret, callback) {
    const sql = 'UPDATE users SET twofactor_secret = ?, is_2fa_enabled = 1 WHERE id = ?';
    db.query(sql, [secret || null, id], (err, result) => callback(err, result));
  },

  disableTwoFactor: function (id, callback) {
    const sql = 'UPDATE users SET twofactor_secret = NULL, is_2fa_enabled = 0 WHERE id = ?';
    db.query(sql, [id], function (err, result) {
      return callback(err, result);
    });
  }
};

// alias for backward compatibility
module.exports.authenticateUser = module.exports.authenticate;
