const axios = require('axios');
const Wallet = require('../models/Wallet');
const UserProfile = require('../models/UserProfile');
const paypal = require('../services/paypal');
const { isValidTopUpAmount } = require('../services/walletLogic');
const stripe = require('../services/stripe');

const allowedMethods = new Set(['paypal', 'nets', 'stripe']);
const walletBasePath = '/ewallet';

const WalletController = {
  async showWallet(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'user') {
      req.flash('error', 'Access denied');
      return res.redirect('/userdashboard');
    }

    try {
      await new Promise((resolve, reject) => {
        Wallet.ensureWallet(user.id, (err) => (err ? reject(err) : resolve()));
      });

      const [wallet, transactions, profile] = await Promise.all([
        new Promise((resolve, reject) => {
          Wallet.getWalletByUserId(user.id, (err, row) => (err ? reject(err) : resolve(row)));
        }),
        new Promise((resolve, reject) => {
          Wallet.getRecentTransactions(user.id, 8, (err, rows) => (err ? reject(err) : resolve(rows || [])));
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
      const pendingTopup = req.session.pendingWalletTopup;
      if (pendingTopup && pendingTopup.generatedAt) {
        const elapsedMs = Date.now() - Number(pendingTopup.generatedAt);
        if (Number.isFinite(elapsedMs) && elapsedMs > 5 * 60 * 1000) {
          delete req.session.pendingWalletTopup;
          req.flash('error', 'NETS QR expired after 5 minutes. Generate a new QR to try again.');
        }
      }
      return res.render('wallet', {
        user,
        wallet: wallet || { balance: 0 },
        transactions,
        profilePhoto,
        qrCodeUrl: req.session.pendingWalletTopup?.qrCodeUrl || '',
        txnRetrievalRef: req.session.pendingWalletTopup?.txnRetrievalRef || '',
        qrGeneratedAt: req.session.pendingWalletTopup?.generatedAt || 0,
        paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        paypalCurrency: 'SGD',
        messages: req.flash()
      });
    } catch (err) {
      console.error('Failed to load wallet:', err);
      req.flash('error', 'Unable to load wallet right now.');
      return res.render('wallet', {
        user,
        wallet: { balance: 0 },
        transactions: [],
        profilePhoto: null,
        qrCodeUrl: '',
        txnRetrievalRef: '',
        qrGeneratedAt: 0,
        paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        paypalCurrency: 'SGD',
        messages: req.flash()
      });
    }
  },

  async topUp(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'user') {
      req.flash('error', 'Access denied');
      return res.redirect('/userdashboard');
    }

    const amountRaw = req.body && req.body.amount ? Number(req.body.amount) : NaN;
    const methodRaw = req.body && req.body.method ? String(req.body.method).trim().toLowerCase() : '';

    if (!isValidTopUpAmount(amountRaw)) {
      req.flash('error', 'Select a valid top up amount.');
      return res.redirect(walletBasePath);
    }

    if (!allowedMethods.has(methodRaw)) {
      req.flash('error', 'Select a valid payment method.');
      return res.redirect(walletBasePath);
    }

    if (methodRaw === 'nets') {
      req.session.pendingWalletTopup = {
        amount: amountRaw,
        method: methodRaw
      };
      return res.redirect(`${walletBasePath}/nets/qr`);
    }

    if (methodRaw === 'stripe') {
      req.session.pendingWalletTopup = {
        amount: amountRaw,
        method: methodRaw
      };
      req.flash('info', 'Complete Stripe checkout to top up your wallet.');
      return res.redirect(walletBasePath);
    }

    // PayPal topup handled via API endpoints
    req.session.pendingWalletTopup = {
      amount: amountRaw,
      method: methodRaw
    };
    req.flash('info', 'Complete PayPal checkout to top up your wallet.');
    return res.redirect(walletBasePath);
  },

  async getWalletApi(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'user') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      await new Promise((resolve, reject) => {
        Wallet.ensureWallet(user.id, (err) => (err ? reject(err) : resolve()));
      });

      const [wallet, transactions] = await Promise.all([
        new Promise((resolve, reject) => {
          Wallet.getWalletByUserId(user.id, (err, row) => (err ? reject(err) : resolve(row)));
        }),
        new Promise((resolve, reject) => {
          Wallet.getRecentTransactions(user.id, 8, (err, rows) => (err ? reject(err) : resolve(rows || [])));
        })
      ]);

      const balance = wallet && Number.isFinite(Number(wallet.balance)) ? Number(wallet.balance) : 0;
      return res.json({ balance, transactions });
    } catch (err) {
      console.error('Wallet API error:', err);
      return res.status(500).json({ error: 'Failed to load wallet' });
    }
  },

  async topUpApi(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'user') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const amountRaw = req.body && req.body.amount ? Number(req.body.amount) : NaN;
    const methodRaw = req.body && req.body.paymentMethod
      ? String(req.body.paymentMethod).trim().toLowerCase()
      : '';

    if (!isValidTopUpAmount(amountRaw)) {
      return res.status(400).json({ error: 'Invalid top up amount' });
    }

    if (!allowedMethods.has(methodRaw)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    req.session.pendingWalletTopup = {
      amount: amountRaw,
      method: methodRaw
    };

    if (methodRaw === 'nets') {
      return res.json({ redirectUrl: `${walletBasePath}/nets/qr` });
    }

    return res.json({ redirectUrl: walletBasePath });
  },

  async paypalCreateOrder(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'user') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET || !process.env.PAYPAL_API) {
        return res.status(400).json({ error: 'PayPal is not configured' });
      }
      const amountRaw = Number(req.body && req.body.amount);
      if (!isValidTopUpAmount(amountRaw)) {
        return res.status(400).json({ error: 'Invalid top up amount' });
      }
      req.session.pendingWalletTopup = {
        amount: amountRaw,
        method: 'paypal'
      };
      const order = await paypal.createOrder(amountRaw, 'SGD');
      if (order && order.id) {
        return res.json({ id: order.id });
      }
      return res.status(500).json({ error: 'Failed to create PayPal order', details: order });
    } catch (err) {
      console.error('Wallet PayPal create order error:', err);
      return res.status(500).json({ error: 'Failed to create PayPal order', message: err.message });
    }
  },

  async paypalCaptureOrder(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'user') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
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
        const amount = Number(req.session.pendingWalletTopup?.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) {
          return res.status(400).json({ error: 'Missing top up amount' });
        }
        await new Promise((resolve, reject) => {
          Wallet.addTopUp(user.id, amount, 'paypal', (err) => (err ? reject(err) : resolve()));
        });
        delete req.session.pendingWalletTopup;
        return res.json({ success: true, redirectUrl: walletBasePath });
      }
      return res.status(400).json({ error: 'Payment not completed', details: capture });
    } catch (err) {
      console.error('Wallet PayPal capture error:', err);
      return res.status(500).json({ error: 'Failed to capture PayPal order', message: err.message });
    }
  },

  async stripeCreateCheckoutSession(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'user') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PUBLISHABLE_KEY) {
        return res.status(400).json({ error: 'Stripe is not configured' });
      }
      const amountRaw = Number(req.body && req.body.amount);
      if (!isValidTopUpAmount(amountRaw)) {
        return res.status(400).json({ error: 'Invalid top up amount' });
      }
      req.session.pendingWalletTopup = {
        amount: amountRaw,
        method: 'stripe'
      };
      const successUrl = `${req.protocol}://${req.get('host')}${walletBasePath}/stripe/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${req.protocol}://${req.get('host')}${walletBasePath}/stripe/fail`;
      const session = await stripe.createCheckoutSession({
        amount: amountRaw,
        currency: 'sgd',
        successUrl,
        cancelUrl,
        description: 'MatchPoint Wallet Top Up'
      });
      return res.json({ url: session.url });
    } catch (err) {
      console.error('Wallet Stripe create session error:', err);
      return res.status(500).json({ error: 'Failed to create Stripe session', message: err.message });
    }
  },

  async stripeSuccess(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'user') {
      req.flash('error', 'Access denied');
      return res.redirect('/userdashboard');
    }
    try {
      if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PUBLISHABLE_KEY) {
        req.flash('error', 'Stripe is not configured');
        return res.redirect(walletBasePath);
      }
      const sessionId = req.query.session_id;
      if (!sessionId) {
        req.flash('error', 'Missing Stripe session ID');
        return res.redirect(walletBasePath);
      }
      const session = await stripe.retrieveSession(sessionId);
      if (!session || session.payment_status !== 'paid') {
        req.flash('error', 'Stripe payment not completed.');
        return res.redirect(walletBasePath);
      }
      const amount = Number(req.session.pendingWalletTopup?.amount || 0);
      if (!isValidTopUpAmount(amount)) {
        req.flash('error', 'Missing top up amount');
        return res.redirect(walletBasePath);
      }
      await new Promise((resolve, reject) => {
        Wallet.addTopUp(user.id, amount, 'stripe', (err) => (err ? reject(err) : resolve()));
      });
      delete req.session.pendingWalletTopup;
      req.flash('success', `Wallet topped up by $${amount.toFixed(2)}.`);
      return res.redirect(walletBasePath);
    } catch (err) {
      console.error('Wallet Stripe success error:', err.message);
      req.flash('error', 'Unable to confirm Stripe top up. Please try again.');
      return res.redirect(walletBasePath);
    }
  },

  async stripeFail(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'user') {
      req.flash('error', 'Access denied');
      return res.redirect('/userdashboard');
    }
    req.flash('error', 'Stripe transaction failed or was cancelled. Please try again.');
    return res.redirect(walletBasePath);
  },

  async netsQr(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'user') {
      req.flash('error', 'Access denied');
      return res.redirect('/userdashboard');
    }
    const amount = Number(req.session.pendingWalletTopup?.amount || req.body?.amount);
    if (!isValidTopUpAmount(amount)) {
      req.flash('error', 'Invalid top up amount.');
      return res.redirect(walletBasePath);
    }

    try {
      const txnId = process.env.NETS_TXN_ID
        || 'sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b';
      const requestBody = {
        txn_id: txnId,
        amt_in_dollars: Number(amount.toFixed(2)),
        notify_mobile: 0
      };
      const response = await axios.post(
        'https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/request',
        requestBody,
        {
          headers: {
            'api-key': process.env.API_KEY,
            'project-id': process.env.PROJECT_ID,
            'Content-Type': 'application/json'
          }
        }
      );

      const qrData = response.data?.result?.data;
      if (qrData?.response_code === '00' && qrData?.txn_status === 1 && qrData?.qr_code) {
        const txnRetrievalRef = qrData.txn_retrieval_ref;
        req.session.pendingWalletTopup = {
          amount,
          method: 'nets',
          txnRetrievalRef,
          qrCodeUrl: `data:image/png;base64,${qrData.qr_code}`,
          generatedAt: Date.now()
        };
        req.flash('info', 'Scan the NETS QR code to complete your top up.');
        return res.redirect(walletBasePath);
      }

      req.flash('error', qrData?.error_message || 'Unable to generate NETS QR code.');
      return res.redirect(walletBasePath);
    } catch (err) {
      console.error('Wallet NETS QR error:', err.message);
      req.flash('error', 'Unable to generate NETS QR code.');
      return res.redirect(walletBasePath);
    }
  },

  async netsSuccess(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'user') {
      req.flash('error', 'Access denied');
      return res.redirect('/userdashboard');
    }
    try {
      const txnRetrievalRef = req.query.txn_retrieval_ref;
      const sessionTxn = req.session.pendingWalletTopup?.txnRetrievalRef;
      const startedAt = Number(req.session.pendingWalletTopup?.startedAt || 0);
      const NETS_TIMEOUT_MS = 5 * 60 * 1000;
      if (!txnRetrievalRef || !sessionTxn || txnRetrievalRef !== sessionTxn) {
        req.flash('error', 'NETS transaction not found for this session.');
        return res.redirect(walletBasePath);
      }
      if (!Number.isFinite(startedAt) || startedAt <= 0 || (Date.now() - startedAt) > NETS_TIMEOUT_MS) {
        req.flash('error', 'NETS transaction timed out. Please try again.');
        return res.redirect(walletBasePath);
      }
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
      const resData = response.data?.result?.data;
      if (resData?.response_code === '00' && resData?.txn_status === 1) {
        const amount = Number(req.session.pendingWalletTopup?.amount || 0);
        await new Promise((resolve, reject) => {
          Wallet.addTopUp(user.id, amount, 'nets', (err) => (err ? reject(err) : resolve()));
        });
        delete req.session.pendingWalletTopup;
        req.flash('success', `Wallet topped up by $${amount.toFixed(2)}.`);
        return res.redirect(walletBasePath);
      }
      req.flash('error', resData?.error_message || 'NETS payment not confirmed yet.');
      return res.redirect(walletBasePath);
    } catch (err) {
      console.error('Wallet NETS success error:', err.message);
      req.flash('error', 'Unable to confirm NETS top up. Please try again.');
      return res.redirect(walletBasePath);
    }
  },

  async netsFail(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'user') {
      req.flash('error', 'Access denied');
      return res.redirect('/userdashboard');
    }
    const reason = req.query && req.query.reason ? String(req.query.reason) : '';
    if (reason === 'cancel') {
      req.flash('error', 'NETS top up cancelled. Generate a new QR to try again.');
    } else if (reason === 'timeout') {
      req.flash('error', 'NETS QR expired after 5 minutes. Generate a new QR to try again.');
    } else {
      req.flash('error', 'NETS transaction failed or timed out. Please try again.');
    }
    delete req.session.pendingWalletTopup;
    return res.redirect(walletBasePath);
  }
};

module.exports = WalletController;
