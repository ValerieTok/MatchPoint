const db = require('../db');

module.exports = {
  getAllUsers: function (callback) {
    const withFreeDelivery = 'SELECT id, username, email, password, address, contact, role, free_delivery FROM users';
    const withoutFreeDelivery = 'SELECT id, username, email, password, address, contact, role, 0 AS free_delivery FROM users';
    db.query(withFreeDelivery, (err, results) => {
      if (err && err.code === 'ER_BAD_FIELD_ERROR') {
        return db.query(withoutFreeDelivery, (fallbackErr, rows) => callback(fallbackErr, rows));
      }
      return callback(err, results);
    });
  },

  getUserById: function (id, callback) {
    const withFreeDelivery = 'SELECT id, username, email, password, address, contact, role, free_delivery FROM users WHERE id = ? LIMIT 1';
    const withoutFreeDelivery = 'SELECT id, username, email, password, address, contact, role, 0 AS free_delivery FROM users WHERE id = ? LIMIT 1';
    db.query(withFreeDelivery, [id], (err, results) => {
      if (err && err.code === 'ER_BAD_FIELD_ERROR') {
        return db.query(withoutFreeDelivery, [id], (fallbackErr, rows) => callback(fallbackErr, rows && rows[0] ? rows[0] : null));
      }
      return callback(err, results && results[0] ? results[0] : null);
    });
  },

  getUserByEmail: function (email, callback) {
    const withFreeDelivery = 'SELECT id, username, email, password, address, contact, role, free_delivery FROM users WHERE email = ? LIMIT 1';
    const withoutFreeDelivery = 'SELECT id, username, email, password, address, contact, role, 0 AS free_delivery FROM users WHERE email = ? LIMIT 1';
    db.query(withFreeDelivery, [email], (err, results) => {
      if (err && err.code === 'ER_BAD_FIELD_ERROR') {
        return db.query(withoutFreeDelivery, [email], (fallbackErr, rows) => callback(fallbackErr, rows && rows[0] ? rows[0] : null));
      }
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
    const withFreeDelivery = 'SELECT id, username, email, password, address, contact, role, free_delivery FROM users WHERE email = ? AND password = SHA1(?) LIMIT 1';
    const withoutFreeDelivery = 'SELECT id, username, email, password, address, contact, role, 0 AS free_delivery FROM users WHERE email = ? AND password = SHA1(?) LIMIT 1';
    db.query(withFreeDelivery, [email, password], (err, results) => {
      if (err && err.code === 'ER_BAD_FIELD_ERROR') {
        return db.query(withoutFreeDelivery, [email, password], (fallbackErr, rows) => callback(fallbackErr, rows && rows[0] ? rows[0] : null));
      }
      return callback(err, results && results[0] ? results[0] : null);
    });
  },

  updateAddressOnly: function (id, address, callback) {
    const sql = 'UPDATE users SET address = ? WHERE id = ?';
    db.query(sql, [address || null, id], (err, result) => callback(err, result));
  }
};

// alias for backward compatibility
module.exports.authenticateUser = module.exports.authenticate;
