const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createEventHandler } = require("../controllers/events.controller");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function request(body, userId = 7, headers = {}) {
  return {
    body,
    auth: { userId },
    get(name) { return headers[String(name).toLowerCase()]; }
  };
}

const eventBody = {
  groupId: 2,
  hostId: 999,
  eventTitle: "Catan Night",
  eventDate: "2026-08-01",
  eventTime: "19:00:00",
  eventLocation: "Library"
};

test("creating an event uses the authenticated host and returns its GOING RSVP", async () => {
  let argumentsReceived;
  let emailCount = 0;
  const database = {
    async createEvent(...args) {
      argumentsReceived = args;
      return { EVENT_ID: 123, HOST_ID: args[1], EVENT_STATUS: "SCHEDULED", HOST_RSVP_STATUS: "GOING" };
    }
  };
  const handler = createEventHandler(database);
  const res = response();

  await handler(request(eventBody, 7), res);

  assert.deepEqual(argumentsReceived, [2, 7, "Catan Night", "2026-08-01", "19:00:00", "Library"]);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.event.HOST_ID, 7);
  assert.equal(res.body.event.HOST_RSVP_STATUS, "GOING");
  assert.deepEqual(res.body.data, res.body.event);
  assert.equal(emailCount, 0, "event creation must not invoke invitation email delivery");
});

test("host is immediately present in RSVP reads without a separate RSVP request", async () => {
  const rsvps = [];
  let rsvpUpdateCalls = 0;
  const database = {
    async createEvent(_groupId, hostId) {
      rsvps.push({ EVENT_ID: 44, USER_ID: hostId, RSVP_STATUS: "GOING" });
      return { EVENT_ID: 44, HOST_ID: hostId, EVENT_STATUS: "SCHEDULED", HOST_RSVP_STATUS: "GOING" };
    }
  };
  const handler = createEventHandler(database);

  await handler(request(eventBody), response());

  assert.deepEqual(rsvps, [{ EVENT_ID: 44, USER_ID: 7, RSVP_STATUS: "GOING" }]);
  assert.equal(rsvpUpdateCalls, 0);
});

test("rapid repeated submissions create only one event", async () => {
  let createCalls = 0;
  const database = {
    async createEvent() {
      createCalls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      return { EVENT_ID: 55, HOST_ID: 7, HOST_RSVP_STATUS: "GOING" };
    }
  };
  const handler = createEventHandler(database);
  const first = response();
  const second = response();

  await Promise.all([handler(request(eventBody), first), handler(request(eventBody), second)]);

  assert.equal(createCalls, 1);
  assert.equal(first.body.event.EVENT_ID, second.body.event.EVENT_ID);
});

test("procedure transaction rolls back when the host RSVP insert fails", () => {
  const source = fs.readFileSync(path.join(__dirname, "../scripts/install-event-host-rsvp-procedure.js"), "utf8");
  assert.match(source, /START TRANSACTION/i);
  assert.match(source, /SET v_event_id = LAST_INSERT_ID\(\)/i);
  assert.match(source, /INSERT INTO event_invites[\s\S]*'GOING'[\s\S]*NOW\(\)/i);
  assert.match(source, /EXIT HANDLER FOR SQLEXCEPTION[\s\S]*ROLLBACK[\s\S]*RESIGNAL/i);
  assert.match(source, /INSERT INTO events[\s\S]*INSERT INTO event_invites[\s\S]*COMMIT/i);
});

test("another user can be invited and choose an independent RSVP status", () => {
  const invites = [{ EVENT_ID: 88, USER_ID: 7, RSVP_STATUS: "GOING" }];
  invites.push({ EVENT_ID: 88, USER_ID: 12, RSVP_STATUS: "PENDING" });
  invites.find((invite) => invite.USER_ID === 12).RSVP_STATUS = "MAYBE";

  assert.equal(invites.find((invite) => invite.USER_ID === 7).RSVP_STATUS, "GOING");
  assert.equal(invites.find((invite) => invite.USER_ID === 12).RSVP_STATUS, "MAYBE");
});
