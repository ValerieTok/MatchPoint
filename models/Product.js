const db = require('../db');

module.exports = {
  getAllProducts: function (callback) {
    const sql = 'SELECT id, productName, quantity, price, image, discountPercentage, offerMessage FROM products';
    db.query(sql, (err, results) => callback(err, results));
  },

  getProductById: function (id, callback) {
    const sql = 'SELECT id, productName, quantity, price, image, discountPercentage, offerMessage FROM products WHERE id = ? LIMIT 1';
    db.query(sql, [id], (err, results) => callback(err, results && results[0] ? results[0] : null));
  },

  addProduct: function (productData, callback) {
    const sql = 'INSERT INTO products (productName, quantity, price, image, discountPercentage, offerMessage) VALUES (?, ?, ?, ?, ?, ?)';
    const params = [
      productData.productName,
      productData.quantity || 0,
      productData.price || 0,
      productData.image || null,
      typeof productData.discountPercentage === 'number' ? productData.discountPercentage : 0,
      productData.offerMessage || null
    ];
    db.query(sql, params, (err, result) => callback(err, result));
  },

  updateProduct: function (id, updatedData, callback) {
    const sql = 'UPDATE products SET productName = ?, quantity = ?, price = ?, image = ?, discountPercentage = ?, offerMessage = ? WHERE id = ?';
    const params = [
      updatedData.productName,
      typeof updatedData.quantity !== 'undefined' ? updatedData.quantity : null,
      typeof updatedData.price !== 'undefined' ? updatedData.price : null,
      typeof updatedData.image !== 'undefined' ? updatedData.image : null,
      typeof updatedData.discountPercentage !== 'undefined' ? updatedData.discountPercentage : 0,
      typeof updatedData.offerMessage !== 'undefined' ? updatedData.offerMessage : null,
      id
    ];
    db.query(sql, params, (err, result) => callback(err, result));
  },

  deleteProduct: function (id, callback) {
    const sql = 'DELETE FROM products WHERE id = ?';
    db.query(sql, [id], (err, result) => callback(err, result));
  },

  searchProducts: function (term, callback) {
    const like = `%${term}%`;
    const sql = `
      SELECT id, productName, quantity, price, image
      FROM products
      WHERE productName LIKE ?
    `;
    db.query(sql, [like], (err, results) => callback(err, results));
  },

  // deduct stock for each cart item within a transaction
  deductStock: function (cartItems, callback) {
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return callback(null);
    }

    db.beginTransaction(async (txErr) => {
      if (txErr) return callback(txErr);

      try {
        // process items sequentially so locks are respected
        for (const item of cartItems) {
          await new Promise((resolve, reject) => {
            db.query(
              'SELECT productName, quantity FROM products WHERE id = ? FOR UPDATE',
              [item.productId],
              (selectErr, rows) => {
                if (selectErr) return reject(selectErr);
                const row = rows && rows[0];
                if (!row) {
                  return reject(Object.assign(new Error('Product not found'), {
                    code: 'PRODUCT_NOT_FOUND',
                    productId: item.productId
                  }));
                }
                if (row.quantity < item.quantity) {
                  return reject(Object.assign(new Error('Insufficient stock'), {
                    code: 'INSUFFICIENT_STOCK',
                    productId: item.productId,
                    productName: row.productName,
                    available: row.quantity,
                    requested: item.quantity
                  }));
                }
                const newQty = row.quantity - item.quantity;
                db.query(
                  'UPDATE products SET quantity = ? WHERE id = ?',
                  [newQty, item.productId],
                  (updateErr) => (updateErr ? reject(updateErr) : resolve())
                );
              }
            );
          });
        }

        db.commit((commitErr) => {
          if (commitErr) {
            return db.rollback(() => callback(commitErr));
          }
          return callback(null);
        });
      } catch (err) {
        db.rollback(() => callback(err));
      }
    });
  }
};
