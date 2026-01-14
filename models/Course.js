const db = require('../db');

const baseSelect = `
  SELECT
    id,
    coach_name,
    listing_title,
    sport,
    skill_level,
    duration_minutes,
    session_location,
    price,
    rating,
    students_enrolled,
    image,
    is_active
  FROM courses
`;

module.exports = {
  getActiveCourses: function (callback) {
    const sql = `${baseSelect} WHERE is_active = 1 ORDER BY created_at DESC, id DESC`;
    db.query(sql, (err, results) => callback(err, results));
  },

  searchCourses: function (term, callback) {
    const like = `%${term}%`;
    const sql = `
      ${baseSelect}
      WHERE is_active = 1
        AND (listing_title LIKE ? OR coach_name LIKE ? OR sport LIKE ? OR skill_level LIKE ? OR session_location LIKE ?)
      ORDER BY created_at DESC, id DESC
    `;
    const params = [like, like, like, like, like];
    db.query(sql, params, (err, results) => callback(err, results));
  }
};
