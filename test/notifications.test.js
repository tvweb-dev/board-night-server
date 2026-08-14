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

test("a user can accept their own group invitation", async () => {
  const calls = [];
  const db = {
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes("FROM notifications n")) return [[{ GROUP_ID: 4, CREATED_BY: 2 }]];
      return [{ affectedRows: 1 }];
    }
  };
  const handlers = createNotificationHandlers(db);
  const result = response();
  await handlers.respondToGroupInvitation({ params: { notificationId: "12" }, body: { decision: "JOIN" }, auth: { userId: 7 } }, result);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.DECISION, "JOIN");
  assert.deepEqual(calls.find(([sql]) => sql.includes("UPDATE group_members SET MEMBER_ROLE"))[1], [4, 7]);
  assert.equal(calls.some(([sql]) => sql.includes("DELETE FROM group_members")), false);
});

test("declining a group invitation removes only the invited user's membership and event invitations", async () => {
  const calls = [];
  const db = {
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes("FROM notifications n")) return [[{ GROUP_ID: 4, CREATED_BY: 2 }]];
      return [{ affectedRows: 1 }];
    }
  };
  const handlers = createNotificationHandlers(db);
  const result = response();
  await handlers.respondToGroupInvitation({ params: { notificationId: "12" }, body: { decision: "DECLINE" }, auth: { userId: 7 } }, result);
  assert.equal(result.statusCode, 200);
  assert.match(calls.find(([sql]) => sql.includes("DELETE FROM group_members"))[0], /MEMBER_ROLE = 'PENDING'/);
  assert.deepEqual(calls.find(([sql]) => sql.includes("DELETE FROM group_members"))[1], [4, 7]);
  assert.deepEqual(calls.find(([sql]) => sql.includes("DELETE ei FROM event_invites"))[1], [4, 7]);
});
