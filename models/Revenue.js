const Booking = require('./Booking');
const Payout = require('./Payout');

const Revenue = {
  getCoachRevenue(coachId, callback) {
    return Booking.getCoachRevenue(coachId, callback);
  }
  ,getCoachMonthlyRevenue(coachId, callback) {
    return Booking.getCoachMonthlyRevenue(coachId, callback);
  }
  ,getCoachTotalPaid(coachId, callback) {
    return Payout.getTotalPaidForCoach(coachId, callback);
  }
  ,getCoachEarningsHistory(coachId, limit, filters, callback) {
    return Booking.getCoachEarningsHistory(coachId, limit, filters, callback);
  }
};

module.exports = Revenue;
