const port = Number(process.env.PORT || process.env.nodeport) || 3000;
const app = require("./app");
const { pool } = require("./config/database");
const { ensureNotificationsSchema } = require("./data/notifications.schema");

async function start() {
  await ensureNotificationsSchema(pool);
  app.listen(port, () => {
    console.log(`Board Night server listening at http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Unable to initialize Board Night server:", error.message);
  process.exitCode = 1;
});
