require('dotenv').config({ override: true });
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const axios = require('axios');


const AccountController = require('./controllers/AccountController');
const ListingController = require('./controllers/ListingController');
const BookingCartController = require('./controllers/BookingCartController');
const BookingController = require('./controllers/BookingController');
const PaymentController = require('./controllers/PaymentController');
const WalletController = require('./controllers/WalletController');
const AdminController = require('./controllers/AdminController');
const CoachProfileController = require('./controllers/CoachProfileController');
const UserProfileController = require('./controllers/UserProfileController');
const FeedbackController = require('./controllers/FeedbackController');
const RefundController = require('./controllers/RefundController');
const RevenueController = require('./controllers/RevenueController');
const AdminRevenueController = require('./controllers/AdminRevenueController');
const FavoriteController = require('./controllers/FavoriteController');
const SlotController = require('./controllers/SlotController');
const PayoutController = require('./controllers/PayoutController');
const Inbox = require('./models/Inbox');
const activityStore = require('./activityStore');
const { attachUser, getInboxItems, checkAuthenticated, checkAdmin, checkAdminOrCoach, checkCoachApproved } = require('./middleware');
const netsQr = require('./services/nets');
const sessionDateHelper = require('./services/sessionDate');

const app = express();

// file upload config
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const allowedImageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'images')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = allowedImageExts.has(ext) ? ext : '';
    const randomName = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}-${randomName}${safeExt}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedImageTypes.has(file.mimetype)) {
      return cb(new Error('Unsupported image type'));
    }
    return cb(null, true);
  }
});

const allowedCertTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);
const allowedCertExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const certStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'certifications')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = allowedCertExts.has(ext) ? ext : '';
    const randomName = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}-${randomName}${safeExt}`);
  }
});
const uploadCert = multer({
  storage: certStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedCertTypes.has(file.mimetype)) {
      return cb(new Error('Unsupported certification type'));
    }
    return cb(null, true);
  }
});

const registerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'cert_file') {
      return cb(null, path.join(__dirname, 'public', 'certifications'));
    }
    return cb(null, path.join(__dirname, 'public', 'images'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = file.fieldname === 'cert_file' ? allowedCertExts : allowedImageExts;
    const safeExt = allowedExts.has(ext) ? ext : '';
    const randomName = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}-${randomName}${safeExt}`);
  }
});

const registerUpload = multer({
  storage: registerStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isCert = file.fieldname === 'cert_file';
    const allowedTypes = isCert ? allowedCertTypes : allowedImageTypes;
    if (!allowedTypes.has(file.mimetype)) {
      return cb(new Error(isCert ? 'Unsupported certification type' : 'Unsupported image type'));
    }
    return cb(null, true);
  }
});

// view engine and middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.locals.sessionDateHelper = sessionDateHelper;

// in-memory sessions; cart persistence is DB-backed via user_cart_items
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProduction) {
    throw new Error('SESSION_SECRET missing from environment');
  }
  console.warn('SESSION_SECRET missing from environment; using development fallback.');
}
app.use(session({
  name: 'sid',
  secret: sessionSecret || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 3600 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction
  }
}));
app.use(flash());
app.use(attachUser);
app.use((req, res, next) => {
  const user = req.session && req.session.user;
  if (user && user.id) {
    activityStore.markActive(user);
  }
  next();
});
app.use((req, res, next) => {
  const user = req.session && req.session.user;
  const ban = res.locals.activeBan;
  if (!user || !ban || user.role === 'admin') {
    return next();
  }
  const path = req.path || '';
  if (path === '/banned' || path === '/logout') {
    return next();
  }
  if (path.startsWith('/css') || path.startsWith('/images') || path.startsWith('/certifications') || path.startsWith('/js')) {
    return next();
  }
  return res.redirect('/banned');
});

// Home: always start at login
app.get('/', (req, res) => {
  return res.redirect('/login');
});

