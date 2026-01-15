const db = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SALT_ROUNDS = 12;
const isBcryptHash = (value) => typeof value === 'string' && value.startsWith('$2');
const sha1 = (value) => crypto.createHash('sha1').update(value).digest('hex');

module.exports = {
  getAllUsers: function (callback) {
    const sql = 'SELECT id, username, email, password, contact, role, is_2fa_enabled, twofactor_secret FROM users';
    db.query(sql, function (err, results) {
      return callback(err, results);
    });
  },

  getUserById: function (id, callback) {
    const sql = 'SELECT id, username, email, password, contact, role, is_2fa_enabled, twofactor_secret FROM users WHERE id = ? LIMIT 1';
    db.query(sql, [id], function (err, results) {
      return callback(err, results && results[0] ? results[0] : null);
    });
  },

  getUserByEmail: function (email, callback) {
    const sql = 'SELECT id, username, email, password, contact, role, is_2fa_enabled, twofactor_secret FROM users WHERE email = ? LIMIT 1';
    db.query(sql, [email], function (err, results) {
      return callback(err, results && results[0] ? results[0] : null);
    });
  },

  addUser: function (userData, callback) {
    const sql = 'INSERT INTO users (username, email, password, contact, role) VALUES (?, ?, ?, ?, ?)';
    bcrypt.hash(userData.password, SALT_ROUNDS, (hashErr, hash) => {
      if (hashErr) return callback(hashErr);
      const params = [
        userData.username,
        userData.email,
        hash,
        userData.contact || null,
        userData.role || 'user'
      ];
      db.query(sql, params, (err, result) => callback(err, result));
    });
  },

  updateUser: function (id, updatedData, callback) {
    let sql, params;
    if (updatedData.password) {
      sql = 'UPDATE users SET username = ?, email = ?, password = ?, contact = ?, role = ? WHERE id = ?';
      bcrypt.hash(updatedData.password, SALT_ROUNDS, (hashErr, hash) => {
        if (hashErr) return callback(hashErr);
        params = [
          updatedData.username,
          updatedData.email,
          hash,
          updatedData.contact || null,
          updatedData.role || 'user',
          id
        ];
        db.query(sql, params, (err, result) => callback(err, result));
      });
      return;
    } else {
      sql = 'UPDATE users SET username = ?, email = ?, contact = ?, role = ? WHERE id = ?';
      params = [
        updatedData.username,
        updatedData.email,
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
    const sql = 'SELECT id, username, email, password, contact, role, is_2fa_enabled, twofactor_secret FROM users WHERE email = ? LIMIT 1';
    db.query(sql, [email], function (err, results) {
      if (err) return callback(err);
      const user = results && results[0] ? results[0] : null;
      if (!user || !user.password) return callback(null, null);

      if (isBcryptHash(user.password)) {
        return bcrypt.compare(password, user.password, (compareErr, ok) => {
          if (compareErr) return callback(compareErr);
          return callback(null, ok ? user : null);
        });
      }

      if (sha1(password) !== user.password) {
        return callback(null, null);
      }

      return bcrypt.hash(password, SALT_ROUNDS, (hashErr, hash) => {
        if (hashErr) return callback(hashErr);
        db.query('UPDATE users SET password = ? WHERE id = ?', [hash, user.id], (updateErr) => {
          if (updateErr) {
            console.error('Failed to upgrade password hash for user', user.id);
          } else {
            user.password = hash;
          }
          return callback(null, user);
        });
      });
    });
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
  },

  updateUserProfile: function (id, profileData, callback) {
    const fields = [];
    const params = [];

    if (profileData.username !== undefined) {
      fields.push('username = ?');
      params.push(profileData.username);
    }
    if (profileData.email !== undefined) {
      fields.push('email = ?');
      params.push(profileData.email);
    }
    if (profileData.contact !== undefined) {
      fields.push('contact = ?');
      params.push(profileData.contact || null);
    }
    if (profileData.bio !== undefined) {
      fields.push('bio = ?');
      params.push(profileData.bio || null);
    }
    if (profileData.photo !== undefined) {
      fields.push('photo = ?');
      params.push(profileData.photo || null);
    }

    if (fields.length === 0) {
      return callback(new Error('No fields to update'));
    }

    params.push(id);
    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    db.query(sql, params, (err, result) => callback(err, result));
  }
};

// alias for backward compatibility
module.exports.authenticateUser = module.exports.authenticate;
