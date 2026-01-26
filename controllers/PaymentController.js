const axios = require('axios');
const Booking = require('../models/Booking');
const BookingCart = require('../models/BookingCart');
const paypal = require('../services/paypal');

const SERVICE_FEE = 2.5;

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

const getPayableTotal = (req) => {
  const sessionTotal = Number.parseFloat(req.session.pendingPayment?.total);
  if (!Number.isFinite(sessionTotal) || sessionTotal <= 0) {
    return null;
  }
  return Number((sessionTotal + SERVICE_FEE).toFixed(2));
};

const finalizeBookingPaymentData = async (req, paymentMethod) => {
  const userId = req.session.user.id;
  const cart = req.session.pendingPayment?.cart || [];
  const deliveryAddress = req.session.pendingPayment?.deliveryAddress || '';

  if (!cart || cart.length === 0) {
    req.flash('error', 'Your booking cart is empty');
    return res.redirect('/bookingCart');
  }

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

  await new Promise((resolve, reject) => {
    BookingCart.clearCart(userId, (err) => (err ? reject(err) : resolve()));
  });

  req.session.cart = [];
  delete req.session.pendingPayment;

  req.flash('success', 'Payment successful! Your booking has been confirmed.');

  return {
    cart,
    user: req.session.user,
    deliveryAddress,
    total: total || 0,
    orderId,
    mode: 'receipt',
    paymentMethod
  };
};

const finalizeBookingPayment = async (req, res, paymentMethod) => {
  const receiptData = await finalizeBookingPaymentData(req, paymentMethod);

  req.session.save((saveErr) => {
    if (saveErr) {
      console.error('Session save error:', saveErr);
    }
    return res.render('bookingReceipt', {
      ...receiptData,
      messages: req.flash()
    });
  });
};

