const Listing = require('../models/Listing');

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

const ListingController = {
  // list listings, render inventory for admin/coach else shopping
  async listAllProducts(req, res) {
    try {
      const search = (req.query && req.query.search ? String(req.query.search).trim() : '');
      const user = (req.session && req.session.user) || {};
      const isAdmin = user.role === 'admin';
      const isCoach = user.role === 'coach';
      const products = await new Promise((resolve, reject) => {
        let fetcher;
        if (search) {
          const options = {
            activeOnly: !isAdmin && !isCoach,
            coachId: isCoach ? user.id : undefined
          };
        fetcher = (cb) => Listing.searchListings(search, options, cb);
      } else if (isAdmin) {
        fetcher = (cb) => Listing.getAllProducts(cb);
      } else if (isCoach) {
        fetcher = (cb) => Listing.getProductsByCoach(user.id, cb);
      } else {
        fetcher = (cb) => Listing.getActiveProducts(cb);
      }
        fetcher((err, rows) => (err ? reject(err) : resolve(rows || [])));
      });
      const view = isAdmin || isCoach ? 'listingsManage' : 'listingsBrowse';
      return res.render(view, { products, user, search }, (err, html) => {
        if (err) {
          console.error(err);
          req.flash('error', 'Failed to load listings');
          return res.redirect('/');
        }
        res.type('html').send(html);
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to load listings');
      return res.redirect('/');
    }
  },

  async getProductById(req, res) {
    const id = req.params.id || req.query.id;
    if (!id) {
      req.flash('error', 'Listing id required');
      return res.redirect('/shopping');
    }
    try {
      const product = await new Promise((resolve, reject) => {
        Listing.getProductById(id, (err, row) => (err ? reject(err) : resolve(row)));
      });
      if (!product) {
        req.flash('error', 'Listing not found');
        return res.redirect('/shopping');
      }
      const user = req.session && req.session.user;
      if (user && user.role === 'user' && !product.isActive) {
        req.flash('error', 'Listing not available');
        return res.redirect('/shopping');
      }
      return res.render('listingDetail', { product, user: req.session && req.session.user });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Listing not found');
      return res.redirect('/shopping');
    }
  },

  showAddProductPage(req, res) {
    return res.render('addListing', { user: req.session && req.session.user });
  },

  async addProduct(req, res, file) {
    const discountPercentage = parseDiscountPercentage(req.body.discountPercentage);
    if (discountPercentage === null) {
      req.flash('error', 'Discount must be an integer between 0 and 100');
      return res.redirect('/addProduct');
    }
    const sessionUser = req.session && req.session.user;
    const coachId = req.body.coachId || (sessionUser && sessionUser.id);
    const product = {
      coachId,
      productName: req.body.name || req.body.productName,
      quantity: Number(req.body.quantity) || 0,
      price: Number(req.body.price) || 0,
      image: (file && file.filename) || req.body.image || null,
      discountPercentage,
      offerMessage: req.body.offerMessage || null,
      sport: req.body.sport || null,
      description: req.body.description || null,
      durationMinutes: Number(req.body.durationMinutes) || null,
      isActive: typeof req.body.isActive !== 'undefined' ? Number(req.body.isActive) : 1
    };
    if (!product.productName) {
      req.flash('error', 'Listing title required');
      return res.redirect('/addProduct');
    }
    if (!product.coachId) {
      req.flash('error', 'Coach id required for listing');
      return res.redirect('/addProduct');
    }
    try {
      await new Promise((resolve, reject) => {
        Listing.addProduct(product, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Listing added');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to add listing');
    }
    return res.redirect('/inventory');
  },

  async showUpdateProductPage(req, res) {
    const id = req.params.id;
    try {
      const product = await new Promise((resolve, reject) => {
        Listing.getProductById(id, (err, row) => (err ? reject(err) : resolve(row)));
      });
      if (!product) {
        req.flash('error', 'Listing not found');
        return res.redirect('/inventory');
      }
      const user = req.session && req.session.user;
      if (user && user.role === 'coach' && String(product.coachId) !== String(user.id)) {
        req.flash('error', 'Access denied');
        return res.redirect('/inventory');
      }
      return res.render('updateListing', { product, user: req.session && req.session.user });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Listing not found');
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
    const current = await new Promise((resolve) => {
      Listing.getProductById(id, (err, row) => resolve(row || null));
    });
    const user = req.session && req.session.user;
    if (!current) {
      req.flash('error', 'Listing not found');
      return res.redirect('/inventory');
    }
    if (user && user.role === 'coach' && String(current.coachId) !== String(user.id)) {
      req.flash('error', 'Access denied');
      return res.redirect('/inventory');
    }
    const updated = {
      productName: req.body.name || req.body.productName,
      quantity: typeof req.body.quantity !== 'undefined' ? Number(req.body.quantity) : undefined,
      price: typeof req.body.price !== 'undefined' ? Number(req.body.price) : undefined,
      image: (file && file.filename) || req.body.currentImage || req.body.image,
      discountPercentage,
      offerMessage: typeof req.body.offerMessage !== 'undefined' ? req.body.offerMessage : null,
      sport: typeof req.body.sport !== 'undefined' ? req.body.sport : undefined,
      description: typeof req.body.description !== 'undefined' ? req.body.description : undefined,
      durationMinutes: typeof req.body.durationMinutes !== 'undefined' ? Number(req.body.durationMinutes) : undefined,
      isActive: typeof req.body.isActive !== 'undefined' ? Number(req.body.isActive) : undefined
    };
    try {
      await new Promise((resolve, reject) => {
        Listing.updateProduct(id, updated, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Listing updated');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to update listing');
    }
    return res.redirect('/inventory');
  },

  async deleteProduct(req, res) {
    const id = req.params.id;
    try {
      const current = await new Promise((resolve) => {
      Listing.getProductById(id, (err, row) => resolve(row || null));
    });
      const user = req.session && req.session.user;
      if (!current) {
        req.flash('error', 'Listing not found');
        return res.redirect('/inventory');
      }
      if (user && user.role === 'coach' && String(current.coachId) !== String(user.id)) {
        req.flash('error', 'Access denied');
        return res.redirect('/inventory');
      }
      await new Promise((resolve, reject) => {
        Listing.deleteProduct(id, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Listing deleted');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to delete listing');
    }
    return res.redirect('/inventory');
  }
};

module.exports = ListingController;
