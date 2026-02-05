const db = require('../db');

const AmlAlerts = {
  createAlert(data, callback) {
    const sql = `
      INSERT INTO aml_alerts (user_id, alert_type, reference_type, reference_id, amount, currency, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.user_id,
      data.alert_type,
      data.reference_type,
      data.reference_id || null,
      Number(data.amount || 0),
      data.currency || 'SGD',
      data.reason || null
    ];
    db.query(sql, params, (err, result) => callback(err, result));
  }
};

module.exports = AmlAlerts;
