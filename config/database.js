const mysql = require("mysql2/promise");

function env(name, fallbackName, defaultValue = "") {
  return process.env[name] || process.env[fallbackName] || defaultValue;
}

const dbConfig = {
  host: env("DB_HOST", "dbhost", "127.0.0.1"),
  port: Number(env("DB_PORT", "dbport", 3306)) || 3306,
  user: env("DB_USER", "dbuser", "root"),
  password: env("DB_PASSWORD", "dbpassword"),
  database: env("DB_NAME", "dbname", "board_night_db"),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

module.exports = {
  dbConfig,
  pool
};
