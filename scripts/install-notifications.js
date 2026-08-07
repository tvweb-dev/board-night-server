require("dotenv").config();
const { pool } = require("../config/database");
const { ensureNotificationsSchema } = require("../data/notifications.schema");

async function install() {
  try {
    await ensureNotificationsSchema(pool);
    console.log("Notifications table installed.");
  } finally {
    await pool.end();
  }
}

install().catch((error) => { console.error(error.message); process.exitCode = 1; });
