const Listing = require('../models/Listing');
const BookingCart = require('../models/BookingCart');
const Booking = require('../models/Booking');

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

const addOrUpdateQuantity = (userId, productId, quantity) =>
  new Promise((resolve, reject) => {
    BookingCart.updateQuantity(userId, productId, quantity, (err) => (err ? reject(err) : resolve()));
  });

const addOrIncrementItem = (userId, productId, qty) =>
  new Promise((resolve, reject) => {
    BookingCart.addOrIncrement(userId, productId, qty, (err) => (err ? reject(err) : resolve()));
  });

module.exports = {
  async addToCart(req, res) {
    if (!ensureShopperRole(req, res)) return;
    try {
      const userId = req.session.user.id;
      const productId = parseInt(req.params.id, 10);
      const qty = parseInt(req.body.quantity, 10) || 1;
      if (!Number.isFinite(qty) || qty <= 0) {
        req.flash('error', 'Quantity must be at least 1');
        return res.redirect('/listingsBrowse');
      }

      if (Number.isNaN(productId)) {
        req.flash('error', 'Invalid listing selected.');
        return res.redirect('/listingsBrowse');
      }

      const product = await getProductByIdAsync(productId);
      if (!product) {
        req.flash('error', 'Listing not found');
        return res.redirect('/listingsBrowse');
      }
      if (product.is_active === 0 || product.is_active === '0') {
        req.flash('error', 'Listing is not available');
        return res.redirect('/listingsBrowse');
      }
      const available = Number(product.available_slots) || 0;
      if (available <= 0) {
        req.flash('error', 'No session slots available');
        return res.redirect('/listingsBrowse');
      }

      const cartItems = await syncCartToSession(req);
      const existingQty =
        cartItems.find((item) => Number(item.listing_id) === productId)?.quantity || 0;
      const desiredQty = existingQty + qty;
      if (desiredQty > available) {
        req.flash('error', `Only ${available} session slots available`);
        return res.redirect('/listingsBrowse');
      }

      await addOrIncrementItem(userId, productId, qty);
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
      return res.redirect('/listingsBrowse');
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
      return res.redirect('/listingsBrowse');
    }
  },

  async updateCartItem(req, res) {
    if (!ensureShopperRole(req, res)) return;
    try {
      const userId = req.session.user.id;
      const productId = parseInt(req.params.id, 10);
      const quantity = parseInt(req.body.quantity, 10);

      if (Number.isNaN(productId)) {
        req.flash('error', 'Invalid listing.');
        return res.redirect('/bookingCart');
      }

      // Treat non-positive quantities as removal without stock check
      if (!Number.isFinite(quantity) || quantity <= 0) {
        await addOrUpdateQuantity(userId, productId, quantity);
        await syncCartToSession(req);
        req.flash('success', 'Item removed from booking cart.');
        return res.redirect('/bookingCart');
      }

      const product = await getProductByIdAsync(productId);
      if (!product) {
        req.flash('error', 'Listing not found.');
        return res.redirect('/bookingCart');
      }

      const available = Number(product.available_slots) || 0;
      if (available <= 0) {
        req.flash('error', 'No session slots available.');
        return res.redirect('/bookingCart');
      }
      if (quantity > available) {
        req.flash('error', `Only ${available} session slots available for ${product.listing_title}.`);
        return res.redirect('/bookingCart');
      }

      await addOrUpdateQuantity(userId, productId, quantity);
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
      const productId = parseInt(req.params.id, 10);
      if (Number.isNaN(productId)) {
        req.flash('error', 'Invalid listing.');
        return res.redirect('/bookingCart');
      }

      await new Promise((resolve, reject) => {
        BookingCart.removeItem(userId, productId, (err) => (err ? reject(err) : resolve()));
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

  async showCheckoutSummary(req, res) {
    if (!ensureShopperRole(req, res)) return;
    try {
      const cart = await syncCartToSession(req);
      if (!cart.length) {
        req.flash('error', 'Your booking cart is empty');
        return res.redirect('/bookingCart');
      }
      const deliveryAddress = (req.body && req.body.deliveryAddress ? String(req.body.deliveryAddress).trim() : '');
      if (!deliveryAddress) {
        req.flash('error', 'Session location required');
        req.flash('deliveryAddress', deliveryAddress);
        return res.redirect('/bookingCart');
      }
      const total = cart.reduce((sum, item) => {
        const pricing = calculatePricing(item);
        return sum + pricing.finalPrice * Number(item.quantity || 0);
      }, 0);
      return res.render('bookingCheckout', {
        cart,
        user: req.session && req.session.user,
        deliveryAddress,
        total
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to build booking summary');
      return res.redirect('/bookingCart');
    }
  },

  async confirmCheckout(req, res) {
    if (!ensureShopperRole(req, res)) return;
    try {
      const userId = req.session.user.id;
      const deliveryAddress = (req.body && req.body.deliveryAddress ? String(req.body.deliveryAddress).trim() : '');
      const cart = await syncCartToSession(req);
      if (!cart.length) {
        req.flash('error', 'Your booking cart is empty');
        return res.redirect('/bookingCart');
      }
      if (!deliveryAddress) {
        req.flash('error', 'Session location required');
        req.flash('deliveryAddress', deliveryAddress);
        return res.redirect('/bookingCart');
      }
      await new Promise((resolve, reject) => {
        Listing.deductStock(cart, (err) => (err ? reject(err) : resolve()));
      });
      const pricedCart = cart.map((item) => {
        const pricing = calculatePricing(item);
        return {
          ...item,
          price: pricing.finalPrice,
          listPrice: pricing.basePrice,
          discountPercentage: pricing.discountPercentage,
          offerMessage: item.offer_message
        };
      });
      const { orderId, total } = await new Promise((resolve, reject) => {
        Booking.createOrder(
          userId,
          pricedCart,
          deliveryAddress || null,
          (err, result) => (err ? reject(err) : resolve(result))
        );
      });
      await new Promise((resolve, reject) => {
        BookingCart.clearCart(userId, (err) => (err ? reject(err) : resolve()));
      });
      req.session.cart = [];
      return res.render('bookingReceipt', {
        cart: pricedCart,
        user: req.session && req.session.user,
        deliveryAddress,
        total: total || 0,
        orderId,
        mode: 'receipt'
      });
    } catch (err) {
      console.error(err);
      if (err && err.code === 'INSUFFICIENT_STOCK') {
        req.flash('error', `Not enough slots for ${err.listing_title || 'a listing'}. Available: ${err.available}`);
      } else if (err && err.code === 'PRODUCT_NOT_FOUND') {
        req.flash('error', 'One of the listings is no longer available');
      } else {
        req.flash('error', 'Unable to process booking. Please try again.');
      }
      return res.redirect('/bookingCart');
    }
  }
};
