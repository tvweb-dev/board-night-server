const test = require("node:test");
const assert = require("node:assert/strict");
const { emailDetailsHandler } = require("../controllers/invites.controller");
const { createDatabase } = require("../data/board-night.db");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function request(inviteId, body = {}, userId = 7) {
  return { params: { inviteId }, body, auth: { userId } };
}

test("reads the four invitation email fields", async () => {
  const expected = {
    INVITE_ID: 3, EMAIL_STATUS: "SENT", EMAIL_SENT_AT: "2026-07-28T20:00:00Z",
    EMAIL_MESSAGE_ID: "msg_123", EMAIL_ERROR: null
  };
  const handlers = emailDetailsHandler({
    readInviteEmailStatus: async (inviteId, userId) => {
      assert.deepEqual([inviteId, userId], [3, 7]);
      return expected;
    }
  });
  const res = response();

  await handlers.read(request("3"), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, expected);
});

test("updates the four invitation email fields", async () => {
  const body = {
    emailStatus: "FAILED", emailSentAt: null, emailMessageId: null, emailError: "Mailbox unavailable"
  };
  let received;
  const handlers = emailDetailsHandler({
    updateInviteEmailDetails: async (...args) => {
      received = args;
      return { INVITE_ID: args[0], EMAIL_STATUS: args[2], EMAIL_SENT_AT: args[3], EMAIL_MESSAGE_ID: args[4], EMAIL_ERROR: args[5] };
    }
  });
  const res = response();

  await handlers.update(request("3", body), res);

  assert.deepEqual(received, [3, 7, "FAILED", null, null, "Mailbox unavailable"]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.EMAIL_ERROR, "Mailbox unavailable");
});

test("rejects an unsupported email status", async () => {
  const handlers = emailDetailsHandler({
    updateInviteEmailDetails: async () => assert.fail("database must not be called")
  });
  const res = response();

  await handlers.update(request("3", { emailStatus: "DELIVERED" }), res);

  assert.equal(res.statusCode, 400);
});

test("database calls parameterized read and update procedures", async () => {
  const calls = [];
  const database = createDatabase({
    async query(sql, values) {
      calls.push([sql, values]);
      return [[[{ INVITE_ID: 3, EMAIL_STATUS: "NOT_SENT" }], { affectedRows: 0 }]];
    }
  });

  await database.readInviteEmailStatus(3, 7);
  await database.updateInviteEmailDetails(3, 7, "SENT", "2026-07-28 20:00:00", "msg_1", null);

  assert.deepEqual(calls, [
    ["CALL ReadInviteEmailStatus(?, ?)", [3, 7]],
    ["CALL UpdateInviteEmailDetails(?, ?, ?, ?, ?, ?)", [3, 7, "SENT", "2026-07-28 20:00:00", "msg_1", null]]
  ]);
});