// User routes
app.get('/register', AccountController.registerPage);
app.post('/register', registerUpload.fields([
  { name: 'cert_file', maxCount: 1 },
  { name: 'profile_photo', maxCount: 1 }
]), AccountController.registerUser);
app.get('/login', AccountController.loginPage);
app.post('/login', AccountController.loginUser);
app.get('/login2FA', AccountController.showTwoFactorLogin);
app.post('/login2FA', AccountController.verifyTwoFactorLogin);
app.post('/logout', AccountController.logoutUser);
app.get('/2FASetup', checkAuthenticated, AccountController.showTwoFactorSetup);
app.post('/2FASetup/verify-setup', checkAuthenticated, AccountController.verifyTwoFactorSetup);
app.post('/2FASetup/disable', checkAuthenticated, AccountController.disableOwnTwoFactor);
// Admin user management
app.get('/accounts', checkAuthenticated, checkAdmin, AccountController.listAllUsers);
app.post('/accounts', checkAuthenticated, checkAdmin, AccountController.addUser);
app.post('/accounts/:id', checkAuthenticated, checkAdmin, AccountController.updateUser);
app.post('/accounts/:id/disable-2fa', checkAuthenticated, checkAdmin, AccountController.disableTwoFactor);
app.post('/accounts/delete/:id', checkAuthenticated, checkAdmin, AccountController.deleteUser);
app.get('/bookingsManage', checkAuthenticated, checkAdminOrCoach, BookingController.listAllOrders);
app.get('/bookingsManage/:id', checkAuthenticated, checkAdmin, BookingController.showOrderDetails);
app.get('/coachRatings', checkAuthenticated, checkAdminOrCoach, BookingController.listCoachRatings);
app.get('/ratingsUser', checkAuthenticated, BookingController.userRatings);
app.post('/refunds/request', checkAuthenticated, RefundController.requestRefund);
app.get('/inbox', checkAuthenticated, (req, res) => {
  const user = req.session && req.session.user;
  if (!user || user.role !== 'user') {
    return res.redirect('/userdashboard');
  }
  return getInboxItems(user, 50)
    .then((result) => {
      return res.render('inbox', {
        user,
        inboxItems: result.items || []
      });
    })
    .catch((err) => {
      console.error('Failed to load inbox:', err);
      req.flash('error', 'Failed to load inbox.');
      return res.redirect('/userdashboard');
    });
});

app.post('/inbox/mark-read', checkAuthenticated, (req, res) => {
  const user = req.session && req.session.user;
  if (!user || (user.role !== 'user' && user.role !== 'coach')) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const itemType = req.body && req.body.itemType ? String(req.body.itemType) : '';
  const itemId = Number(req.body && req.body.itemId);
  const allowedTypes = new Set(['booking', 'review', 'warning']);
  if (!allowedTypes.has(itemType) || !Number.isFinite(itemId)) {
    return res.status(400).json({ error: 'Invalid inbox item' });
  }
  return Inbox.markRead(user.id, itemType, itemId, (err) => {
    if (err) {
      console.error('Failed to mark inbox item as read:', err);
      return res.status(500).json({ error: 'Failed to update inbox' });
    }
    return res.json({ ok: true });
  });
});

app.post('/inbox/delete', checkAuthenticated, (req, res) => {
  const user = req.session && req.session.user;
  if (!user || (user.role !== 'user' && user.role !== 'coach')) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const itemType = req.body && req.body.itemType ? String(req.body.itemType) : '';
  const itemId = Number(req.body && req.body.itemId);
  const allowedTypes = new Set(['booking', 'review', 'warning']);
  if (!allowedTypes.has(itemType) || !Number.isFinite(itemId)) {
    return res.status(400).json({ error: 'Invalid inbox item' });
  }
  return Inbox.deleteItem(user.id, itemType, itemId, (err) => {
    if (err) {
      console.error('Failed to delete inbox item:', err);
      return res.status(500).json({ error: 'Failed to update inbox' });
    }
    return res.json({ ok: true });
  });
});

