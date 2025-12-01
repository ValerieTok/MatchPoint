require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');

const UserController = require('./controllers/UserController');
const ProductController = require('./controllers/ProductController');
const CartController = require('./controllers/CartController');
const OrderController = require('./controllers/OrderController');
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
app.get('/register', UserController.registerPage);
app.post('/register', UserController.registerUser);
app.get('/login', UserController.loginPage);
app.post('/login', UserController.loginUser);
app.get('/logout', UserController.logoutUser);
// Admin user management
app.get('/users', checkAuthenticated, checkAdmin, UserController.listAllUsers);
app.post('/users', checkAuthenticated, checkAdmin, UserController.addUser);
app.post('/users/:id', checkAuthenticated, checkAdmin, UserController.updateUser);
app.get('/users/delete/:id', checkAuthenticated, checkAdmin, UserController.deleteUser);
app.get('/orders', checkAuthenticated, checkAdmin, OrderController.listAllOrders);
app.get('/my-orders', checkAuthenticated, OrderController.userOrders);

// Product routes
app.get('/products', checkAuthenticated, ProductController.listAllProducts);
app.get('/products/:id', checkAuthenticated, ProductController.getProductById);
app.get('/shopping', checkAuthenticated, ProductController.listAllProducts);

// Admin product pages
app.get('/inventory', checkAuthenticated, checkAdmin, ProductController.listAllProducts);
app.get('/addProduct', checkAuthenticated, checkAdmin, ProductController.showAddProductPage);
app.post('/addProduct', checkAuthenticated, checkAdmin, upload.single('image'), (req, res) => ProductController.addProduct(req, res, req.file));
app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, ProductController.showUpdateProductPage);
app.post('/updateProduct/:id', checkAuthenticated, checkAdmin, upload.single('image'), (req, res) => ProductController.updateProduct(req, res, req.file));
app.get('/deleteProduct/:id', checkAuthenticated, checkAdmin, ProductController.deleteProduct);

// Shopping & cart
app.post('/add-to-cart/:id', checkAuthenticated, CartController.addToCart);
app.get('/cart', checkAuthenticated, CartController.showCart);
app.get('/cart/remove/:id', checkAuthenticated, CartController.removeFromCart);
app.post('/cart/update/:id', checkAuthenticated, CartController.updateCartItem);
app.post('/cart/remove/:id', checkAuthenticated, CartController.removeFromCart);
app.get('/checkout', checkAuthenticated, (req, res) => res.redirect('/cart'));
app.post('/checkout', checkAuthenticated, CartController.showCheckoutSummary);
app.post('/checkout/confirm', checkAuthenticated, CartController.confirmCheckout);
app.route('/orders/:id/confirm-delivery')
  .get(checkAuthenticated, OrderController.confirmDelivery)
  .post(checkAuthenticated, OrderController.confirmDelivery);
app.get('/orders/:id/review', checkAuthenticated, OrderController.reviewOrderPage);
app.post('/orders/:id/review', checkAuthenticated, OrderController.submitReview);
app.route('/orders/:id/review/delete')
  .get(checkAuthenticated, checkAdmin, OrderController.deleteReview)
  .post(checkAuthenticated, checkAdmin, OrderController.deleteReview);

// 404 fallback without template
app.use((req, res) => res.status(404).type('text').send('Page not found'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
