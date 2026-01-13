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
    const search = (req.query && req.query.search ? String(req.query.search).trim() : '');
    const user = (req.session && req.session.user) || {};
    const isAdmin = user.role === 'admin';
    const isCoach = user.role === 'coach';
    const view = isAdmin || isCoach ? 'listingsManage' : 'listingsBrowse';

    try {
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
      return res.render(view, { products, user, search });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to load listings');
      return res.render(view, { products: [], user, search });
    }
  },

  async getProductById(req, res) {
    const id = req.params.id || req.query.id;
    if (!id) {
      req.flash('error', 'Listing id required');
      return res.redirect('/listingsBrowse');
    }
    try {
      const product = await new Promise((resolve, reject) => {
        Listing.getProductById(id, (err, row) => (err ? reject(err) : resolve(row)));
      });
      if (!product) {
        req.flash('error', 'Listing not found');
        return res.redirect('/listingsBrowse');
      }
      const user = req.session && req.session.user;
      if (user && user.role === 'user' && !product.is_active) {
        req.flash('error', 'Listing not available');
        return res.redirect('/listingsBrowse');
      }
      return res.render('listingDetail', { product, user: req.session && req.session.user });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Listing not found');
      return res.redirect('/listingsBrowse');
    }
  },

  showAddProductPage(req, res) {
    return res.render('addListing', { user: req.session && req.session.user });
  },

  async addProduct(req, res, file) {
    const discountPercentage = parseDiscountPercentage(req.body.discount_percentage);
    if (discountPercentage === null) {
      req.flash('error', 'Discount must be an integer between 0 and 100');
      return res.redirect('/addListing');
    }
    const sessionUser = req.session && req.session.user;
    const coachId = req.body.coach_id || (sessionUser && sessionUser.id);
    const product = {
      coach_id: coachId,
      listing_title: req.body.listing_title,
      available_slots: Number(req.body.available_slots) || 0,
      price: Number(req.body.price) || 0,
      image: (file && file.filename) || req.body.image || null,
      discount_percentage: discountPercentage,
      offer_message: req.body.offer_message || null,
      sport: req.body.sport || null,
      description: req.body.description || null,
      duration_minutes: Number(req.body.duration_minutes) || null,
      is_active: typeof req.body.is_active !== 'undefined' ? Number(req.body.is_active) : 1
    };
    if (!product.listing_title) {
      req.flash('error', 'Listing title required');
      return res.redirect('/addListing');
    }
    if (!product.coach_id) {
      req.flash('error', 'Coach id required for listing');
      return res.redirect('/addListing');
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
    return res.redirect('/listingsManage');
  },

  async showUpdateProductPage(req, res) {
    const id = req.params.id;
    try {
      const product = await new Promise((resolve, reject) => {
        Listing.getProductById(id, (err, row) => (err ? reject(err) : resolve(row)));
      });
      if (!product) {
        req.flash('error', 'Listing not found');
        return res.redirect('/listingsManage');
      }
      const user = req.session && req.session.user;
      if (user && user.role === 'coach' && String(product.coach_id) !== String(user.id)) {
        req.flash('error', 'Access denied');
        return res.redirect('/listingsManage');
      }
      return res.render('updateListing', { product, user: req.session && req.session.user });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Listing not found');
      return res.redirect('/listingsManage');
    }
  },

  async updateProduct(req, res, file) {
    const id = req.params.id;
    const discountPercentage = parseDiscountPercentage(req.body.discount_percentage);
    if (discountPercentage === null) {
      req.flash('error', 'Discount must be an integer between 0 and 100');
      return res.redirect(`/updateListing/${id}`);
    }
    const current = await new Promise((resolve) => {
      Listing.getProductById(id, (err, row) => resolve(row || null));
    });
    const user = req.session && req.session.user;
    if (!current) {
      req.flash('error', 'Listing not found');
      return res.redirect('/listingsManage');
    }
    if (user && user.role === 'coach' && String(current.coach_id) !== String(user.id)) {
      req.flash('error', 'Access denied');
      return res.redirect('/listingsManage');
    }
    const updated = {
      listing_title: req.body.listing_title,
      available_slots: typeof req.body.available_slots !== 'undefined' ? Number(req.body.available_slots) : undefined,
      price: typeof req.body.price !== 'undefined' ? Number(req.body.price) : undefined,
      image: (file && file.filename) || req.body.current_image || req.body.image,
      discount_percentage: discountPercentage,
      offer_message: typeof req.body.offer_message !== 'undefined' ? req.body.offer_message : null,
      sport: typeof req.body.sport !== 'undefined' ? req.body.sport : undefined,
      description: typeof req.body.description !== 'undefined' ? req.body.description : undefined,
      duration_minutes: typeof req.body.duration_minutes !== 'undefined' ? Number(req.body.duration_minutes) : undefined,
      is_active: typeof req.body.is_active !== 'undefined' ? Number(req.body.is_active) : undefined
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
    return res.redirect('/listingsManage');
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
        return res.redirect('/listingsManage');
      }
      if (user && user.role === 'coach' && String(current.coach_id) !== String(user.id)) {
        req.flash('error', 'Access denied');
        return res.redirect('/listingsManage');
      }
      await new Promise((resolve, reject) => {
        Listing.deleteProduct(id, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'Listing deleted');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to delete listing');
    }
    return res.redirect('/listingsManage');
  }
};

module.exports = ListingController;
