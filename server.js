const port = Number(process.env.PORT || process.env.nodeport) || 3000;
const app = require("./app");
const { pool } = require("./config/database");
const { ensureNotificationsSchema } = require("./data/notifications.schema");
const { ensureMediaSchema } = require("./data/media.schema");
const { removePlaceholderUsers } = require("./data/placeholder-users.cleanup");

async function start() {
  await ensureNotificationsSchema(pool);
  await ensureMediaSchema(pool);
  const removedPlaceholderUsers = await removePlaceholderUsers(pool);
  if (removedPlaceholderUsers) console.log(`Removed ${removedPlaceholderUsers} placeholder user account(s)`);
  app.listen(port, () => {
    console.log(`Board Night server listening at http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Unable to initialize Board Night server:", error.message);
  process.exitCode = 1;
});
