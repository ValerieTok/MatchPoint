require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');

const AccountController = require('./controllers/AccountController');
const ListingController = require('./controllers/ListingController');
const BookingCartController = require('./controllers/BookingCartController');
const BookingController = require('./controllers/BookingController');
const PaymentController = require('./controllers/PaymentController');
const AdminController = require('./controllers/AdminController');
const CoachProfileController = require('./controllers/CoachProfileController');
const UserProfileController = require('./controllers/UserProfileController');
const FeedbackController = require('./controllers/FeedbackController');
const { attachUser, checkAuthenticated, checkAdmin, checkAdminOrCoach, checkCoachApproved } = require('./middleware');

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

// Home: route admins to inventory, users to shopping, guests see landing
app.get('/', (req, res) => {
  return res.render('index', { user: req.session.user });
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
app.get('/coachRatings', checkAuthenticated, checkAdminOrCoach, BookingController.listCoachRatings);
app.get('/ratingsUser', checkAuthenticated, BookingController.userRatings);

// Listing routes
app.get('/userdashboard', checkAuthenticated, ListingController.listAllProducts);
app.get('/viewcourses', checkAuthenticated, ListingController.listAllProducts);
app.get('/listingDetail/:id', checkAuthenticated, ListingController.getProductById);

// Admin/coach listing pages
app.get('/admindashboard', checkAuthenticated, checkAdmin, AdminController.dashboard);
app.get('/admincoaches', checkAuthenticated, checkAdmin, AdminController.coaches);
app.post('/admincoaches/:id/approve', checkAuthenticated, checkAdmin, AdminController.approveCoach);
app.post('/admincoaches/:id/reject', checkAuthenticated, checkAdmin, AdminController.rejectCoach);
app.get('/adminstudents', checkAuthenticated, checkAdmin, AdminController.students);
app.get('/adminservices', checkAuthenticated, checkAdmin, AdminController.services);
app.post('/adminservices/:id/toggle', checkAuthenticated, checkAdmin, AdminController.toggleService);
app.get('/adminfeedback', checkAuthenticated, checkAdmin, AdminController.feedback);
app.post('/adminfeedback/:id/approve', checkAuthenticated, checkAdmin, AdminController.approveFeedback);
app.post('/adminfeedback/:id/reject', checkAuthenticated, checkAdmin, AdminController.rejectFeedback);
app.get('/listingsManage', checkAuthenticated, checkCoachApproved, checkAdminOrCoach, ListingController.listAllProducts);
app.get('/addListing', checkAuthenticated, checkCoachApproved, checkAdminOrCoach, ListingController.showAddProductPage);
app.get('/updateListing/:id', checkAuthenticated, checkCoachApproved, checkAdminOrCoach, ListingController.showUpdateProductPage);
app.post('/addListing', checkAuthenticated, checkCoachApproved, checkAdminOrCoach, upload.single('image'), (req, res) => ListingController.addProduct(req, res, req.file));
app.post('/updateListing/:id', checkAuthenticated, checkCoachApproved, checkAdminOrCoach, upload.single('image'), (req, res) => ListingController.updateProduct(req, res, req.file));
app.post('/listingsManage/delete/:id', checkAuthenticated, checkCoachApproved, checkAdminOrCoach, ListingController.deleteProduct);

// Booking cart
app.get('/bookingCart', checkAuthenticated, BookingCartController.showCart);
app.post('/listingDetail/add-to-cart/:id', checkAuthenticated, BookingCartController.addToCart);
app.post('/userdashboard/add-to-cart/:id', checkAuthenticated, BookingCartController.addToCart);
app.post('/bookingCart/update/:id', checkAuthenticated, BookingCartController.updateCartItem);
app.post('/bookingCart/remove/:id', checkAuthenticated, BookingCartController.removeFromCart);
app.post('/bookingCheckout', checkAuthenticated, BookingCartController.showCheckoutSummary);
app.post('/bookingCheckout/confirm', checkAuthenticated, BookingCartController.confirmCheckout);

// Payment routes
app.get('/payment', checkAuthenticated, PaymentController.showPaymentPage);
app.post('/payment/confirm', checkAuthenticated, PaymentController.confirmPayment);

app.post('/bookingsManage/:id/review/delete', checkAuthenticated, checkAdmin, BookingController.deleteReview);
app.post('/bookingsManage/:id/status', checkAuthenticated, checkAdminOrCoach, BookingController.updateStatus);
app.post('/bookingsUser/:id/confirm-delivery', checkAuthenticated, BookingController.confirmDelivery);
app.get('/coachProfile', checkAuthenticated, checkAdminOrCoach, CoachProfileController.showProfile);
app.post('/coachProfile', checkAuthenticated, checkAdminOrCoach, CoachProfileController.updateProfile);
app.post('/coachProfile/password', checkAuthenticated, checkAdminOrCoach, CoachProfileController.updatePassword);
app.post('/coachProfile/certification', checkAuthenticated, checkAdminOrCoach, uploadCert.single('cert_file'), CoachProfileController.updateCertification);
app.post('/coachProfile/photo', checkAuthenticated, checkAdminOrCoach, upload.single('photo'), CoachProfileController.updatePhoto);
app.get('/profile', checkAuthenticated, UserProfileController.showProfile);
app.post('/profile', checkAuthenticated, UserProfileController.updateProfile);
app.post('/profile/password', checkAuthenticated, UserProfileController.updatePassword);
app.post('/profile/photo', checkAuthenticated, upload.single('photo'), UserProfileController.updatePhoto);

// Feedback routes
app.get('/feedback', checkAuthenticated, FeedbackController.showFeedbackForm);
app.post('/feedback', checkAuthenticated, FeedbackController.submitFeedback);

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

