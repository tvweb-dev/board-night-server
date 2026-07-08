require("dotenv").config();

const cors = require("cors");
const express = require("express");
const mysql = require("mysql2/promise");

const app = express();
const port = Number(process.env.PORT) || 3000;

const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "board_night_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Board Night server is running",
    database: dbConfig.database
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/db/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT DATABASE() AS databaseName, NOW() AS checkedAt");

    res.json({
      status: "ok",
      database: rows[0].databaseName,
      checkedAt: rows[0].checkedAt
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Could not connect to the database",
      detail: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Board Night server listening at http://localhost:${port}`);
});
