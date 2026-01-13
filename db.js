const mysql = require('mysql2');
require('dotenv').config(); // Load variables from .env
 
//Database connection details
const useSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {})
});
 
//Connecting to database
db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});
 
module.exports = db;