// Listing routes
app.get('/userdashboard', checkAuthenticated, ListingController.listAllProducts);
app.get('/viewcourses', checkAuthenticated, ListingController.listAllProducts);
app.get('/listingDetail/:id', checkAuthenticated, ListingController.getProductById);
app.get('/wallet', checkAuthenticated, WalletController.showWallet);
app.get('/ewallet', checkAuthenticated, WalletController.showWallet);
app.get('/wallet/nets/qr', checkAuthenticated, WalletController.netsQr);
app.get('/ewallet/nets/qr', checkAuthenticated, WalletController.netsQr);
app.post('/wallet/nets/qr', checkAuthenticated, WalletController.netsQr);
app.post('/ewallet/nets/qr', checkAuthenticated, WalletController.netsQr);
app.get('/wallet/nets/success', checkAuthenticated, WalletController.netsSuccess);
app.get('/ewallet/nets/success', checkAuthenticated, WalletController.netsSuccess);
app.get('/wallet/nets/fail', checkAuthenticated, WalletController.netsFail);
app.get('/ewallet/nets/fail', checkAuthenticated, WalletController.netsFail);
app.get('/favorites', checkAuthenticated, FavoriteController.list);

// Admin/coach listing pages
app.get('/admindashboard', checkAuthenticated, checkAdmin, AdminController.dashboard);
app.get('/admincoaches', checkAuthenticated, checkAdmin, AdminController.coaches);
app.post('/admincoaches/:id/approve', checkAuthenticated, checkAdmin, AdminController.approveCoach);
app.post('/admincoaches/:id/reject', checkAuthenticated, checkAdmin, AdminController.rejectCoach);
app.post('/admincoaches/:id/warn', checkAuthenticated, checkAdmin, AdminController.warnCoach);
app.post('/admincoaches/:id/ban', checkAuthenticated, checkAdmin, AdminController.banCoach);
app.post('/admincoaches/:id/unban', checkAuthenticated, checkAdmin, AdminController.unbanCoach);
app.get('/adminstudents', checkAuthenticated, checkAdmin, AdminController.students);
app.post('/adminstudents/:id/warn', checkAuthenticated, checkAdmin, AdminController.warnStudent);
app.post('/adminstudents/:id/ban', checkAuthenticated, checkAdmin, AdminController.banStudent);
app.post('/adminstudents/:id/unban', checkAuthenticated, checkAdmin, AdminController.unbanStudent);
app.get('/adminservices', checkAuthenticated, checkAdmin, AdminController.services);
app.post('/adminservices/:id/toggle', checkAuthenticated, checkAdmin, AdminController.toggleService);
app.get('/adminfeedback', checkAuthenticated, checkAdmin, AdminController.feedback);
app.post('/adminfeedback/:id/approve', checkAuthenticated, checkAdmin, AdminController.approveFeedback);
app.post('/adminfeedback/:id/reject', checkAuthenticated, checkAdmin, AdminController.rejectFeedback);
app.get('/adminrefunds', checkAuthenticated, checkAdmin, AdminController.refunds);
app.post('/adminrefunds/:id/approve', checkAuthenticated, checkAdmin, AdminController.approveRefund);
app.post('/adminrefunds/:id/reject', checkAuthenticated, checkAdmin, AdminController.rejectRefund);
app.get('/adminpayouts', checkAuthenticated, checkAdmin, PayoutController.adminList);
app.post('/adminpayouts/:id/approve', checkAuthenticated, checkAdmin, PayoutController.adminApprove);
app.post('/adminpayouts/:id/refresh', checkAuthenticated, checkAdmin, PayoutController.adminRefresh);
app.get('/listingsManage', checkAuthenticated, checkCoachApproved, checkAdminOrCoach, ListingController.listAllProducts);
app.get('/addListing', checkAuthenticated, checkCoachApproved, checkAdminOrCoach, ListingController.showAddProductPage);
app.get('/updateListing/:id', checkAuthenticated, checkCoachApproved, checkAdminOrCoach, ListingController.showUpdateProductPage);
app.post('/addListing', checkAuthenticated, checkCoachApproved, checkAdminOrCoach, upload.single('image'), (req, res) => ListingController.addProduct(req, res, req.file));
app.post('/updateListing/:id', checkAuthenticated, checkCoachApproved, checkAdminOrCoach, upload.single('image'), (req, res) => ListingController.updateProduct(req, res, req.file));
app.post('/listingsManage/delete/:id', checkAuthenticated, checkCoachApproved, checkAdminOrCoach, ListingController.deleteProduct);
app.post('/updateListing/:id/slots', checkAuthenticated, checkCoachApproved, checkAdminOrCoach, upload.none(), ListingController.createListingSlot);
app.post('/updateListing/:id/slots/:slotId/delete', checkAuthenticated, checkCoachApproved, checkAdminOrCoach, ListingController.deleteListingSlot);

