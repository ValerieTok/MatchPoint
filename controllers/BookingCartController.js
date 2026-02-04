const Listing = require('../models/Listing');
const BookingCart = require('../models/BookingCart');
const Booking = require('../models/Booking');
const Slot = require('../models/Slot');

const formatDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    if (raw.includes('T')) return raw.split('T')[0];
  }
  return null;
};

const ensureShopperRole = (req, res) => {
  const user = req.session && req.session.user;
  if (!user) {
    req.flash('error', 'Please log in');
    res.redirect('/login');
    return false;
  }
  if (user.role !== 'user') {
    req.flash('error', 'Access denied');
    res.redirect(user.role === 'coach' ? '/listingsManage' : '/');
    return false;
  }
  return true;
};

// keep session cart in sync with DB-backed user cart
async function syncCartToSession(req) {
  const userId = req.session && req.session.user && req.session.user.id;
  if (!userId) return [];
  const items = await new Promise((resolve, reject) => {
    BookingCart.getCart(userId, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
  req.session.cart = items;
  return items;
}

const calculatePricing = (product) => {
  const basePrice = Number.parseFloat(product.price) || 0;
  const discountPercentage = Math.min(
    100,
    Math.max(0, Number.parseFloat(product.discount_percentage) || 0)
  );
  const hasDiscount = discountPercentage > 0;
  const discountedPrice = hasDiscount
    ? Number((basePrice * (1 - discountPercentage / 100)).toFixed(2))
    : Number(basePrice.toFixed(2));

  return {
    basePrice: Number(basePrice.toFixed(2)),
    discountPercentage,
    finalPrice: discountedPrice,
    hasDiscount
  };
};

const getProductByIdAsync = (id) =>
  new Promise((resolve, reject) => {
    Listing.getProductById(id, (err, row) => (err ? reject(err) : resolve(row)));
  });

const addOrUpdateQuantity = (userId, cartItemId, quantity) =>
  new Promise((resolve, reject) => {
    BookingCart.updateQuantity(userId, cartItemId, quantity, (err) => (err ? reject(err) : resolve()));
  });

const getListingRedirect = (productId) =>
  Number.isFinite(productId) ? `/listingDetail/${productId}` : '/userdashboard';

module.exports = {
  async addToCart(req, res) {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser) {
      const productId = parseInt(req.params.id, 10);
      const quantity = 1;
      const slotId = parseInt(req.body.slot_id, 10);
      if (Number.isFinite(productId) && Number.isFinite(slotId)) {
        req.session.pendingBooking = {
          productId,
          quantity,
          slotId
        };
      }
      req.flash('info', 'Please log in to finish booking.');
      return req.session.save(() => res.redirect('/login'));
    }
    if (!ensureShopperRole(req, res)) return;
    try {
      const userId = req.session.user.id;
      const productId = parseInt(req.params.id, 10);
      const fallbackRedirect = getListingRedirect(productId);
      const qty = 1;

      if (Number.isNaN(productId)) {
        req.flash('error', 'Invalid listing selected.');
        return res.redirect('/userdashboard');
      }
      const slotId = parseInt(req.body.slot_id, 10);
      if (!Number.isFinite(slotId)) {
        req.flash('error', 'Please select an available slot.');
        return res.redirect(fallbackRedirect);
      }

      const product = await getProductByIdAsync(productId);
      if (!product) {
        req.flash('error', 'Listing not found');
        return res.redirect(fallbackRedirect);
      }
      if (product.is_active === 0 || product.is_active === '0' || product.coach_status !== 'approved') {
        req.flash('error', 'Listing is not available');
        return res.redirect(fallbackRedirect);
      }
      const slot = await Slot.getSlotById(slotId);
      if (!slot || Number(slot.listing_id) !== Number(product.id) || Number(slot.is_available) !== 1) {
        req.flash('error', 'Selected slot is no longer available.');
        return res.redirect(fallbackRedirect);
      }

      await new Promise((resolve, reject) => {
        BookingCart.addOrIncrement(
          userId,
          productId,
          qty,
          slotId,
          slot.slot_date,
          slot.slot_time,
          (err) => (err ? reject(err) : resolve())
        );
      });
      await syncCartToSession(req);

      const pricing = calculatePricing(product);
      req.flash(
        'success',
        `${product.listing_title} added to booking cart at $${pricing.finalPrice.toFixed(2)}${
          pricing.hasDiscount ? ' (discounted)' : ''
        }.`
      );
      return res.redirect('/bookingCart');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to add to booking cart');
      const productId = parseInt(req.params.id, 10);
      return res.redirect(getListingRedirect(productId));
    }
  },

  async showCart(req, res) {
    if (!ensureShopperRole(req, res)) return;
    try {
      const cart = await syncCartToSession(req);
      const deliveryAddress = req.flash('deliveryAddress')[0] || '';
      return res.render('bookingCart', {
        cart,
        user: req.session && req.session.user,
        deliveryAddress
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to load booking cart');
      return res.redirect('/userdashboard');
    }
  },

  async updateCartItem(req, res) {
    if (!ensureShopperRole(req, res)) return;
    try {
      const userId = req.session.user.id;
      const cartItemId = parseInt(req.params.id, 10);
      const quantity = parseInt(req.body.quantity, 10);

      if (Number.isNaN(cartItemId)) {
        req.flash('error', 'Invalid listing.');
        return res.redirect('/bookingCart');
      }

      // Treat non-positive quantities as removal without stock check
      if (!Number.isFinite(quantity) || quantity <= 0) {
        await addOrUpdateQuantity(userId, cartItemId, quantity);
        await syncCartToSession(req);
        req.flash('success', 'Item removed from booking cart.');
        return res.redirect('/bookingCart');
      }
      if (quantity !== 1) {
        req.flash('error', 'Each booking is for a single slot. Please add another booking instead.');
        return res.redirect('/bookingCart');
      }

      await addOrUpdateQuantity(userId, cartItemId, quantity);
      await syncCartToSession(req);
      req.flash('success', 'Booking cart updated successfully.');
      return res.redirect('/bookingCart');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to update booking cart.');
      return res.redirect('/bookingCart');
    }
  },

  async removeFromCart(req, res) {
    if (!ensureShopperRole(req, res)) return;
    try {
      const userId = req.session.user.id;
      const cartItemId = parseInt(req.params.id, 10);
      if (Number.isNaN(cartItemId)) {
        req.flash('error', 'Invalid listing.');
        return res.redirect('/bookingCart');
      }

      await new Promise((resolve, reject) => {
        BookingCart.removeItem(userId, cartItemId, (err) => (err ? reject(err) : resolve()));
      });
      await syncCartToSession(req);
      req.flash('success', 'Item removed from booking cart.');
      return res.redirect('/bookingCart');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to update booking cart');
      return res.redirect('/bookingCart');
    }
  },

  async confirmCheckout(req, res) {
    if (!ensureShopperRole(req, res)) return;
    try {
      const userId = req.session.user.id;
      const cart = await syncCartToSession(req);
      if (!cart.length) {
        req.flash('error', 'Your booking cart is empty');
        return res.redirect('/bookingCart');
      }
      const slotChecks = await Promise.all(
        cart.map(async (item) => {
          if (!item.slot_id) return { ok: false, item };
          const slot = await Slot.getSlotById(item.slot_id);
          if (!slot || Number(slot.is_available) !== 1) return { ok: false, item };
          return { ok: true, item, slot };
        })
      );
      const invalid = slotChecks.find((check) => !check.ok);
      if (invalid) {
        req.flash('error', 'One of your selected slots is no longer available. Please choose another slot.');
        return res.redirect('/bookingCart');
      }
      const deliveryAddress = cart[0] && cart[0].session_location ? String(cart[0].session_location).trim() : '';

      // Calculate pricing for cart items
      const pricedCart = cart.map((item) => {
        const pricing = calculatePricing(item);
        
        // Convert session_date to DATE format (YYYY-MM-DD) if it's a timestamp
        const sessionDate = formatDateOnly(item.session_date);
        
        return {
          ...item,
          price: pricing.finalPrice,
          listPrice: pricing.basePrice,
          discountPercentage: pricing.discountPercentage,
          offerMessage: item.offer_message,
          session_date: sessionDate
        };
      });

      const total = pricedCart.reduce((sum, item) => {
        return sum + Number(item.price) * Number(item.quantity || 0);
      }, 0);

      // Store in session for payment page
      req.session.pendingPayment = {
        cart: pricedCart,
        deliveryAddress,
        total
      };

      return res.redirect('/payment');
    } catch (err) {
      console.error(err);
      if (err && err.code === 'PRODUCT_NOT_FOUND') {
        req.flash('error', 'One of the listings is no longer available');
      } else {
        req.flash('error', 'Unable to process booking. Please try again.');
      }
      return res.redirect('/bookingCart');
    }
  }
};
