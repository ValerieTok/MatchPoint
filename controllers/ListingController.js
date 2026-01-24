const Listing = require('../models/Listing');
const Booking = require('../models/Booking');
const UserProfile = require('../models/UserProfile');
const Favorite = require('../models/Favorite');

const allowedSkillLevels = new Set(['beginner', 'intermediate', 'advanced', 'expert']);
const normalizeSkillLevel = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!allowedSkillLevels.has(normalized)) {
    return null;
  }
  return normalized;
};

const ListingController = {
  // list listings, render inventory for admin/coach else shopping
  async listAllProducts(req, res) {
    const search = (req.query && req.query.search ? String(req.query.search).trim() : '');
    const user = (req.session && req.session.user) || {};
    const isAdmin = user.role === 'admin';
    const isCoach = user.role === 'coach';
    const path = req.path;
    let view = isAdmin || isCoach ? 'listingsManage' : 'userdashboard';
    if (path === '/viewcourses') {
      view = 'viewcourses';
    }

    try {
      const products = await new Promise((resolve, reject) => {
        let fetcher;
        if (view === 'viewcourses') {
          fetcher = (cb) => {
            if (search) {
              return Listing.searchListings(search, { activeOnly: true }, cb);
            }
            return Listing.getActiveProducts(cb);
          };
        } else if (search) {
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
      let upcomingCount = 0;
      let completedCount = 0;
      let sessions = [];
      let profilePhoto = null;
      let favoritesMap = new Map();
      const sortFavoritesFirst = (items) =>
        (items || []).sort((a, b) => {
          const aFav = a && a.isFavorited ? 1 : 0;
          const bFav = b && b.isFavorited ? 1 : 0;
          return bFav - aFav;
        });
      if ((view === 'userdashboard' || view === 'viewcourses') && user.role === 'user') {
        const [stats, sessionRows, profile, favoriteMap] = await Promise.all([
          new Promise((resolve, reject) => {
            Booking.getUserDashboardStats(user.id, (err, data) => (err ? reject(err) : resolve(data)));
          }),
          new Promise((resolve, reject) => {
            Booking.getUserDashboardSessions(user.id, (err, rows) => (err ? reject(err) : resolve(rows)));
          }),
          new Promise((resolve) => {
            UserProfile.getByUserId(user.id, (err, profileRow) => {
              if (err) {
                console.error('Failed to load profile photo:', err);
                return resolve(null);
              }
              return resolve(profileRow);
            });
          }),
          new Promise((resolve) => {
            const listingIds = (products || []).map((row) => row.id || row.listing_id).filter(Boolean);
            Favorite.getFavoritesMap(user.id, listingIds, (err, map) => {
              if (err) {
                console.error('Failed to load favorites:', err);
                return resolve(new Map());
              }
              return resolve(map);
            });
          })
        ]);
        upcomingCount = stats ? stats.upcomingCount : 0;
        completedCount = stats ? stats.completedCount : 0;
        favoritesMap = favoriteMap || new Map();
        const sessionList = (sessionRows || []).map((row) => {
          const bookingStatus = row.booking_status ? String(row.booking_status).toLowerCase() : 'pending';
          const status = row.session_completed
            ? 'COMPLETED'
            : (bookingStatus === 'rejected'
              ? 'REJECTED'
              : (bookingStatus === 'accepted' ? 'UPCOMING' : 'PENDING'));
          return {
            bookingId: row.id,
            bookingStatus: row.booking_status ? String(row.booking_status).toLowerCase() : 'pending',
            coach: row.coach_name || '',
            date: row.session_date || null,
            time: row.session_time || null,
            phone: row.coach_contact || '',
            email: row.coach_email || '',
            sport: row.sport || row.listing_title || '',
            location: row.session_location || row.booking_location || '',
            status,
            createdAt: row.created_at || null
          };
        });
        profilePhoto = profile && profile.photo ? profile.photo : null;
        if (view === 'userdashboard') {
          const searchTerm = req.query && req.query.search ? String(req.query.search).trim().toLowerCase() : '';
          const sort = req.query && req.query.sort ? String(req.query.sort).trim().toLowerCase() : 'recent';
          const page = Math.max(1, parseInt(req.query.page, 10) || 1);
          const perPage = 10;
          let filtered = searchTerm
            ? sessionList.filter((session) => {
              const hay = `${session.coach} ${session.sport}`.toLowerCase();
              return hay.includes(searchTerm);
            })
            : sessionList.slice();
          if (sort === 'upcoming' || sort === 'pending' || sort === 'rejected') {
            const target = sort.toUpperCase();
            filtered = filtered.filter((session) => session.status === target);
          } else if (sort === 'status') {
            const order = new Map([
              ['UPCOMING', 0],
              ['PENDING', 1],
              ['REJECTED', 2],
              ['COMPLETED', 3]
            ]);
            filtered.sort((a, b) => (order.get(a.status) ?? 9) - (order.get(b.status) ?? 9));
          } else {
            filtered.sort((a, b) => {
              const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return bTime - aTime;
            });
          }
          const totalSessions = filtered.length;
          const totalPages = Math.max(1, Math.ceil(totalSessions / perPage));
          const start = (page - 1) * perPage;
          sessions = filtered.slice(start, start + perPage);
          let productsWithFav = (products || []).map((row) => ({
            ...row,
            isFavorited: favoritesMap.has(Number(row.id || row.listing_id))
          }));
          productsWithFav = sortFavoritesFirst(productsWithFav);
          return res.render(view, {
            products: productsWithFav,
            user,
            search,
            upcomingCount,
            completedCount,
            sessions,
            profilePhoto,
            filters: { search: searchTerm, sort },
            pagination: { page, perPage, totalSessions, totalPages }
          });
        }
      } else if (user && user.id) {
        const profile = await new Promise((resolve) => {
          UserProfile.getByUserId(user.id, (err, profileRow) => {
            if (err) {
              console.error('Failed to load profile photo:', err);
              return resolve(null);
            }
            return resolve(profileRow);
          });
        });
        profilePhoto = profile && profile.photo ? profile.photo : null;
      }

      let productsWithFav = (products || []).map((row) => ({
        ...row,
        isFavorited: favoritesMap.has(Number(row.id || row.listing_id))
      }));
      productsWithFav = sortFavoritesFirst(productsWithFav);
      return res.render(view, { products: productsWithFav, user, search, upcomingCount, completedCount, sessions, profilePhoto });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Failed to load listings');
      const upcomingCount = 0;
      const completedCount = 0;
      const sessions = [];

      return res.render(view, { products: [], user, search, upcomingCount, completedCount, sessions, profilePhoto: null });
    }
  },

  async getProductById(req, res) {
    const id = req.params.id || req.query.id;
    if (!id) {
      req.flash('error', 'Listing id required');
      return res.redirect('/viewcourses');
    }
    try {
      const product = await new Promise((resolve, reject) => {
        Listing.getProductById(id, (err, row) => (err ? reject(err) : resolve(row)));
      });
      if (!product) {
        req.flash('error', 'Listing not found');
        return res.redirect('/userdashboard');
      }
      const user = req.session && req.session.user;
      if (user && user.role === 'user' && (!product.is_active || product.coach_status !== 'approved')) {
        req.flash('error', 'Listing not available');
        return res.redirect('/userdashboard');
      }
      let isFavorited = false;
      if (user && user.role === 'user') {
        await new Promise((resolve) => {
          Favorite.isFavorited(user.id, product.id, (err, exists) => {
            if (err) {
              console.error('Failed to load favorite state:', err);
              return resolve();
            }
            isFavorited = Boolean(exists);
            return resolve();
          });
        });
      }
      return res.render('listingDetail', { product, user: req.session && req.session.user, isFavorited });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Listing not found');
      return res.redirect('/userdashboard');
    }
  },

  showAddProductPage(req, res) {
    return res.render('addListing', { user: req.session && req.session.user });
  },

  async addProduct(req, res, file) {
    const skillLevel = normalizeSkillLevel(req.body.skill_level);
    if (!skillLevel) {
      req.flash('error', 'Select a valid skill level');
      return res.redirect('/addListing');
    }
    const listingTitle = req.body.listing_title ? String(req.body.listing_title).trim() : '';
    const description = req.body.description ? String(req.body.description).trim() : '';
    const durationMinutes = req.body.duration_minutes ? Number(req.body.duration_minutes) : null;
    const price = req.body.price !== undefined && req.body.price !== ''
      ? Number(req.body.price)
      : null;
    const isActiveRaw = typeof req.body.is_active !== 'undefined'
      ? String(req.body.is_active).trim()
      : '1';
    const isActive = isActiveRaw === '0' ? 0 : isActiveRaw === '1' ? 1 : null;
    if (!description) {
      req.flash('error', 'Description is required');
      return res.redirect('/addListing');
    }
    if (!durationMinutes) {
      req.flash('error', 'Session duration is required');
      return res.redirect('/addListing');
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      req.flash('error', 'Session duration must be a positive number');
      return res.redirect('/addListing');
    }
    if (price === null || !Number.isFinite(price) || price < 0) {
      req.flash('error', 'Price per session must be a valid amount');
      return res.redirect('/addListing');
    }
    if (isActive === null) {
      req.flash('error', 'Listing status is required');
      return res.redirect('/addListing');
    }
    const sessionUser = req.session && req.session.user;
    const sessionLocation = req.body.session_location ? String(req.body.session_location).trim() : '';
    if (!sessionLocation) {
      req.flash('error', 'Location is required');
      return res.redirect('/addListing');
    }
    const coachId = req.body.coach_id || (sessionUser && sessionUser.id);
    const product = {
      coach_id: coachId,
      listing_title: listingTitle,
      sport: listingTitle,
      description: description || null,
      skill_level: skillLevel,
      session_location: sessionLocation || null,
      duration_minutes: durationMinutes,
      price: price,
      image: (file && file.filename) || req.body.image || null,
      discount_percentage: 0,
      offer_message: null,
      is_active: isActive
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
    const skillLevel = normalizeSkillLevel(req.body.skill_level, current.skill_level || 'beginner');
    if (!skillLevel) {
      req.flash('error', 'Select a valid skill level');
      return res.redirect(`/updateListing/${id}`);
    }
    const listingTitle = req.body.listing_title ? String(req.body.listing_title).trim() : '';
    const description = req.body.description ? String(req.body.description).trim() : '';
    const durationMinutes = req.body.duration_minutes ? Number(req.body.duration_minutes) : null;
    const price = req.body.price !== undefined && req.body.price !== ''
      ? Number(req.body.price)
      : null;
    const isActiveRaw = typeof req.body.is_active !== 'undefined'
      ? String(req.body.is_active).trim()
      : String(current.is_active ?? '1');
    const isActive = isActiveRaw === '0' ? 0 : isActiveRaw === '1' ? 1 : null;
    if (!description) {
      req.flash('error', 'Description is required');
      return res.redirect(`/updateListing/${id}`);
    }
    if (!durationMinutes) {
      req.flash('error', 'Session duration is required');
      return res.redirect(`/updateListing/${id}`);
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      req.flash('error', 'Session duration must be a positive number');
      return res.redirect(`/updateListing/${id}`);
    }
    if (price === null || !Number.isFinite(price) || price < 0) {
      req.flash('error', 'Price per session must be a valid amount');
      return res.redirect(`/updateListing/${id}`);
    }
    if (isActive === null) {
      req.flash('error', 'Listing status is required');
      return res.redirect(`/updateListing/${id}`);
    }
    const updatedSessionLocation = typeof req.body.session_location !== 'undefined'
      ? String(req.body.session_location).trim()
      : null;
    if (updatedSessionLocation !== null && !updatedSessionLocation) {
      req.flash('error', 'Location is required');
      return res.redirect(`/updateListing/${id}`);
    }
    const updatedImage = (file && file.filename)
      ? file.filename
      : (req.body.current_image ? String(req.body.current_image).trim() : current.image);
    const updated = {
      listing_title: listingTitle,
      sport: listingTitle,
      description: description || current.description,
      skill_level: skillLevel,
      session_location: updatedSessionLocation !== null
        ? (updatedSessionLocation || null)
        : current.session_location,
      duration_minutes: durationMinutes,
      price: price,
      image: updatedImage || null,
      discount_percentage: current.discount_percentage,
      offer_message: current.offer_message,
      is_active: isActive
    };
    if (!updated.listing_title) {
      req.flash('error', 'Listing title required');
      return res.redirect(`/updateListing/${id}`);
    }
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
