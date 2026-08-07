const test = require("node:test");
const assert = require("node:assert/strict");
const { CREATE_NOTIFICATIONS_TABLE, ensureNotificationsSchema } = require("../data/notifications.schema");

test("notification schema setup is idempotent", async () => {
  let statement;
  await ensureNotificationsSchema({ async query(sql) { statement = sql; } });
  assert.equal(statement, CREATE_NOTIFICATIONS_TABLE);
  assert.match(statement, /CREATE TABLE IF NOT EXISTS notifications/i);
});
