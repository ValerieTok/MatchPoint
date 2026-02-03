const Favorite = require('../models/Favorite');
const Listing = require('../models/Listing');
const UserProfile = require('../models/UserProfile');

const FavoriteController = {

  async list(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'user') {
      req.flash('error', 'Access denied');
      return res.redirect('/userdashboard');
    }
    try {
      const [favorites, profile] = await Promise.all([
        new Promise((resolve, reject) => {
          Listing.getFavoritesByUser(user.id, (err, rows) => (err ? reject(err) : resolve(rows || [])));
        }),
        new Promise((resolve) => {
          UserProfile.getByUserId(user.id, (err, profileRow) => {
            if (err) {
              console.error('Failed to load profile photo:', err);
              return resolve(null);
            }
            return resolve(profileRow);
          });
        })
      ]);
      const profilePhoto = profile && profile.photo ? profile.photo : null;
      const products = (favorites || []).map((row) => ({
        ...row,
        isFavorited: true
      }));
      return res.render('favorites', { products, user, profilePhoto });
    } catch (err) {
      console.error('Failed to load favorites:', err);
      req.flash('error', 'Failed to load favourites');
      return res.render('favorites', { products: [], user, profilePhoto: null });
    }
  },
  toggle(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'user') {
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      req.flash('error', 'Please log in');
      return res.redirect('/login');
    }
    const productId = parseInt(req.params.id, 10);
    if (!Number.isFinite(productId)) {
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(400).json({ error: 'Invalid listing' });
      }
      req.flash('error', 'Invalid listing');
      return res.redirect('back');
    }
    const returnToRaw = req.body && req.body.returnTo ? String(req.body.returnTo) : '';
    const safeReturnTo = returnToRaw.startsWith('/') ? returnToRaw : '';
    const fallbackReturnTo = req.get('Referrer') || '/viewcourses';

    return Favorite.toggle(user.id, productId, (err, info) => {
      if (err) {
        console.error('Failed to update favorite:', err);
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
          return res.status(500).json({ error: 'Failed to update favourite' });
        }
        req.flash('error', 'Failed to update favourite');
        return res.redirect(safeReturnTo || fallbackReturnTo);
      }
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.json({ success: true, action: info.action });
      }
      if (info && info.action === 'added') {
        return res.redirect('/favorites');
      }
      return res.redirect(safeReturnTo || fallbackReturnTo);
    });
  }
};

module.exports = FavoriteController;
