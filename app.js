require("dotenv").config();

const cors = require("cors");
const express = require("express");
const { dbConfig, pool } = require("./config/database");

const usersRoutes = require("./routes/users.routes");
const groupsRoutes = require("./routes/groups.routes");
const eventsRoutes = require("./routes/events.routes");
const invitesRoutes = require("./routes/invites.routes");
const profilesRoutes = require("./routes/profiles.routes");
const gamesRoutes = require("./routes/games.routes");

const app = express();

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

app.use("/api/users", usersRoutes);
app.use("/api/groups", groupsRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/invites", invitesRoutes);
app.use("/api/profiles", profilesRoutes);
app.use("/api/games", gamesRoutes);

app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found"
  });
});

module.exports = app;