// Booking cart
app.get('/bookingCart', checkAuthenticated, BookingCartController.showCart);
app.post('/listingDetail/add-to-cart/:id', checkAuthenticated, BookingCartController.addToCart);
app.post('/userdashboard/add-to-cart/:id', checkAuthenticated, BookingCartController.addToCart);
app.post('/bookingCart/update/:id', checkAuthenticated, BookingCartController.updateCartItem);
app.post('/bookingCart/remove/:id', checkAuthenticated, BookingCartController.removeFromCart);

// Payment routes
app.get('/payment', checkAuthenticated, PaymentController.showPaymentPage);
app.post('/payment/confirm', checkAuthenticated, PaymentController.confirmPayment);
app.get('/payment/receipt', checkAuthenticated, PaymentController.showReceipt);
app.get('/payments/receipt/:id', checkAuthenticated, checkAdminOrCoach, PaymentController.showReceiptByBooking);
app.post('/api/paypal/create-order', checkAuthenticated, PaymentController.paypalCreateOrder);
app.post('/api/paypal/capture-order', checkAuthenticated, PaymentController.paypalCaptureOrder);
app.post('/api/stripe/create-checkout-session', checkAuthenticated, PaymentController.stripeCreateCheckoutSession);
app.get('/payment/stripe/success', checkAuthenticated, PaymentController.stripeSuccess);
app.get('/payment/stripe/fail', checkAuthenticated, PaymentController.stripeFail);

app.post('/bookingsManage/:id/review/delete', checkAuthenticated, checkAdmin, BookingController.deleteReview);
app.post('/bookingsManage/:id/status', checkAuthenticated, checkAdminOrCoach, BookingController.updateStatus);
app.post('/bookingsManage/:id/confirm-complete', checkAuthenticated, BookingController.confirmCoachCompletion);
app.post('/bookingsUser/:id/confirm-delivery', checkAuthenticated, BookingController.confirmDelivery);
app.get('/history', checkAuthenticated, BookingController.listHistory);
app.get('/coachProfile', checkAuthenticated, checkAdminOrCoach, CoachProfileController.showProfile);
app.post('/coachProfile', checkAuthenticated, checkAdminOrCoach, CoachProfileController.updateProfile);
app.post('/coachProfile/password', checkAuthenticated, checkAdminOrCoach, CoachProfileController.updatePassword);
app.post('/coachProfile/certification', checkAuthenticated, checkAdminOrCoach, uploadCert.single('cert_file'), CoachProfileController.updateCertification);
app.post('/coachProfile/photo', checkAuthenticated, checkAdminOrCoach, upload.single('photo'), CoachProfileController.updatePhoto);
app.get('/profile', checkAuthenticated, UserProfileController.showProfile);
app.post('/profile', checkAuthenticated, UserProfileController.updateProfile);
app.post('/profile/password', checkAuthenticated, UserProfileController.updatePassword);
app.post('/profile/photo', checkAuthenticated, upload.single('photo'), UserProfileController.updatePhoto);

app.post('/favorite/:id', checkAuthenticated, FavoriteController.toggle);
app.post('/wallet/topup', checkAuthenticated, WalletController.topUp);
app.post('/ewallet/topup', checkAuthenticated, WalletController.topUp);
app.get('/api/wallet', checkAuthenticated, WalletController.getWalletApi);
app.post('/api/wallet/topup', checkAuthenticated, WalletController.topUpApi);
app.post('/api/wallet/paypal/create-order', checkAuthenticated, WalletController.paypalCreateOrder);
app.post('/api/wallet/paypal/capture-order', checkAuthenticated, WalletController.paypalCaptureOrder);
app.post('/api/wallet/stripe/create-checkout-session', checkAuthenticated, WalletController.stripeCreateCheckoutSession);
app.get('/ewallet/stripe/success', checkAuthenticated, WalletController.stripeSuccess);
app.get('/ewallet/stripe/fail', checkAuthenticated, WalletController.stripeFail);

// Coach availability slots
app.get('/slots', checkAuthenticated, checkCoachApproved, checkAdminOrCoach, SlotController.listSlots);

