const Booking = require('./Booking');

const Revenue = {
  getCoachRevenue(coachId, callback) {
    return Booking.getCoachRevenue(coachId, callback);
  }
  ,getCoachMonthlyRevenue(coachId, callback) {
    return Booking.getCoachMonthlyRevenue(coachId, callback);
  }
};

module.exports = Revenue;
