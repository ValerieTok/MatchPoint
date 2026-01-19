const Booking = require('../models/Booking');
const BookingCart = require('../models/BookingCart');

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

module.exports = {
  async showPaymentPage(req, res) {
    if (!ensureShopperRole(req, res)) return;
    
    try {
      const orderId = req.params.orderId || req.query.orderId;
      const cart = req.session.pendingPayment?.cart || [];
      const deliveryAddress = req.session.pendingPayment?.deliveryAddress || '';
      const total = req.session.pendingPayment?.total || 0;

      if (!cart || cart.length === 0) {
        req.flash('error', 'No items to pay for');
        return res.redirect('/bookingCart');
      }

      return res.render('payment', {
        cart,
        user: req.session.user,
        deliveryAddress,
        total,
        orderId: orderId || 'pending'
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to load payment page');
      return res.redirect('/bookingCart');
    }
  },

  async confirmPayment(req, res) {
    if (!ensureShopperRole(req, res)) return;
    
    try {
      const userId = req.session.user.id;
      const { paymentMethod, cardholderName, cardNumber, expiryDate, cvv, email, phone } = req.body;

      // Validate payment details
      if (!paymentMethod) {
        req.flash('error', 'Please select a payment method');
        return res.redirect('/payment');
      }

      if (paymentMethod === 'card') {
        if (!cardholderName || !cardNumber || !expiryDate || !cvv) {
          req.flash('error', 'Please fill in all card details');
          return res.redirect('/payment');
        }
      }

      // Get cart from session
      const cart = req.session.pendingPayment?.cart || [];
      const deliveryAddress = req.session.pendingPayment?.deliveryAddress || '';

      if (!cart || cart.length === 0) {
        req.flash('error', 'Your booking cart is empty');
        return res.redirect('/bookingCart');
      }

      // Create the booking order
      const { orderId, total } = await new Promise((resolve, reject) => {
        Booking.createOrder(
          userId,
          cart,
          deliveryAddress,
          (err, result) => {
            if (err) {
              console.error('Booking.createOrder error:', err);
              console.error('Error details:', err.message);
              reject(err);
            } else {
              resolve(result);
            }
          }
        );
      });

      // Clear the cart
      await new Promise((resolve, reject) => {
        BookingCart.clearCart(userId, (err) => (err ? reject(err) : resolve()));
      });

      // Clear session data
      req.session.cart = [];
      delete req.session.pendingPayment;

      // Show receipt
      req.flash('success', 'Payment successful! Your booking has been confirmed.');
      
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
        }
        return res.render('bookingReceipt', {
          cart,
          user: req.session.user,
          deliveryAddress,
          total: total || 0,
          orderId,
          mode: 'receipt',
          paymentMethod,
          messages: req.flash()
        });
      });
    } catch (err) {
      console.error('Payment error:', err);
      console.error('Error stack:', err.stack);
      req.flash('error', 'Payment processing failed. Please try again.');
      return res.redirect('/payment');
    }
  }
};