app.get('/banned', checkAuthenticated, (req, res) => {
  const user = req.session && req.session.user;
  if (!user || user.role === 'admin') {
    return res.redirect('/');
  }
  const ban = res.locals.activeBan;
  if (!ban) {
    return res.redirect('/');
  }
  return res.render('banned', { user, ban });
});

// NETS QR Code Payment Integration
app.post('/generateNETSQR', checkAuthenticated, netsQr.generateQrCode);

app.get("/nets-qr/success", checkAuthenticated, PaymentController.netsQrSuccess);
app.get("/nets-qr/fail", checkAuthenticated, PaymentController.netsQrFail);

//Endpoint in your backend which is a Server-Sent Events (SSE) endpoint that allows your frontend (browser) 
//to receive real-time updates about the payment status of a NETS QR transaction.
app.get('/sse/payment-status/:txnRetrievalRef', async (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const txnRetrievalRef = req.params.txnRetrievalRef;
    let pollCount = 0;
    const maxPolls = 60; // 5 minutes if polling every 5s
    let frontendTimeoutStatus = 0;

    const interval = setInterval(async () => {
        pollCount++;

        try {
            // Call the NETS query API
            const response = await axios.post(
                'https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/query',
                { txn_retrieval_ref: txnRetrievalRef, frontend_timeout_status: frontendTimeoutStatus },
                {
                    headers: {
                        'api-key': process.env.API_KEY,
                        'project-id': process.env.PROJECT_ID,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log("Polling response:", response.data);
            // Send the full response to the frontend
            res.write(`data: ${JSON.stringify(response.data)}\n\n`);
        
          const resData = response.data.result.data;

            // Decide when to end polling and close the connection
            //Check if payment is successful
            if (resData.response_code == "00" && resData.txn_status === 1) {
                // Payment success: send a success message
                res.write(`data: ${JSON.stringify({ success: true })}\n\n`);
                clearInterval(interval);
                res.end();
            } else if (frontendTimeoutStatus == 1 && resData && (resData.response_code !== "00" || resData.txn_status === 2)) {
                // Payment failure: send a fail message
                res.write(`data: ${JSON.stringify({ fail: true, ...resData })}\n\n`);
                clearInterval(interval);
                res.end();
            }

        } catch (err) {
            clearInterval(interval);
            res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            res.end();
        }


        // Timeout
        if (pollCount >= maxPolls) {
            clearInterval(interval);
            frontendTimeoutStatus = 1;
            res.write(`data: ${JSON.stringify({ fail: true, error: "Timeout" })}\n\n`);
            res.end();
        }
    }, 5000);

    req.on('close', () => {
        clearInterval(interval);
    });
});





// Feedback routes
app.get('/feedback', checkAuthenticated, FeedbackController.showFeedbackForm);
app.post('/feedback', checkAuthenticated, FeedbackController.submitFeedback);

// Terms and Conditions page
app.get('/terms', (req, res) => {
  return res.render('terms', { user: req.session && req.session.user });
});

// Track Revenue (blank page placeholder)
app.get('/trackRevenue', checkAuthenticated, checkAdminOrCoach, RevenueController.showDashboard);
app.get('/adminRevenue', checkAuthenticated, checkAdmin, AdminRevenueController.showDashboard);
app.get('/adminRevenue/report', checkAuthenticated, checkAdmin, AdminRevenueController.downloadMonthlyReport);
app.get('/adminRevenue/report.pdf', checkAuthenticated, checkAdmin, AdminRevenueController.downloadMonthlyReportPdf);
app.post('/payouts/request', checkAuthenticated, checkCoachApproved, PayoutController.requestPayout);

// upload error handling
app.use((err, req, res, next) => {
  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.message === 'Unsupported image type')) {
    req.flash('error', 'Image upload failed. Use JPG/PNG/WEBP/GIF under 2MB.');
    return res.redirect('back');
  }
  if (err && err.message === 'Unsupported certification type') {
    req.flash('error', 'Certification upload failed. Use JPG/PNG/WEBP/GIF under 2MB.');
    return res.redirect('back');
  }
  return next(err);
});

// 404 fallback without template
app.use((req, res) => res.status(404).type('text').send('Page not found'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));

