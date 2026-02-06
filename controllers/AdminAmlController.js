const AmlAlerts = require('../models/AmlAlerts');
const UserBan = require('../models/UserBan');

const parsePage = (value) => {
  const num = parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : 1;
};

module.exports = {
  async list(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'admin') {
      req.flash('error', 'Access denied');
      return res.redirect('/admindashboard');
    }

    const status = req.query && req.query.status ? String(req.query.status).trim() : 'open';
    const alertType = req.query && req.query.type ? String(req.query.type).trim() : 'all';
    const search = req.query && req.query.search ? String(req.query.search).trim() : '';
    const page = parsePage(req.query && req.query.page);
    const limit = 15;
    const offset = (page - 1) * limit;

    try {
      const [summary, listResult] = await Promise.all([
        new Promise((resolve, reject) => {
          AmlAlerts.getSummary(30, (err, data) => (err ? reject(err) : resolve(data)));
        }),
        new Promise((resolve, reject) => {
          AmlAlerts.listAlerts({ status, alertType, search, limit, offset }, (err, data) =>
            (err ? reject(err) : resolve(data)));
        })
      ]);

      const totalPages = Math.max(1, Math.ceil((listResult.total || 0) / limit));
      const userIds = (listResult.rows || []).map((row) => Number(row.user_id)).filter(Number.isFinite);
      const banMap = await new Promise((resolve) => {
        UserBan.getActiveBans(userIds, (err, map) => {
          if (err) {
            console.error('Failed to load ban status for AML alerts', err);
            return resolve(new Map());
          }
          return resolve(map || new Map());
        });
      });
      const rowsWithBan = (listResult.rows || []).map((row) => {
        const banInfo = banMap.get(Number(row.user_id));
        return {
          ...row,
          is_banned: Boolean(banInfo),
          ban_comment: banInfo ? banInfo.comment : ''
        };
      });

      return res.render('adminAmlAlerts', {
        user,
        alerts: rowsWithBan,
        summary,
        pager: {
          page,
          totalPages,
          total: listResult.total || 0
        },
        filters: { status, alertType, search },
        messages: req.flash(),
        bodyClass: 'admin-page admin-aml'
      });
    } catch (err) {
      console.error('Failed to load AML alerts:', err);
      req.flash('error', 'Unable to load AML alerts.');
      return res.redirect('/admindashboard');
    }
  },

  async banUser(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'admin') {
      req.flash('error', 'Access denied');
      return res.redirect('/admindashboard');
    }
    const targetId = Number(req.body && req.body.user_id);
    const comment = req.body && req.body.comment ? String(req.body.comment).trim() : '';
    if (!Number.isFinite(targetId)) {
      req.flash('error', 'Invalid user.');
      return res.redirect('/adminamlalerts');
    }
    if (!comment) {
      req.flash('error', 'Ban reason is required.');
      return res.redirect('/adminamlalerts');
    }
    try {
      await new Promise((resolve, reject) => {
        UserBan.banUser(targetId, comment, user.id, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'User banned.');
      return res.redirect('/adminamlalerts');
    } catch (err) {
      console.error('Failed to ban user from AML alerts', err);
      req.flash('error', 'Unable to ban user.');
      return res.redirect('/adminamlalerts');
    }
  },

  async unbanUser(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'admin') {
      req.flash('error', 'Access denied');
      return res.redirect('/admindashboard');
    }
    const targetId = Number(req.body && req.body.user_id);
    if (!Number.isFinite(targetId)) {
      req.flash('error', 'Invalid user.');
      return res.redirect('/adminamlalerts');
    }
    try {
      await new Promise((resolve, reject) => {
        UserBan.unbanUser(targetId, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'User unbanned.');
      return res.redirect('/adminamlalerts');
    } catch (err) {
      console.error('Failed to unban user from AML alerts', err);
      req.flash('error', 'Unable to unban user.');
      return res.redirect('/adminamlalerts');
    }
  },

  async review(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'admin') {
      req.flash('error', 'Access denied');
      return res.redirect('/admindashboard');
    }
    const alertId = parseInt(req.params.id, 10);
    if (!Number.isFinite(alertId)) {
      req.flash('error', 'Invalid alert.');
      return res.redirect('/adminamlalerts');
    }
    const note = req.body && req.body.note ? String(req.body.note).trim() : '';

    try {
      await new Promise((resolve, reject) => {
        AmlAlerts.markReviewed(alertId, user.id, note, (err) => (err ? reject(err) : resolve()));
      });
      req.flash('success', 'AML alert marked as reviewed.');
      return res.redirect('/adminamlalerts');
    } catch (err) {
      console.error('Failed to review AML alert:', err);
      req.flash('error', 'Unable to update AML alert.');
      return res.redirect('/adminamlalerts');
    }
  },

  async exportCsv(req, res) {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'admin') {
      req.flash('error', 'Access denied');
      return res.redirect('/admindashboard');
    }
    const days = Number(req.query && req.query.days) || 30;

    try {
      const report = await new Promise((resolve, reject) => {
        AmlAlerts.listAlerts({ status: 'all', alertType: 'all', search: '', limit: 5000, offset: 0, days },
          (err, data) => (err ? reject(err) : resolve(data)));
      });

      const rows = report.rows || [];
      const header = [
        'id', 'created_at', 'user_id', 'username', 'email', 'alert_type', 'reference_type', 'reference_id',
        'amount', 'currency', 'reason', 'status', 'reviewed_by', 'reviewed_at', 'review_note'
      ];

      const lines = [header.join(',')].concat(rows.map((r) => [
        r.id,
        r.created_at,
        r.user_id,
        (r.username || '').replace(/,/g, ' '),
        (r.email || '').replace(/,/g, ' '),
        r.alert_type,
        r.reference_type,
        r.reference_id || '',
        r.amount,
        r.currency,
        (r.reason || '').replace(/,/g, ' '),
        r.status,
        r.reviewed_by || '',
        r.reviewed_at || '',
        (r.review_note || '').replace(/,/g, ' ')
      ].join(',')));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=aml_alerts_last_${days}_days.csv`);
      return res.send(lines.join('\n'));
    } catch (err) {
      console.error('Failed to export AML report:', err);
      req.flash('error', 'Unable to export AML report.');
      return res.redirect('/adminamlalerts');
    }
  }
};
