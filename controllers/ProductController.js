const Product = require('../models/Product');

const parseDiscountPercentage = (rawValue) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return 0;
  }
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 0 || numeric > 100) {
    return null;
  }
  return numeric;
};

const ProductController = {
  // list products, render inventory for admin else shopping
  async listAllProducts(req, res) {
    try {
      const search = (req.query && req.query.search ? String(req.query.search).trim() : '');
      const products = await new Promise((resolve, reject) => {
        const fetcher = search
          ? (cb) => Product.searchProducts(search, cb)
          : (cb) => Product.getAllProducts(cb);
        fetcher((err, rows) => (err ? reject(err) : resolve(rows || [])));
      });
      const user = (req.session && req.session.user) || {};
      const view = user.role === 'admin' ? 'inventory' : 'shopping';
      return res.render(view, { products, user, search }, (err, html) => {
        if (err) {
          console.error(err);
          req.flash('error', 'Failed to load products');
          return res.redirect('/');
        }
        res.type('html').send(html);
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to load products');
      return res.redirect('/');
    }
  },

  async getProductById(req, res) {
    const id = req.params.id || req.query.id;
    if (!id) {
      req.flash('error', 'Product id required');
      return res.redirect('/shopping');
    }
    try {
      const product = await new Promise((resolve, reject) => {
        Product.getProductById(id, (err, row) => (err ? reject(err) : resolve(row)));
      });
      if (!product) {
        req.flash('error', 'Product not found');
        return res.redirect('/shopping');
      }
      return res.render('product', { product, user: req.session && req.session.user });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Product not found');
      return res.redirect('/shopping');
    }
  },

  showAddProductPage(req, res) {
    return res.render('addProduct', { user: req.session && req.session.user });
  },

  async addProduct(req, res, file) {
    const discountPercentage = parseDiscountPercentage(req.body.discountPercentage);
    if (discountPercentage === null) {
      req.flash('error', 'Discount must be an integer between 0 and 100');
      return res.redirect('/addProduct');
    }
    const product = {
      productName: req.body.name || req.body.productName,
      quantity: Number(req.body.quantity) || 0,
      price: Number(req.body.price) || 0,
      image: (file && file.filename) || req.body.image || null,
      discountPercentage,
      offerMessage: req.body.offerMessage || null
    };
    if (!product.productName) {
      req.flash('error', 'Product name required');
      return res.redirect('/addProduct');
    }
    try {
      await new Promise((resolve, reject) => {
        Product.addProduct(product, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Product added');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to add product');
    }
    return res.redirect('/inventory');
  },

  async showUpdateProductPage(req, res) {
    const id = req.params.id;
    try {
      const product = await new Promise((resolve, reject) => {
        Product.getProductById(id, (err, row) => (err ? reject(err) : resolve(row)));
      });
      if (!product) {
        req.flash('error', 'Product not found');
        return res.redirect('/inventory');
      }
      return res.render('updateProduct', { product, user: req.session && req.session.user });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Product not found');
      return res.redirect('/inventory');
    }
  },

  async updateProduct(req, res, file) {
    const id = req.params.id;
    const discountPercentage = parseDiscountPercentage(req.body.discountPercentage);
    if (discountPercentage === null) {
      req.flash('error', 'Discount must be an integer between 0 and 100');
      return res.redirect(`/updateProduct/${id}`);
    }
    const updated = {
      productName: req.body.name || req.body.productName,
      quantity: typeof req.body.quantity !== 'undefined' ? Number(req.body.quantity) : undefined,
      price: typeof req.body.price !== 'undefined' ? Number(req.body.price) : undefined,
      image: (file && file.filename) || req.body.currentImage || req.body.image,
      discountPercentage,
      offerMessage: typeof req.body.offerMessage !== 'undefined' ? req.body.offerMessage : null
    };
    try {
      await new Promise((resolve, reject) => {
        Product.updateProduct(id, updated, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Product updated');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to update product');
    }
    return res.redirect('/inventory');
  },

  async deleteProduct(req, res) {
    const id = req.params.id;
    try {
      await new Promise((resolve, reject) => {
        Product.deleteProduct(id, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Product deleted');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to delete product');
    }
    return res.redirect('/inventory');
  }
};

module.exports = ProductController;
