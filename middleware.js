// Centralized middleware helpers for auth and view locals
const attachUser = (req, res, next) => {
  res.locals.user = req.session && req.session.user;
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error'),
    info: req.flash('info')
  };
  next();
};

const checkAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) return next();
  req.flash('error', 'Please log in');
  return res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  req.flash('error', 'Access denied');
  return res.redirect('/userdashboard');
};

const checkAdminOrCoach = (req, res, next) => {
  if (!req.session || !req.session.user) {
    req.flash('error', 'Please log in');
    return res.redirect('/login');
  }
  if (req.session.user.role === 'admin' || req.session.user.role === 'coach') return next();
  req.flash('error', 'Access denied');
  return res.redirect('/userdashboard');
};

const checkCoachApproved = (req, res, next) => {
  const user = req.session && req.session.user;
  if (!user) return next();
  if (user.role !== 'coach') return next();
  if (user.coach_status === 'approved') return next();
  req.flash('error', 'Your coach account is pending approval. Upload your certification and wait for admin approval.');
  return res.redirect('/coachProfile');
};

module.exports = {
  attachUser,
  checkAuthenticated,
  checkAdmin,
  checkAdminOrCoach,
  checkCoachApproved
};
