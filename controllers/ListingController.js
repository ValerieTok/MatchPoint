const Listing = require('../models/Listing');
const Booking = require('../models/Booking');
const UserProfile = require('../models/UserProfile');
const Favorite = require('../models/Favorite');
const Refunds = require('../models/Refunds');
const Slot = require('../models/Slot');

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
      let products = await new Promise((resolve, reject) => {
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
      if (view === 'viewcourses') {
        products = (products || []).filter((row) => Number(row.is_active) === 1);
      }
      const sortFavoritesFirst = (items) =>
        (items || []).sort((a, b) => {
          const aFav = a && a.isFavorited ? 1 : 0;
          const bFav = b && b.isFavorited ? 1 : 0;
          return bFav - aFav;
        });
      if ((view === 'userdashboard' || view === 'viewcourses') && user.role === 'user') {
        const [stats, sessionRows, profile, favoriteMap, refundRows] = await Promise.all([
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
          }),
          new Promise((resolve) => {
            Refunds.getUserRefunds(user.id, (err, rows) => {
              if (err) {
                console.error('Failed to load refunds for dashboard:', err);
                return resolve([]);
              }
              return resolve(rows || []);
            });
          })
        ]);
        upcomingCount = stats ? stats.upcomingCount : 0;
        completedCount = stats ? stats.completedCount : 0;
        favoritesMap = favoriteMap || new Map();
        const refundMap = new Map((refundRows || []).map((r) => [Number(r.booking_item_id), r]));
        const sessionList = (sessionRows || []).map((row) => {
          const bookingStatus = row.booking_status ? String(row.booking_status).toLowerCase() : 'pending';
          const status = row.session_completed
            ? 'COMPLETED'
            : (bookingStatus === 'rejected'
              ? 'REJECTED'
              : (bookingStatus === 'accepted' ? 'UPCOMING' : 'PENDING'));
          const refund = refundMap.get(Number(row.booking_item_id)) || null;
          return {
            bookingId: row.id,
            bookingItemId: row.booking_item_id,
            bookingStatus: row.booking_status ? String(row.booking_status).toLowerCase() : 'pending',
            coach: row.coach_name || '',
            date: row.session_date || null,
            time: row.session_time || null,
            phone: row.coach_contact || '',
            email: row.coach_email || '',
            sport: row.sport || row.listing_title || '',
            location: row.session_location || row.booking_location || '',
            status,
            sessionCompleted: Boolean(row.session_completed),
            userCompletedAt: row.user_completed_at || null,
            coachCompletedAt: row.coach_completed_at || null,
            completedAt: row.completed_at || null,
            createdAt: row.created_at || null,
            refundStatus: refund ? String(refund.status || '').toLowerCase() : ''
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

      const formatDate = (value) => {
        if (!value) return null;
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
          return value.toISOString().slice(0, 10);
        }
        const text = String(value);
        const dateMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
        return dateMatch ? dateMatch[1] : text;
      };
      const formatTime = (value) => {
        if (!value) return null;
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
          return value.toISOString().slice(11, 16);
        }
        const text = String(value);
        const timeMatch = text.match(/^(\d{2}:\d{2})/);
        return timeMatch ? timeMatch[1] : text;
      };
      let slotSummaryByListing = new Map();
      if (view === 'listingsManage') {
        try {
          const slotRows = await Slot.getSlotsByCoach(isCoach ? user.id : undefined);
          slotRows.forEach((slot) => {
            const listingId = Number(slot.listing_id);
            if (!Number.isFinite(listingId)) return;
            const current = slotSummaryByListing.get(listingId) || { available: 0, total: 0, next: null };
            current.total += 1;
            if (Number(slot.is_available) === 1) {
              current.available += 1;
              const formattedDate = formatDate(slot.slot_date);
              const formattedTime = formatTime(slot.slot_time);
              const slotDateTime = formattedDate && formattedTime
                ? new Date(`${formattedDate}T${formattedTime}`)
                : null;
              if (slotDateTime && (!current.next || slotDateTime < current.next.date)) {
                current.next = {
                  date: slotDateTime,
                  slot_date: formattedDate || slot.slot_date,
                  slot_time: formattedTime || slot.slot_time
                };
              }
            }
            slotSummaryByListing.set(listingId, current);
          });
        } catch (slotErr) {
          console.error('Failed to load slots for listings manage:', slotErr);
        }
      }

      let productsWithFav = (products || []).map((row) => ({
        ...row,
        isFavorited: favoritesMap.has(Number(row.id || row.listing_id)),
        slot_summary: slotSummaryByListing.get(Number(row.id || row.listing_id)) || null
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
      let availableSlots = [];
      if (product && product.id) {
        try {
          availableSlots = await Slot.getAvailableSlotsByListingAll(product.id);
        } catch (slotErr) {
          console.error('Failed to load slots:', slotErr);
        }
      }
      return res.render('listingDetail', {
        product,
        user: req.session && req.session.user,
        isFavorited,
        availableSlots
      });
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
    let durationMinutes = req.body.duration_minutes ? Number(req.body.duration_minutes) : null;
    if (!Number.isFinite(durationMinutes)) {
      durationMinutes = null;
    }
    if (durationMinutes === null) {
      durationMinutes = 60;
    }
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
    const toMinutes = (timeValue) => {
      if (!timeValue) return null;
      const match = String(timeValue).match(/^(\d{1,2}):(\d{2})/);
      if (!match) return null;
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
      return hours * 60 + minutes;
    };
    const overlaps = (startA, endA, startB, endB) => startA < endB && endA > startB;

    try {
      const result = await new Promise((resolve, reject) => {
        Listing.addProduct(product, (err, dbResult) => (err ? reject(err) : resolve(dbResult)));
      });
      const listingId = result && result.insertId ? Number(result.insertId) : null;
      const slotDates = req.body && req.body.slot_date ? req.body.slot_date : [];
      const slotTimes = req.body && req.body.slot_time ? req.body.slot_time : [];
      const normalizedDates = Array.isArray(slotDates) ? slotDates : [slotDates];
      const normalizedTimes = Array.isArray(slotTimes) ? slotTimes : [slotTimes];

      if (listingId && normalizedDates.length && normalizedTimes.length) {
        const total = Math.max(normalizedDates.length, normalizedTimes.length);
        const groupedNewSlots = new Map();
        for (let i = 0; i < total; i += 1) {
          const slotDate = normalizedDates[i] ? String(normalizedDates[i]).trim() : '';
          const slotTime = normalizedTimes[i] ? String(normalizedTimes[i]).trim() : '';
          if (!slotDate || !slotTime) continue;
          const list = groupedNewSlots.get(slotDate) || [];
          list.push({ slotDate, slotTime });
          groupedNewSlots.set(slotDate, list);
        }

        const existingByDate = new Map();
        for (const [slotDate] of groupedNewSlots.entries()) {
          try {
            const rows = await Slot.getSlotsByCoachAndDate(product.coach_id, slotDate);
            existingByDate.set(slotDate, rows || []);
          } catch (slotErr) {
            console.error('Failed to load existing slots for overlap check:', slotErr);
            existingByDate.set(slotDate, []);
          }
        }

        let hadOverlap = false;
        const pendingCreated = [];
        for (let i = 0; i < total; i += 1) {
          const slotDate = normalizedDates[i] ? String(normalizedDates[i]).trim() : '';
          const slotTime = normalizedTimes[i] ? String(normalizedTimes[i]).trim() : '';
          if (!slotDate || !slotTime) {
            continue;
          }
          const startMinutes = toMinutes(slotTime);
          if (startMinutes === null) {
            continue;
          }
          const endMinutes = startMinutes + durationMinutes;
          const existing = existingByDate.get(slotDate) || [];
          const existingOverlap = existing.some((row) => {
            const existingStart = toMinutes(row.slot_time);
            if (existingStart === null) return false;
            const existingEnd = existingStart + Number(row.duration_minutes || durationMinutes || 0);
            return overlaps(startMinutes, endMinutes, existingStart, existingEnd);
          });
          const newOverlap = pendingCreated.some((row) => {
            if (row.slot_date !== slotDate) return false;
            return overlaps(startMinutes, endMinutes, row.startMinutes, row.endMinutes);
          });
          if (existingOverlap || newOverlap) {
            hadOverlap = true;
            continue;
          }
          try {
            await Slot.createSlot({
              coach_id: product.coach_id,
              listing_id: listingId,
              slot_date: slotDate,
              slot_time: slotTime,
              duration_minutes: durationMinutes,
              location: product.session_location || null,
              note: null
            });
            pendingCreated.push({ slot_date: slotDate, startMinutes, endMinutes });
          } catch (slotErr) {
            console.error('Failed to create slot during listing add:', slotErr);
          }
        }
        if (hadOverlap) {
          req.flash('error', 'Some slots were skipped because they overlap with existing slots.');
        }
      }

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
      let slots = [];
      try {
        slots = await Slot.getSlotsByListing(product.id);
      } catch (slotErr) {
        console.error('Failed to load listing slots:', slotErr);
      }
      return res.render('updateListing', {
        product,
        slots,
        user: req.session && req.session.user,
        messages: req.flash()
      });
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
    let durationMinutes = req.body.duration_minutes ? Number(req.body.duration_minutes) : null;
    if (!Number.isFinite(durationMinutes)) {
      durationMinutes = null;
    }
    if (durationMinutes === null) {
      durationMinutes = current.duration_minutes;
    }
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
  ,
  async createListingSlot(req, res) {
    const listingId = parseInt(req.params.id, 10);
    const user = req.session && req.session.user;
    const body = req.body || {};
    const slotDate = body.slot_date ? String(body.slot_date).trim() : '';
    const slotTime = body.slot_time ? String(body.slot_time).trim() : '';
    if (!Number.isFinite(listingId) || !slotDate || !slotTime) {
      req.flash('error', 'Please choose date and time.');
      return res.redirect(`/updateListing/${listingId}`);
    }
    const toMinutes = (timeValue) => {
      if (!timeValue) return null;
      const match = String(timeValue).match(/^(\d{1,2}):(\d{2})/);
      if (!match) return null;
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
      return hours * 60 + minutes;
    };
    const overlaps = (startA, endA, startB, endB) => startA < endB && endA > startB;

    try {
      const product = await new Promise((resolve, reject) => {
        Listing.getProductById(listingId, (err, row) => (err ? reject(err) : resolve(row)));
      });
      if (!product || (user && user.role === 'coach' && String(product.coach_id) !== String(user.id))) {
        req.flash('error', 'Access denied');
        return res.redirect('/listingsManage');
      }
      const duration = parseInt(product.duration_minutes, 10);
      if (!Number.isFinite(duration) || duration <= 0) {
        req.flash('error', 'Listing duration must be set before adding slots.');
        return res.redirect(`/updateListing/${listingId}`);
      }
      const timeMatch = slotTime.match(/^(\d{2}):(\d{2})/);
      if (!timeMatch) {
        req.flash('error', 'Invalid slot time.');
        return res.redirect(`/updateListing/${listingId}`);
      }
      const totalMinutes = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
      if (Number.isNaN(totalMinutes) || totalMinutes % duration !== 0) {
        req.flash('error', `Slots must align to ${duration}-minute intervals.`);
        return res.redirect(`/updateListing/${listingId}`);
      }
      const newStart = toMinutes(slotTime);
      const newEnd = newStart !== null ? newStart + duration : null;
      if (newStart === null || newEnd === null) {
        req.flash('error', 'Invalid slot time.');
        return res.redirect(`/updateListing/${listingId}`);
      }
      const existingSlots = await Slot.getSlotsByCoachAndDate(product.coach_id, slotDate);
      const hasOverlap = (existingSlots || []).some((row) => {
        const existingStart = toMinutes(row.slot_time);
        if (existingStart === null) return false;
        const existingEnd = existingStart + Number(row.duration_minutes || duration);
        return overlaps(newStart, newEnd, existingStart, existingEnd);
      });
      if (hasOverlap) {
        req.flash('error', 'Slot overlaps with an existing slot.');
        return res.redirect(`/updateListing/${listingId}`);
      }
      await Slot.createSlot({
        coach_id: product.coach_id,
        listing_id: product.id,
        slot_date: slotDate,
        slot_time: slotTime,
        duration_minutes: duration,
        location: product.session_location || null,
        note: null
      });
      req.flash('success', 'Slot added.');
      return res.redirect(`/updateListing/${listingId}`);
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to add slot.');
      return res.redirect(`/updateListing/${listingId}`);
    }
  },

  async deleteListingSlot(req, res) {
    const listingId = parseInt(req.params.id, 10);
    const slotId = parseInt(req.params.slotId, 10);
    const user = req.session && req.session.user;
    if (!Number.isFinite(listingId) || !Number.isFinite(slotId)) {
      req.flash('error', 'Invalid slot.');
      return res.redirect(`/updateListing/${listingId}`);
    }
    try {
      const product = await new Promise((resolve, reject) => {
        Listing.getProductById(listingId, (err, row) => (err ? reject(err) : resolve(row)));
      });
      if (!product || (user && user.role === 'coach' && String(product.coach_id) !== String(user.id))) {
        req.flash('error', 'Access denied');
        return res.redirect('/listingsManage');
      }
      const slot = await Slot.getSlotById(slotId);
      if (!slot || Number(slot.listing_id) !== Number(listingId)) {
        req.flash('error', 'Slot not found.');
        return res.redirect(`/updateListing/${listingId}`);
      }
      await Slot.deleteSlot(slotId, product.coach_id);
      req.flash('success', 'Slot deleted.');
      return res.redirect(`/updateListing/${listingId}`);
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to delete slot.');
      return res.redirect(`/updateListing/${listingId}`);
    }
  }
};

module.exports = ListingController;
