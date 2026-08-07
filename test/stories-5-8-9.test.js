const test = require("node:test");
const assert = require("node:assert/strict");
const { createStoryHandlers } = require("../controllers/events.controller");
const { createEmailHandler } = require("../controllers/invites.controller");
const { requireAuth } = require("../middleware/auth");

function response() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function req(params, body = {}, userId = 1) {
  return { params, body, auth: { userId } };
}

function dbError(message) {
  return Object.assign(new Error(message), { sqlMessage: message });
}

test("protected endpoints return 401 without authentication", () => {
  const res = response();
  requireAuth({ get: () => "" }, res, () => assert.fail("middleware must not continue"));
  assert.equal(res.statusCode, 401);
});

test("current host can cancel before start", async () => {
  const handlers = createStoryHandlers({ cancelEvent: async (eventId, userId) => ({ EVENT_ID: eventId, EVENT_STATUS: "CANCELLED", requestedBy: userId }) });
  const res = response();
  await handlers.cancelEvent(req({ eventId: "4" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.event.EVENT_STATUS, "CANCELLED");
});

test("current host can update an event", async () => {
  let args;
  const handlers = createStoryHandlers({ updateEvent: async (...values) => {
    args = values;
    return { EVENT_ID: values[0], EVENT_TITLE: values[2], EVENT_DESCRIPTION: values[3] };
  } });
  const res = response();
  await handlers.updateEvent(req({ eventId: "4" }, {
    eventTitle: " Catan Night ", eventDescription: " Bring snacks ", eventDate: "2026-09-01",
    eventTime: "19:00", eventLocation: " Community Hall "
  }, 7), res);
  assert.deepEqual(args, [4, 7, "Catan Night", "Bring snacks", "2026-09-01", "19:00", "Community Hall", null]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.EVENT_DESCRIPTION, "Bring snacks");
});

test("event update requires title, date, time, and location", async () => {
  const handlers = createStoryHandlers({ updateEvent: async () => assert.fail("database must not be called") });
  const res = response();
  await handlers.updateEvent(req({ eventId: "4" }, { eventTitle: "Catan", eventDate: "2026-09-01", eventLocation: "Hall" }), res);
  assert.equal(res.statusCode, 400);
});

for (const [name, message, status] of [
  ["non-host cannot cancel", "Requesting user is not the current host", 403],
  ["event cannot be cancelled after start", "Event already started", 409],
  ["cancelled event cannot be cancelled again", "Event already cancelled", 409],
  ["missing event cannot be cancelled", "Event not found", 404]
]) test(name, async () => {
  const handlers = createStoryHandlers({ cancelEvent: async () => { throw dbError(message); } });
  const res = response();
  await handlers.cancelEvent(req({ eventId: "4" }), res);
  assert.equal(res.statusCode, status);
});

test("current host can assign a group member", async () => {
  let args;
  const handlers = createStoryHandlers({ changeHost: async (...values) => { args = values; return { EVENT_ID: 4, HOST_ID: values[2] }; } });
  const res = response();
  await handlers.changeHost(req({ eventId: "4" }, { newHostId: 12 }, 7), res);
  assert.deepEqual(args, [4, 7, 12]);
  assert.equal(res.body.event.HOST_ID, 12);
});

for (const [name, message, status] of [
  ["non-host cannot change host", "Requesting user is not the current host", 403],
  ["non-member cannot become host", "New host is not a group member", 403],
  ["missing user cannot become host", "User does not exist", 404],
  ["current host cannot be selected again", "Selected user is already the host", 409],
  ["cancelled event cannot change hosts", "Event is cancelled", 409],
  ["completed event cannot change hosts", "Event is completed", 409],
  ["started event cannot change hosts", "Event already started", 409]
]) test(name, async () => {
  const handlers = createStoryHandlers({ changeHost: async () => { throw dbError(message); } });
  const res = response();
  await handlers.changeHost(req({ eventId: "4" }, { newHostId: 12 }), res);
  assert.equal(res.statusCode, status);
});

function invite(overrides = {}) {
  return { EVENT_ID: 9, EVENT_TITLE: "Catan", EVENT_STATUS: "SCHEDULED", RECIPIENT_EMAIL: "guest@example.com", HOST_NAME: "Host", ...overrides };
}

test("current host can send invitation and records SENT with timestamp", async () => {
  process.env.FRONTEND_BASE_URL = "https://board-night.example";
  const updates = [];
  const database = {
    readInviteForEmail: async () => invite(),
    updateInviteEmailStatus: async (...args) => { updates.push(args); return args[2] === "SENT" ? { EMAIL_SENT_AT: "2026-07-22T12:00:00Z" } : {}; }
  };
  const mailer = {
    invitationDetails: require("../services/email.service").invitationDetails,
    sendInvitationEmail: async (_invite, url) => { assert.equal(url, "https://board-night.example/rsvp.html?event=9&invite=3"); return { messageId: "msg_123" }; }
  };
  const res = response();
  await createEmailHandler(database, mailer)(req({ inviteId: "3" }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(updates.map((item) => item[2]), ["SENDING", "SENT"]);
  assert.equal(res.body.emailSentAt, "2026-07-22T12:00:00Z");
});

test("non-host cannot send invitation", async () => {
  const database = { readInviteForEmail: async () => { throw dbError("Requesting user is not the current host"); } };
  const res = response();
  await createEmailHandler(database, {})(req({ inviteId: "3" }), res);
  assert.equal(res.statusCode, 403);
});

test("missing invitation returns 404", async () => {
  const res = response();
  await createEmailHandler({ readInviteForEmail: async () => null }, {})(req({ inviteId: "3" }), res);
  assert.equal(res.statusCode, 404);
});

test("failed email records FAILED and never exposes credentials", async () => {
  process.env.FRONTEND_BASE_URL = "https://board-night.example";
  process.env.EMAIL_API_KEY = "super-secret-provider-key";
  const updates = [];
  const database = { readInviteForEmail: async () => invite(), updateInviteEmailStatus: async (...args) => { updates.push(args); return {}; } };
  const mailer = { invitationDetails: require("../services/email.service").invitationDetails, sendInvitationEmail: async () => { throw new Error(`Provider rejected ${process.env.EMAIL_API_KEY}`); } };
  const res = response();
  await createEmailHandler(database, mailer)(req({ inviteId: "3" }), res);
  assert.equal(res.statusCode, 502);
  assert.equal(updates.at(-1)[2], "FAILED");
  assert.match(updates.at(-1)[4], /Provider rejected/);
  assert.doesNotMatch(updates.at(-1)[4], /super-secret-provider-key/);
  assert.doesNotMatch(JSON.stringify(res.body), /super-secret-provider-key/);
});

test("invitation email includes an escaped event description when present", async () => {
  const emailService = require("../services/email.service");
  const originalFetch = global.fetch;
  const originalApiKey = process.env.EMAIL_API_KEY;
  const originalFromAddress = process.env.EMAIL_FROM_ADDRESS;
  let requestBody;
  process.env.EMAIL_API_KEY = "test-key";
  process.env.EMAIL_FROM_ADDRESS = "invites@example.com";
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ id: "msg_description" }) };
  };

  try {
    await emailService.sendInvitationEmail(invite({
      EVENT_DESCRIPTION: "Bring <script>alert('x')</script> & snacks."
    }), "https://board-night.example/rsvp?event=9");
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey == null) delete process.env.EMAIL_API_KEY;
    else process.env.EMAIL_API_KEY = originalApiKey;
    if (originalFromAddress == null) delete process.env.EMAIL_FROM_ADDRESS;
    else process.env.EMAIL_FROM_ADDRESS = originalFromAddress;
  }

  assert.match(requestBody.html, /Bring &lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt; &amp; snacks\./);
  assert.doesNotMatch(requestBody.html, /<script>/i);
});
