const Product = require('../models/Product');
const Cart = require('../models/cart');
const userModel = require('../models/User');
const Order = require('../models/Order');

const ensureShopperRole = (req, res) => {
  const user = req.session && req.session.user;
  if (!user) {
    req.flash('error', 'Please log in');
    res.redirect('/login');
    return false;
  }
  if (user.role === 'admin') {
    req.flash('error', 'Access denied');
    res.redirect('/inventory');
    return false;
  }
  return true;
};

// keep session cart in sync with DB-backed user cart
async function syncCartToSession(req) {
  const userId = req.session && req.session.user && req.session.user.id;
  if (!userId) return [];
  const items = await new Promise((resolve, reject) => {
    Cart.getCart(userId, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
  req.session.cart = items;
  return items;
}

const calculatePricing = (product) => {
  const basePrice = Number.parseFloat(product.price) || 0;
  const discountPercentage = Math.min(
    100,
    Math.max(0, Number.parseFloat(product.discountPercentage) || 0)
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
    Product.getProductById(id, (err, row) => (err ? reject(err) : resolve(row)));
  });

const addOrUpdateQuantity = (userId, productId, quantity) =>
  new Promise((resolve, reject) => {
    Cart.updateQuantity(userId, productId, quantity, (err) => (err ? reject(err) : resolve()));
  });

const addOrIncrementItem = (userId, productId, qty) =>
  new Promise((resolve, reject) => {
    Cart.addOrIncrement(userId, productId, qty, (err) => (err ? reject(err) : resolve()));
  });

module.exports = {
  async addToCart(req, res) {
    if (!ensureShopperRole(req, res)) return;
    try {
      const userId = req.session.user.id;
      const productId = parseInt(req.params.id, 10);
      const qty = parseInt(req.body.quantity, 10) || 1;

      if (Number.isNaN(productId)) {
        req.flash('error', 'Invalid product selected.');
        return res.redirect('/shopping');
      }

      const product = await getProductByIdAsync(productId);
      if (!product) {
        req.flash('error', 'Product not found');
        return res.redirect('/shopping');
      }
      const available = Number(product.quantity) || 0;
      if (available <= 0) {
        req.flash('error', 'Product is out of stock');
        return res.redirect('/shopping');
      }

      const cartItems = await syncCartToSession(req);
      const existingQty =
        cartItems.find((item) => Number(item.productId) === productId)?.quantity || 0;
      const desiredQty = existingQty + qty;
      if (desiredQty > available) {
        req.flash('error', `Only ${available} left in stock`);
        return res.redirect('/shopping');
      }

      await addOrIncrementItem(userId, productId, qty);
      await syncCartToSession(req);

      const pricing = calculatePricing(product);
      req.flash(
        'success',
        `${product.productName} added to cart at $${pricing.finalPrice.toFixed(2)}${
          pricing.hasDiscount ? ' (discounted)' : ''
        }.`
      );
      return res.redirect('/cart');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to add to cart');
      return res.redirect('/shopping');
    }
  },

  async showCart(req, res) {
    if (!ensureShopperRole(req, res)) return;
    try {
      const cart = await syncCartToSession(req);
      const flashAddress = req.flash('deliveryAddress')[0] || '';
      const sessionAddress = req.session.user && req.session.user.address ? req.session.user.address : '';
      const deliveryAddress = flashAddress || sessionAddress;
      return res.render('cart', {
        cart,
        user: req.session && req.session.user,
        deliveryAddress
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to load cart');
      return res.redirect('/shopping');
    }
  },

  async updateCartItem(req, res) {
    if (!ensureShopperRole(req, res)) return;
    try {
      const userId = req.session.user.id;
      const productId = parseInt(req.params.id, 10);
      const quantity = parseInt(req.body.quantity, 10);

      if (Number.isNaN(productId)) {
        req.flash('error', 'Invalid product.');
        return res.redirect('/cart');
      }

      // Treat non-positive quantities as removal without stock check
      if (!Number.isFinite(quantity) || quantity <= 0) {
        await addOrUpdateQuantity(userId, productId, quantity);
        await syncCartToSession(req);
        req.flash('success', 'Item removed from cart.');
        return res.redirect('/cart');
      }

      const product = await getProductByIdAsync(productId);
      if (!product) {
        req.flash('error', 'Product not found.');
        return res.redirect('/cart');
      }

      const available = Number(product.quantity) || 0;
      if (available <= 0) {
        req.flash('error', 'Sorry, this item is out of stock.');
        return res.redirect('/cart');
      }
      if (quantity > available) {
        req.flash('error', `Only ${available} available for ${product.productName}.`);
        return res.redirect('/cart');
      }

      await addOrUpdateQuantity(userId, productId, quantity);
      await syncCartToSession(req);
      req.flash('success', 'Cart updated successfully.');
      return res.redirect('/cart');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to update cart.');
      return res.redirect('/cart');
    }
  },

  async removeFromCart(req, res) {
    if (!ensureShopperRole(req, res)) return;
    try {
      const userId = req.session.user.id;
      const productId = parseInt(req.params.id, 10);
      if (Number.isNaN(productId)) {
        req.flash('error', 'Invalid product.');
        return res.redirect('/cart');
      }

      await new Promise((resolve, reject) => {
        Cart.removeItem(userId, productId, (err) => (err ? reject(err) : resolve()));
      });
      await syncCartToSession(req);
      req.flash('success', 'Item removed from cart.');
      return res.redirect('/cart');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to update cart');
      return res.redirect('/cart');
    }
  },

  async showCheckoutSummary(req, res) {
    if (!ensureShopperRole(req, res)) return;
    try {
      const cart = await syncCartToSession(req);
      if (!cart.length) {
        req.flash('error', 'Your cart is empty');
        return res.redirect('/cart');
      }
      const requested = (req.body && req.body.deliveryAddress ? String(req.body.deliveryAddress).trim() : '');
      const sessionAddress = req.session.user && req.session.user.address ? req.session.user.address : '';
      const deliveryAddress = requested || sessionAddress;
      if (!deliveryAddress) {
        req.flash('error', 'Delivery address required');
        req.flash('deliveryAddress', requested);
        return res.redirect('/cart');
      }
      const total = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
      return res.render('checkout', {
        cart,
        user: req.session && req.session.user,
        deliveryAddress,
        total
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to build invoice');
      return res.redirect('/cart');
    }
  },

  async confirmCheckout(req, res) {
    if (!ensureShopperRole(req, res)) return;
    try {
      const userId = req.session.user.id;
      const providedAddress = (req.body && req.body.deliveryAddress ? String(req.body.deliveryAddress).trim() : '');
      const sessionAddress = req.session.user && req.session.user.address ? req.session.user.address : '';
      const deliveryAddress = providedAddress || sessionAddress;
      const cart = await syncCartToSession(req);
      if (!cart.length) {
        req.flash('error', 'Your cart is empty');
        return res.redirect('/cart');
      }
      if (!deliveryAddress) {
        req.flash('error', 'Delivery address required');
        req.flash('deliveryAddress', providedAddress);
        return res.redirect('/cart');
      }
      if (providedAddress && !sessionAddress) {
        await new Promise((resolve, reject) => {
          userModel.updateAddressOnly(userId, providedAddress, (err) => (err ? reject(err) : resolve()));
        });
        req.session.user.address = providedAddress;
      }
      const cartSnapshot = cart.map((item) => ({ ...item }));
      await new Promise((resolve, reject) => {
        Product.deductStock(cart, (err) => (err ? reject(err) : resolve()));
      });
      const { orderId, total } = await new Promise((resolve, reject) => {
        Order.createOrder(
          userId,
          cart,
          deliveryAddress || null,
          (err, result) => (err ? reject(err) : resolve(result))
        );
      });
      await new Promise((resolve, reject) => {
        Cart.clearCart(userId, (err) => (err ? reject(err) : resolve()));
      });
      req.session.cart = [];
      return res.render('invoice', {
        cart: cartSnapshot,
        user: req.session && req.session.user,
        deliveryAddress,
        total: total || 0,
        orderId,
        mode: 'receipt'
      });
    } catch (err) {
      console.error(err);
      if (err && err.code === 'INSUFFICIENT_STOCK') {
        req.flash('error', `Not enough stock for ${err.productName || 'an item'}. Available: ${err.available}`);
      } else if (err && err.code === 'PRODUCT_NOT_FOUND') {
        req.flash('error', 'One of the items is no longer available');
      } else {
        req.flash('error', 'Unable to process checkout. Please try again.');
      }
      return res.redirect('/cart');
    }
  }
};
