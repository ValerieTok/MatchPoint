const axios = require('axios');
const Booking = require('../models/Booking');
const BookingCart = require('../models/BookingCart');
const Wallet = require('../models/Wallet');
const Slot = require('../models/Slot');
const paypal = require('../services/paypal');
const { clampWalletDeduction } = require('../services/walletLogic');
const stripe = require('../services/stripe');

const SERVICE_FEE = 0;

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

const getPayableTotal = (req) => {
  const sessionTotal = Number.parseFloat(req.session.pendingPayment?.total);
  if (!Number.isFinite(sessionTotal) || sessionTotal <= 0) {
    return null;
  }
  const baseTotal = Number((sessionTotal + SERVICE_FEE).toFixed(2));
  const walletDeduction = Number(req.session.pendingPayment?.walletDeduction || 0);
  return Number(Math.max(0, baseTotal - walletDeduction).toFixed(2));
};

const finalizeBookingPaymentData = async (req, paymentMethod) => {
  const userId = req.session.user.id;
  const cart = req.session.pendingPayment?.cart || [];
  const deliveryAddress = req.session.pendingPayment?.deliveryAddress || '';
  const walletDeduction = Number(req.session.pendingPayment?.walletDeduction || 0);

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

  if (walletDeduction > 0) {
    await new Promise((resolve, reject) => {
      Wallet.deductForBooking(userId, walletDeduction, orderId, (err) => (err ? reject(err) : resolve()));
    });
  }

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
      await new Promise((resolve, reject) => {
        Wallet.ensureWallet(userId, (err) => (err ? reject(err) : resolve()));
      });
      const walletRow = await new Promise((resolve, reject) => {
        Wallet.getWalletByUserId(userId, (err, row) => (err ? reject(err) : resolve(row)));
      });
      const walletBalance = walletRow && Number.isFinite(Number(walletRow.balance))
        ? Number(walletRow.balance)
        : 0;
      const dbCart = await new Promise((resolve, reject) => {
        BookingCart.getCart(userId, (err, rows) => (err ? reject(err) : resolve(rows || [])));
      });
      if (!dbCart.length) {
        req.flash('error', 'No items to pay for');
        return res.redirect('/bookingCart');
      }
      const slotChecks = await Promise.all(
        dbCart.map(async (item) => {
          if (!item.slot_id) return { ok: false };
          const slot = await Slot.getSlotById(item.slot_id);
          if (!slot || Number(slot.is_available) !== 1) return { ok: false };
          return { ok: true };
        })
      );
      const invalid = slotChecks.find((check) => !check.ok);
      if (invalid) {
        req.flash('error', 'A selected slot is no longer available. Please update your cart.');
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

        const sessionDate = formatDateOnly(item.session_date);

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

      const baseTotal = Number((Number(total || 0) + SERVICE_FEE).toFixed(2));
      const walletDeduction = clampWalletDeduction(
        req.session.pendingPayment?.walletDeduction || 0,
        walletBalance,
        baseTotal
      );
      req.session.pendingPayment = {
        cart,
        deliveryAddress,
        total,
        walletDeduction,
        walletBalance
      };

      const paypalAmount = Number(Math.max(0, baseTotal - walletDeduction).toFixed(2));

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
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        paypalCurrency: 'SGD',
        paypalAmount,
        walletBalance,
        walletDeduction,
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
      const { paymentMethod, email, phone, walletDeduction } = req.body;
      const userId = req.session.user.id;
      const walletRow = await new Promise((resolve, reject) => {
        Wallet.getWalletByUserId(userId, (err, row) => (err ? reject(err) : resolve(row)));
      });
      const walletBalance = walletRow && Number.isFinite(Number(walletRow.balance))
        ? Number(walletRow.balance)
        : 0;
      const baseTotal = Number((Number(req.session.pendingPayment?.total || 0) + SERVICE_FEE).toFixed(2));
      const safeWalletDeduction = clampWalletDeduction(walletDeduction, walletBalance, baseTotal);
      req.session.pendingPayment = {
        ...(req.session.pendingPayment || {}),
        walletDeduction: safeWalletDeduction,
        walletBalance
      };
      const dueAfterCredits = Number(Math.max(0, baseTotal - safeWalletDeduction).toFixed(2));

      // Validate payment details
      if (!paymentMethod) {
        req.flash('error', 'Please select a payment method');
        return res.redirect('/payment');
      }

      if (paymentMethod === 'wallet') {
        if (dueAfterCredits > 0) {
          req.flash('error', 'Wallet balance does not cover the full amount.');
          return res.redirect('/payment');
        }
        return finalizeBookingPayment(req, res, 'wallet');
      }

      if (paymentMethod === 'paypal') {
        req.flash('info', 'Please complete the PayPal checkout to confirm your booking.');
        return res.redirect('/payment');
      }

      if (paymentMethod === 'stripe') {
        req.flash('info', 'Please complete the Stripe checkout to confirm your booking.');
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
      const requestedWallet = req.body && Number(req.body.walletDeduction || 0);
      const walletBalance = Number(req.session.pendingPayment?.walletBalance || 0);
      const baseTotal = Number((Number(req.session.pendingPayment?.total || 0) + SERVICE_FEE).toFixed(2));
      const safeWalletDeduction = clampWalletDeduction(requestedWallet, walletBalance, baseTotal);
      req.session.pendingPayment = {
        ...(req.session.pendingPayment || {}),
        walletDeduction: safeWalletDeduction
      };
      const amount = getPayableTotal(req);
      if (!amount) {
        return res.status(400).json({ error: 'Invalid payment amount' });
      }
      if (amount <= 0) {
        return res.status(400).json({ error: 'Wallet covers full amount' });
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

  async stripeCreateCheckoutSession(req, res) {
    if (!ensureShopperRole(req, res)) return;

    try {
      if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PUBLISHABLE_KEY) {
        return res.status(400).json({ error: 'Stripe is not configured' });
      }
      const requestedWallet = req.body && Number(req.body.walletDeduction || 0);
      const walletBalance = Number(req.session.pendingPayment?.walletBalance || 0);
      const baseTotal = Number((Number(req.session.pendingPayment?.total || 0) + SERVICE_FEE).toFixed(2));
      const safeWalletDeduction = clampWalletDeduction(requestedWallet, walletBalance, baseTotal);
      req.session.pendingPayment = {
        ...(req.session.pendingPayment || {}),
        walletDeduction: safeWalletDeduction
      };
      const amount = getPayableTotal(req);
      if (!amount) {
        return res.status(400).json({ error: 'Invalid payment amount' });
      }
      if (amount <= 0) {
        return res.status(400).json({ error: 'Wallet covers full amount' });
      }

      const successUrl = `${req.protocol}://${req.get('host')}/payment/stripe/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${req.protocol}://${req.get('host')}/payment/stripe/fail`;
      const session = await stripe.createCheckoutSession({
        amount,
        currency: 'sgd',
        successUrl,
        cancelUrl,
        description: 'MatchPoint Booking Payment'
      });

      return res.json({ url: session.url });
    } catch (err) {
      console.error('Stripe create session error:', err);
      return res.status(500).json({ error: 'Failed to create Stripe session', message: err.message });
    }
  },

  async stripeSuccess(req, res) {
    if (!ensureShopperRole(req, res)) return;

    try {
      if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PUBLISHABLE_KEY) {
        req.flash('error', 'Stripe is not configured');
        return res.redirect('/payment');
      }
      const sessionId = req.query.session_id;
      if (!sessionId) {
        req.flash('error', 'Missing Stripe session ID');
        return res.redirect('/payment');
      }
      const session = await stripe.retrieveSession(sessionId);
      if (!session || session.payment_status !== 'paid') {
        req.flash('error', 'Stripe payment not completed.');
        return res.redirect('/payment');
      }

      const receiptData = await finalizeBookingPaymentData(req, 'stripe');
      req.session.lastReceipt = receiptData;
      return req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
        }
        return res.redirect('/payment/receipt');
      });
    } catch (err) {
      console.error('Stripe success error:', err);
      req.flash('error', 'Unable to confirm Stripe payment.');
      return res.redirect('/payment');
    }
  },

  async stripeFail(req, res) {
    if (!ensureShopperRole(req, res)) return;
    req.flash('error', 'Stripe transaction failed or was cancelled. Please try again.');
    return res.redirect('/payment');
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
