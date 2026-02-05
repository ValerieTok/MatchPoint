const Payout = require('../models/Payout');
const Revenue = require('../models/Revenue');
const paypalPayouts = require('../services/paypalPayouts');
const Account = require('../models/Account');
const aml = require('../services/aml');

const getCoachBalance = (coachId) =>
  new Promise((resolve, reject) => {
    Revenue.getCoachRevenue(coachId, (err, revenue) => {
      if (err) return reject(err);
      Payout.getTotalPaidForCoach(coachId, (paidErr, totalPaid) => {
        if (paidErr) return reject(paidErr);
        const earned = Number(revenue && revenue.totalEarned ? revenue.totalEarned : 0);
        const paid = Number(totalPaid || 0);
        resolve({ earned, paid, available: Math.max(0, earned - paid) });
      });
    });
  });

module.exports = {
  async requestPayout(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'coach') {
      req.flash('error', 'Access denied');
      return res.redirect('/trackRevenue');
    }
    const amount = Number(req.body && req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      req.flash('error', 'Enter a valid payout amount.');
      return res.redirect('/trackRevenue');
    }
    try {
      const capCheck = await aml.enforceNewAccountCap(user.id, 'payout', amount);
      if (!capCheck.ok) {
        req.flash('error', `New accounts are limited to $${Number(capCheck.cap).toFixed(2)} payouts.`);
        return res.redirect('/trackRevenue');
      }
      const coach = await new Promise((resolve, reject) => {
        Account.getUserById(user.id, (err, row) => (err ? reject(err) : resolve(row)));
      });
      const paypalEmail = coach && coach.payout_email ? String(coach.payout_email).trim() : '';
      if (!paypalEmail) {
        req.flash('error', 'Please add your PayPal email in your profile before requesting a payout.');
        return res.redirect('/trackRevenue');
      }
      const balance = await getCoachBalance(user.id);
      if (amount > balance.available) {
        req.flash('error', 'Payout amount exceeds available balance.');
        return res.redirect('/trackRevenue');
      }
      const requestResult = await new Promise((resolve, reject) => {
        Payout.createRequest({
          coach_id: user.id,
          amount,
          currency: 'SGD',
          paypal_email: paypalEmail
        }, (err, result) => (err ? reject(err) : resolve(result)));
      });
      await aml.maybeFlagHighValue({
        user_id: user.id,
        alert_type: 'payout',
        reference_type: 'payout_request',
        reference_id: requestResult && requestResult.insertId ? requestResult.insertId : null,
        amount,
        currency: 'SGD',
        reason: 'Payout request'
      });
      req.flash('success', 'Payout request submitted.');
      return res.redirect('/trackRevenue');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to submit payout request.');
      return res.redirect('/trackRevenue');
    }
  },

  async adminList(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'admin') {
      req.flash('error', 'Access denied');
      return res.redirect('/admindashboard');
    }
    const status = req.query && req.query.status ? String(req.query.status).trim().toLowerCase() : '';
    try {
      const rows = await new Promise((resolve, reject) => {
        Payout.listRequests({ status }, (err, data) => (err ? reject(err) : resolve(data)));
      });
      return res.render('adminPayouts', {
        user,
        requests: rows,
        filters: { status },
        messages: res.locals.messages
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Unable to load payouts.');
      return res.redirect('/admindashboard');
    }
  },

  async adminApprove(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'admin') {
      req.flash('error', 'Access denied');
      return res.redirect('/admindashboard');
    }
    const requestId = parseInt(req.params.id, 10);
    if (!Number.isFinite(requestId)) {
      req.flash('error', 'Invalid payout request.');
      return res.redirect('/adminpayouts');
    }
    try {
      const request = await new Promise((resolve, reject) => {
        Payout.getRequestById(requestId, (err, row) => (err ? reject(err) : resolve(row)));
      });
      if (!request || request.status !== 'requested') {
        req.flash('error', 'Payout request is not available for approval.');
        return res.redirect('/adminpayouts');
      }
      if (!request.paypal_email) {
        req.flash('error', 'Coach has no PayPal email set.');
        return res.redirect('/adminpayouts');
      }

      const balance = await getCoachBalance(request.coach_id);
      if (Number(request.amount || 0) > balance.available) {
        req.flash('error', 'Payout exceeds available balance.');
        return res.redirect('/adminpayouts');
      }

      await new Promise((resolve, reject) => {
        Payout.approveRequest(requestId, user.id, (err, result) => (err ? reject(err) : resolve(result)));
      });

      const senderBatchId = `MP-${requestId}-${Date.now()}`;
      const senderItemId = `MP-REQ-${requestId}`;
      const payout = await paypalPayouts.createPayout({
        amount: Number(request.amount).toFixed(2),
        currency: request.currency || 'SGD',
        receiver: request.paypal_email,
        note: 'MatchPoint coach payout',
        senderBatchId,
        senderItemId
      });

      const batchId = payout && payout.batch_header ? payout.batch_header.payout_batch_id : null;
      const itemId = payout && payout.items && payout.items[0] ? payout.items[0].payout_item_id : null;
      const batchStatus = payout && payout.batch_header ? payout.batch_header.batch_status : 'PENDING';
      const normalizedStatus = batchStatus === 'SUCCESS' ? 'success' : 'processing';

      await new Promise((resolve, reject) => {
        Payout.markRequestStatus(requestId, normalizedStatus, {
          payout_batch_id: batchId,
          payout_item_id: itemId
        }, (err) => (err ? reject(err) : resolve()));
      });

      await new Promise((resolve, reject) => {
        Payout.createPayoutRecord({
          request_id: requestId,
          coach_id: request.coach_id,
          amount: request.amount,
          currency: request.currency || 'SGD',
          payout_batch_id: batchId,
          payout_item_id: itemId,
          payout_status: batchStatus || 'PENDING',
          raw_response: JSON.stringify(payout || {})
        }, (err) => (err ? reject(err) : resolve()));
      });

      req.flash('success', 'Payout approved and submitted.');
      return res.redirect('/adminpayouts');
    } catch (err) {
      console.error(err);
      const message = err && err.message ? err.message : 'Failed to approve payout.';
      const detail = err && err.response && err.response.data ? JSON.stringify(err.response.data) : '';
      await new Promise((resolve) => {
        Payout.markRequestStatus(requestId, 'failed', { failure_reason: detail || message }, () => resolve());
      });
      req.flash('error', detail || message || 'Failed to approve payout.');
      return res.redirect('/adminpayouts');
    }
  }
  ,
  async adminRefresh(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'admin') {
      req.flash('error', 'Access denied');
      return res.redirect('/admindashboard');
    }
    const requestId = parseInt(req.params.id, 10);
    if (!Number.isFinite(requestId)) {
      req.flash('error', 'Invalid payout request.');
      return res.redirect('/adminpayouts');
    }
    try {
      const request = await new Promise((resolve, reject) => {
        Payout.getRequestById(requestId, (err, row) => (err ? reject(err) : resolve(row)));
      });
      if (!request || !request.payout_batch_id) {
        req.flash('error', 'Payout batch not found.');
        return res.redirect('/adminpayouts');
      }
      const payoutRecord = await new Promise((resolve, reject) => {
        Payout.getLatestPayoutByRequest(requestId, (err, row) => (err ? reject(err) : resolve(row)));
      });
      const batch = await paypalPayouts.getPayoutBatch(request.payout_batch_id);
      const batchStatus = batch && batch.batch_header ? batch.batch_header.batch_status : 'PENDING';
      const normalizedStatus = batchStatus === 'SUCCESS' || batchStatus === 'COMPLETED'
        ? 'success'
        : batchStatus === 'FAILED' || batchStatus === 'CANCELED'
          ? 'failed'
          : 'processing';

      await new Promise((resolve, reject) => {
        Payout.markRequestStatus(requestId, normalizedStatus, {
          payout_batch_id: request.payout_batch_id,
          payout_item_id: request.payout_item_id
        }, (err) => (err ? reject(err) : resolve()));
      });
      if (payoutRecord) {
        await new Promise((resolve, reject) => {
          Payout.updatePayoutStatus(
            payoutRecord.id,
            batchStatus || 'PENDING',
            JSON.stringify(batch || {}),
            (err) => (err ? reject(err) : resolve())
          );
        });
      }
      req.flash('success', `Payout status refreshed: ${batchStatus || 'PENDING'}.`);
      return res.redirect('/adminpayouts');
    } catch (err) {
      console.error(err);
      const detail = err && err.response && err.response.data ? JSON.stringify(err.response.data) : '';
      req.flash('error', detail || 'Failed to refresh payout status.');
      return res.redirect('/adminpayouts');
    }
  }
};
