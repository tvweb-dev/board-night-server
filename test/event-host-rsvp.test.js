const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createEventHandler, readGroupEventsHandler, unwrapProcedureResult } = require("../controllers/events.controller");
const { createDatabase } = require("../data/board-night.db");

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
  eventDescription: "  Bring a strategy game.  ",
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
      return { EVENT_ID: 123, HOST_ID: args[1], EVENT_TITLE: args[2], EVENT_DESCRIPTION: args[3], EVENT_STATUS: "ACTIVE", HOST_RSVP_STATUS: "GOING" };
    }
  };
  const handler = createEventHandler(database);
  const res = response();

  await handler(request(eventBody, 7), res);

  assert.deepEqual(argumentsReceived, [2, 7, "Catan Night", "Bring a strategy game.", "2026-08-01", "19:00:00", "Library"]);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.event.HOST_ID, 7);
  assert.equal(res.body.event.HOST_RSVP_STATUS, "GOING");
  assert.equal(res.body.event.EVENT_DESCRIPTION, "Bring a strategy game.");
  assert.equal(res.body.event.EVENT_STATUS, "ACTIVE");
  assert.deepEqual(res.body.data, res.body.event);
  assert.equal(emailCount, 0, "event creation must not invoke invitation email delivery");
});

for (const [name, description] of [
  ["omitted", undefined],
  ["null", null],
  ["blank", "   "]
]) test(`description may be ${name} and is stored as null`, async () => {
  let descriptionReceived = "not-called";
  const database = {
    async createEvent(_groupId, _hostId, _title, normalizedDescription) {
      descriptionReceived = normalizedDescription;
      return { EVENT_ID: 124, EVENT_DESCRIPTION: normalizedDescription, EVENT_STATUS: "ACTIVE", HOST_RSVP_STATUS: "GOING" };
    }
  };
  const handler = createEventHandler(database);
  const body = { ...eventBody };
  if (description === undefined) delete body.eventDescription;
  else body.eventDescription = description;
  const res = response();

  await handler(request(body), res);

  assert.equal(res.statusCode, 201);
  assert.equal(descriptionReceived, null);
  assert.equal(res.body.event.EVENT_DESCRIPTION, null);
});

test("description longer than 2000 characters returns HTTP 400", async () => {
  let createCalls = 0;
  const handler = createEventHandler({ createEvent: async () => { createCalls += 1; } });
  const res = response();

  await handler(request({ ...eventBody, eventDescription: "x".repeat(2001) }), res);

  assert.equal(res.statusCode, 400);
  assert.equal(createCalls, 0);
});

test("title, date, and time remain required", async () => {
  const handler = createEventHandler({ createEvent: async () => assert.fail("database must not be called") });
  for (const field of ["eventTitle", "eventDate", "eventTime"]) {
    const body = { ...eventBody, [field]: "" };
    const res = response();
    await handler(request(body), res);
    assert.equal(res.statusCode, 400);
  }
});

test("database uses the seven-argument parameterized CreateEvent call and normalizes mysql2 rows", async () => {
  let query;
  let parameters;
  const database = createDatabase({
    async query(sql, values) {
      query = sql;
      parameters = values;
      return [[[{ EVENT_ID: 10, EVENT_DESCRIPTION: "Description", EVENT_STATUS: "ACTIVE", HOST_RSVP_STATUS: "GOING" }], { affectedRows: 0 }]];
    }
  });

  const event = await database.createEvent(1, 7, "Title", "Description", "2026-08-14", "19:00", "Address");

  assert.equal(query, "CALL CreateEvent(?, ?, ?, ?, ?, ?, ?)");
  assert.deepEqual(parameters, [1, 7, "Title", "Description", "2026-08-14", "19:00", "Address"]);
  assert.equal(event.EVENT_DESCRIPTION, "Description");
});

test("event-reading result normalization preserves EVENT_DESCRIPTION", () => {
  const rows = [[{ EVENT_ID: 10, EVENT_DESCRIPTION: "Bring a game." }], { affectedRows: 0 }];
  assert.deepEqual(unwrapProcedureResult(rows), [{ EVENT_ID: 10, EVENT_DESCRIPTION: "Bring a game." }]);
});

test("group event API returns EVENT_DESCRIPTION", async () => {
  const handler = readGroupEventsHandler({
    async readGroupEvents(groupId) {
      assert.equal(groupId, "2");
      return [{ EVENT_ID: 10, EVENT_DESCRIPTION: "Bring a game." }];
    }
  });
  const res = response();

  await handler({ params: { groupId: "2" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0].EVENT_DESCRIPTION, "Bring a game.");
});

test("database group-event query includes descriptions without relying on an outdated procedure", async () => {
  let call;
  const database = createDatabase({ async query(sql, values) {
    call = [sql, values];
    return [[{ EVENT_ID: 10, EVENT_DESCRIPTION: "Bring a game." }]];
  } });
  const events = await database.readGroupEvents(2);
  assert.match(call[0], /EVENT_DESCRIPTION/);
  assert.deepEqual(call[1], [2]);
  assert.equal(events[0].EVENT_DESCRIPTION, "Bring a game.");
});

test("database event update is host-scoped and returns the saved row", async () => {
  const calls = [];
  const database = createDatabase({ async query(sql, values) {
    calls.push([sql, values]);
    if (sql.startsWith("UPDATE")) return [{ affectedRows: 1 }];
    return [[{ EVENT_ID: 4, EVENT_TITLE: "Updated" }]];
  } });
  const event = await database.updateEvent(4, 7, "Updated", null, "2026-09-01", "19:00", "Hall");
  assert.match(calls[0][0], /HOST_ID = \?/);
  assert.deepEqual(calls[0][1], ["Updated", null, "2026-09-01", "19:00", "Hall", 4, 7]);
  assert.equal(event.EVENT_TITLE, "Updated");
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
