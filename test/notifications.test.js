const test = require("node:test");
const assert = require("node:assert/strict");
const notificationService = require("../services/notification.service");
const { createNotificationHandlers } = require("../controllers/notifications.controller");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("RSVP notifications go to every group member including the responding user", async () => {
  const inserts = [];
  const db = {
    async query(sql, params) {
      if (sql.includes("FROM event_invites")) return [[{
        EVENT_ID: 8, GROUP_ID: 3, EVENT_TITLE: "Friday Games", USER_ID: 2,
        FIRST_NAME: "Sam", NICKNAME: null, EMAIL: "sam@example.com"
      }]];
      if (sql.includes("FROM group_members")) return [[{ USER_ID: 1 }, { USER_ID: 2 }, { USER_ID: 4 }]];
      if (sql.includes("INSERT INTO notifications")) { inserts.push(params); return [{ affectedRows: 1 }]; }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };

  await notificationService.notifyRsvpChanged(db, { inviteId: 9, actorUserId: 2, rsvpStatus: "MAYBE" });

  assert.deepEqual(inserts.map((params) => params[0]), [1, 2, 4]);
  assert.equal(inserts[1][3], "You are maybe going to Friday Games.");
  assert.equal(inserts[0][3], "Sam is maybe going to Friday Games.");
});

test("notification list is scoped to the authenticated user and can filter unread", async () => {
  let captured;
  const handlers = createNotificationHandlers({
    async query(sql, params) { captured = { sql, params }; return [[{ NOTIFICATION_ID: 5 }]]; }
  });
  const res = response();

  await handlers.list({ auth: { userId: 7 }, query: { unread: "true" } }, res);

  assert.deepEqual(captured.params, [7]);
  assert.match(captured.sql, /USER_ID = \? AND IS_READ = 0/);
  assert.deepEqual(res.body.data, [{ NOTIFICATION_ID: 5 }]);
});

test("a user cannot mark another user's notification read", async () => {
  const handlers = createNotificationHandlers({ async query() { return [{ affectedRows: 0 }]; } });
  const res = response();

  await handlers.markRead({ params: { notificationId: "12" }, auth: { userId: 7 } }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.success, false);
});
