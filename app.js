require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');

const AccountController = require('./controllers/AccountController');
const PasswordResetController = require('./controllers/PasswordResetController');
const ListingController = require('./controllers/ListingController');
const BookingCartController = require('./controllers/BookingCartController');
const BookingController = require('./controllers/BookingController');
const { attachUser, checkAuthenticated, checkAdmin } = require('./middleware');

const app = express();

// file upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'images')),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// view engine and middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// in-memory sessions; cart persistence is DB-backed via user_cart_items
const sessionSecret = process.env.SESSION_SECRET || 'dev-secret';
if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET missing from environment; using development fallback.');
}
app.use(session({
  name: 'sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 3600 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
}));
app.use(flash());
app.use(attachUser);

// Home: route admins to inventory, users to shopping, guests see landing
app.get('/', (req, res) => {
  const user = req.session.user;
  if (user && user.role === 'admin') return res.redirect('/inventory');
  if (user && user.role !== 'admin') return res.redirect('/shopping');
  return res.render('index', { user });
});

// User routes
app.get('/register', AccountController.registerPage);
app.post('/register', AccountController.registerUser);
app.get('/login', AccountController.loginPage);
app.post('/login', AccountController.loginUser);
app.get('/login/2fa', AccountController.showTwoFactorLogin);
app.post('/login/2fa', AccountController.verifyTwoFactorLogin);
app.get('/forgot-password', PasswordResetController.forgotPasswordPage);
app.post('/forgot-password', PasswordResetController.requestPasswordReset);
app.get('/logout', AccountController.logoutUser);
app.get('/2fa/setup', checkAuthenticated, AccountController.showTwoFactorSetup);
app.post('/2fa/verify-setup', checkAuthenticated, AccountController.verifyTwoFactorSetup);
app.post('/2fa/disable', checkAuthenticated, AccountController.disableOwnTwoFactor);
app.get('/2fa/disable', checkAuthenticated, (req, res) => res.redirect('/2fa/setup'));
// Admin user management
app.get('/users', checkAuthenticated, checkAdmin, AccountController.listAllUsers);
app.post('/users', checkAuthenticated, checkAdmin, AccountController.addUser);
app.post('/users/:id', checkAuthenticated, checkAdmin, AccountController.updateUser);
app.post('/users/:id/disable-2fa', checkAuthenticated, checkAdmin, AccountController.disableTwoFactor);
app.get('/users/delete/:id', checkAuthenticated, checkAdmin, AccountController.deleteUser);
app.get('/orders', checkAuthenticated, checkAdmin, BookingController.listAllOrders);
app.get('/my-orders', checkAuthenticated, BookingController.userOrders);

// Listing routes
app.get('/products', checkAuthenticated, ListingController.listAllProducts);
app.get('/products/:id', checkAuthenticated, ListingController.getProductById);
app.get('/shopping', checkAuthenticated, ListingController.listAllProducts);

// Admin/coach listing pages
app.get('/inventory', checkAuthenticated, checkAdmin, ListingController.listAllProducts);
app.get('/addProduct', checkAuthenticated, checkAdmin, ListingController.showAddProductPage);
app.post('/addProduct', checkAuthenticated, checkAdmin, upload.single('image'), (req, res) => ListingController.addProduct(req, res, req.file));
app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, ListingController.showUpdateProductPage);
app.post('/updateProduct/:id', checkAuthenticated, checkAdmin, upload.single('image'), (req, res) => ListingController.updateProduct(req, res, req.file));
app.get('/deleteProduct/:id', checkAuthenticated, checkAdmin, ListingController.deleteProduct);

// Booking cart
app.post('/add-to-cart/:id', checkAuthenticated, BookingCartController.addToCart);
app.get('/cart', checkAuthenticated, BookingCartController.showCart);
app.get('/cart/remove/:id', checkAuthenticated, BookingCartController.removeFromCart);
app.post('/cart/update/:id', checkAuthenticated, BookingCartController.updateCartItem);
app.post('/cart/remove/:id', checkAuthenticated, BookingCartController.removeFromCart);
app.get('/checkout', checkAuthenticated, (req, res) => res.redirect('/cart'));
app.post('/checkout', checkAuthenticated, BookingCartController.showCheckoutSummary);
app.post('/checkout/confirm', checkAuthenticated, BookingCartController.confirmCheckout);
app.route('/orders/:id/confirm-delivery')
  .get(checkAuthenticated, BookingController.confirmDelivery)
  .post(checkAuthenticated, BookingController.confirmDelivery);
app.get('/orders/:id/review', checkAuthenticated, BookingController.reviewOrderPage);
app.post('/orders/:id/review', checkAuthenticated, BookingController.submitReview);
app.route('/orders/:id/review/delete')
  .get(checkAuthenticated, checkAdmin, BookingController.deleteReview)
  .post(checkAuthenticated, checkAdmin, BookingController.deleteReview);

// 404 fallback without template
app.use((req, res) => res.status(404).type('text').send('Page not found'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