const queryNetsQrStatus = async (txnRetrievalRef) => {
  const response = await axios.post(
    'https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/query',
    { txn_retrieval_ref: txnRetrievalRef, frontend_timeout_status: 0 },
    {
      headers: {
        'api-key': process.env.API_KEY,
        'project-id': process.env.PROJECT_ID,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data?.result?.data;
};

module.exports = {
  async showPaymentPage(req, res) {
    if (!ensureShopperRole(req, res)) return;
    
    try {
      const orderId = req.params.orderId || req.query.orderId;
      const userId = req.session.user.id;
      const dbCart = await new Promise((resolve, reject) => {
        BookingCart.getCart(userId, (err, rows) => (err ? reject(err) : resolve(rows || [])));
      });
      if (!dbCart.length) {
        req.flash('error', 'No items to pay for');
        return res.redirect('/bookingCart');
      }

      const pricedCart = dbCart.map((item) => {
        const basePrice = Number.parseFloat(item.price) || 0;
        const discountPercentage = Math.min(
          100,
          Math.max(0, Number.parseFloat(item.discount_percentage) || 0)
        );
        const hasDiscount = discountPercentage > 0;
        const discountedPrice = hasDiscount
          ? Number((basePrice * (1 - discountPercentage / 100)).toFixed(2))
          : Number(basePrice.toFixed(2));

        let sessionDate = item.session_date || null;
        if (sessionDate) {
          if (sessionDate instanceof Date) {
            sessionDate = sessionDate.toISOString().split('T')[0];
          } else if (typeof sessionDate === 'string' && sessionDate.includes('T')) {
            sessionDate = sessionDate.split('T')[0];
          }
        }

        return {
          ...item,
          price: discountedPrice,
          listPrice: Number(basePrice.toFixed(2)),
          discountPercentage,
          offerMessage: item.offer_message,
          session_date: sessionDate
        };
      });

      const total = pricedCart.reduce((sum, item) => {
        return sum + Number(item.price) * Number(item.quantity || 0);
      }, 0);

      const cart = pricedCart;
      const deliveryAddress = dbCart[0] && dbCart[0].session_location ? String(dbCart[0].session_location).trim() : '';

      req.session.pendingPayment = {
        cart,
        deliveryAddress,
        total
      };

      const paypalAmount = Number((Number(total || 0) + SERVICE_FEE).toFixed(2));

      return res.render('payment', {
        cart,
        user: req.session.user,
        deliveryAddress,
        total,
        orderId: orderId || 'pending',
        txnRetrievalRef: '',
        fullNetsResponse: {},
        qrCodeUrl: '',
        paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
        paypalCurrency: 'SGD',
        paypalAmount,
        messages: req.flash()
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
      const { paymentMethod, email, phone } = req.body;

      // Validate payment details
      if (!paymentMethod) {
        req.flash('error', 'Please select a payment method');
        return res.redirect('/payment');
      }

      if (paymentMethod === 'paypal') {
        req.flash('info', 'Please complete the PayPal checkout to confirm your booking.');
        return res.redirect('/payment');
      }

      if (paymentMethod === 'netsqr') {
        if (!email || !phone) {
          req.flash('error', 'Please provide email and phone number for NETS QR payment');
          return res.redirect('/payment');
        }
        req.flash('info', 'Generate the NETS QR code and complete payment. Confirmation is automatic.');
        return res.redirect('/payment');
      }

      return finalizeBookingPayment(req, res, paymentMethod);
    } catch (err) {
      console.error('Payment error:', err);
      console.error('Error stack:', err.stack);
      req.flash('error', 'Payment processing failed. Please try again.');
      return res.redirect('/payment');
    }
  },

  async netsQrSuccess(req, res) {
    if (!ensureShopperRole(req, res)) return;

    try {
      const txnRetrievalRef = req.query.txn_retrieval_ref;
      const sessionTxn = req.session.pendingPayment?.nets?.txnRetrievalRef;

      if (!txnRetrievalRef || !sessionTxn || txnRetrievalRef !== sessionTxn) {
        req.flash('error', 'NETS transaction not found for this session.');
        return res.redirect('/payment');
      }

      const resData = await queryNetsQrStatus(txnRetrievalRef);
      if (resData?.response_code === '00' && resData?.txn_status === 1) {
        return finalizeBookingPayment(req, res, 'netsqr');
      }

      req.flash('error', resData?.error_message || 'NETS payment not confirmed yet.');
      return res.redirect('/payment');
    } catch (err) {
      console.error('NETS success verify error:', err.message);
      req.flash('error', 'Unable to confirm NETS payment. Please try again.');
      return res.redirect('/payment');
    }
  },

  async netsQrFail(req, res) {
    if (!ensureShopperRole(req, res)) return;
    req.flash('error', 'NETS transaction failed or timed out. Please try again.');
    return res.redirect('/payment');
  },

  async paypalCreateOrder(req, res) {
    if (!ensureShopperRole(req, res)) return;

    try {
      if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET || !process.env.PAYPAL_API) {
        return res.status(400).json({ error: 'PayPal is not configured' });
      }
      const amount = getPayableTotal(req);
      if (!amount) {
        return res.status(400).json({ error: 'Invalid payment amount' });
      }

      const order = await paypal.createOrder(amount, 'SGD');
      if (order && order.id) {
        return res.json({ id: order.id });
      }
      return res.status(500).json({ error: 'Failed to create PayPal order', details: order });
    } catch (err) {
      console.error('PayPal create order error:', err);
      return res.status(500).json({ error: 'Failed to create PayPal order', message: err.message });
    }
  },

  async paypalCaptureOrder(req, res) {
    if (!ensureShopperRole(req, res)) return;

    try {
      if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET || !process.env.PAYPAL_API) {
        return res.status(400).json({ error: 'PayPal is not configured' });
      }
      const { orderID } = req.body || {};
      if (!orderID) {
        return res.status(400).json({ error: 'Missing PayPal order ID' });
      }

      const capture = await paypal.captureOrder(orderID);
      if (capture && capture.status === 'COMPLETED') {
        const receiptData = await finalizeBookingPaymentData(req, 'paypal');
        req.session.lastReceipt = receiptData;
        return req.session.save((saveErr) => {
          if (saveErr) {
            console.error('Session save error:', saveErr);
          }
          return res.json({ success: true, redirectUrl: '/payment/receipt' });
        });
      }

      return res.status(400).json({ error: 'Payment not completed', details: capture });
    } catch (err) {
      console.error('PayPal capture error:', err);
      return res.status(500).json({ error: 'Failed to capture PayPal order', message: err.message });
    }
  },

  async showReceipt(req, res) {
    if (!ensureShopperRole(req, res)) return;

    const receipt = req.session.lastReceipt;
    if (!receipt) {
      req.flash('error', 'No recent payment found.');
      return res.redirect('/userdashboard');
    }

    delete req.session.lastReceipt;
    return res.render('bookingReceipt', {
      ...receipt,
      messages: req.flash()
    });
  }
};
