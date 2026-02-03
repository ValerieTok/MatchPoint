const Booking = require('../models/Booking');
const Refunds = require('../models/Refunds');

const toMoney = (value) => Number(Math.max(0, Number(value || 0)).toFixed(2));

const isItemCompleted = (order, item) => {
  if (!order || !item) return false;
  if (order.completed_at) return true;
  const normalizeDate = (value) => {
    if (!value) return '';
    if (value instanceof Date) {
      const yyyy = value.getFullYear();
      const mm = String(value.getMonth() + 1).padStart(2, '0');
      const dd = String(value.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    const raw = String(value);
    return raw.includes('T') ? raw.split('T')[0] : raw;
  };
  const normalizeTime = (value) => {
    if (!value) return '00:00:00';
    const raw = String(value);
    return raw.length >= 8 ? raw.slice(0, 8) : `${raw}:00`;
  };
  const toLocalTimestamp = (dateStr, timeStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
    const [year, month, day] = parts;
    const t = (timeStr || '00:00:00').split(':').map(Number);
    const [hour, minute, second] = [
      Number.isNaN(t[0]) ? 0 : t[0],
      Number.isNaN(t[1]) ? 0 : t[1],
      Number.isNaN(t[2]) ? 0 : t[2]
    ];
    return new Date(year, month - 1, day, hour, minute, second).getTime();
  };

  const datePart = normalizeDate(item.session_date);
  const timePart = normalizeTime(item.session_time);
  const sessionLocal = toLocalTimestamp(datePart, timePart);
  return sessionLocal !== null && sessionLocal <= Date.now();
};

module.exports = {
  requestRefund(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'user') {
      req.flash('error', 'Access denied');
      return res.redirect('/ratingsUser');
    }
    const bookingId = req.body && req.body.bookingId ? parseInt(req.body.bookingId, 10) : null;
    const bookingItemId = req.body && req.body.bookingItemId ? parseInt(req.body.bookingItemId, 10) : null;
    const reason = req.body && req.body.reason ? String(req.body.reason).trim() : '';

    if (!bookingId || !bookingItemId) {
      req.flash('error', 'Invalid refund request.');
      return res.redirect('/ratingsUser');
    }
    if (!reason) {
      req.flash('error', 'Refund reason is required.');
      return res.redirect('/ratingsUser');
    }

    Booking.getOrderById(bookingId, (orderErr, order) => {
      if (orderErr) {
        console.error('Refund order lookup error:', orderErr);
        req.flash('error', 'Unable to request refund right now.');
        return res.redirect('/ratingsUser');
      }
      if (!order || Number(order.user_id) !== Number(user.id)) {
        req.flash('error', 'Booking not found.');
        return res.redirect('/ratingsUser');
      }
      Booking.getOrderItems(bookingId, null, (itemsErr, items) => {
        if (itemsErr) {
          console.error('Refund items lookup error:', itemsErr);
          req.flash('error', 'Unable to request refund right now.');
          return res.redirect('/ratingsUser');
        }
        const item = (items || []).find((row) => Number(row.booking_item_id) === Number(bookingItemId));
        if (!item) {
          req.flash('error', 'Session not found for this booking.');
          return res.redirect('/ratingsUser');
        }
        if (!isItemCompleted(order, item)) {
          req.flash('error', 'Session must be completed before requesting a refund.');
          return res.redirect('/ratingsUser');
        }
        const total = toMoney(Number(item.price || 0) * Number(item.quantity || 0));
        if (total <= 0) {
          req.flash('error', 'Refund amount is invalid.');
          return res.redirect('/ratingsUser');
        }

        Refunds.requestRefund({
          bookingId,
          bookingItemId,
          userId: user.id,
          requestedAmount: total,
          reason
        }, (refundErr) => {
          if (refundErr) {
            if (refundErr.code === 'REFUND_EXISTS') {
              req.flash('info', 'A refund request already exists for this session.');
              return res.redirect('/ratingsUser');
            }
            if (refundErr.code === 'INVALID_REQUEST') {
              req.flash('error', 'Refund request is invalid.');
              return res.redirect('/ratingsUser');
            }
            console.error('Refund request error:', refundErr);
            req.flash('error', 'Unable to submit refund request.');
            return res.redirect('/ratingsUser');
          }
          req.flash('success', 'Refund request submitted.');
          return res.redirect('/ratingsUser');
        });
      });
    });
  }
};
