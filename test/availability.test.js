const test = require("node:test");
const assert = require("node:assert/strict");
const { ensureAvailabilitySchema } = require("../data/availability.schema");
const { availabilityHandlers } = require("../controllers/availability.controller");

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("availability schema permits one schedule per user and date", async () => {
  let statement;
  await ensureAvailabilitySchema({ async query(sql) { statement = sql; } });
  assert.match(statement, /UNIQUE KEY UQ_USER_AVAILABILITY_DATE \(USER_ID, AVAILABILITY_DATE\)/);
  assert.match(statement, /'AVAILABLE', 'UNAVAILABLE', 'LIMITED'/);
});

test("availability feed includes only the current user and shared-group friends", async () => {
  let call;
  const handlers = availabilityHandlers({ async query(sql, values) { call = [sql, values]; return [[]]; } });
  const res = response();

  await handlers.list({ auth: { userId: 7 }, query: { start: "2026-08-01", end: "2026-08-31" } }, res);

  assert.match(call[0], /ua\.USER_ID = \? OR EXISTS/);
  assert.match(call[0], /mine\.USER_ID = \? AND theirs\.USER_ID = ua\.USER_ID/);
  assert.deepEqual(call[1], ["2026-08-01", "2026-08-31", 7, 7]);
});

test("limited availability requires an ordered start and end time", async () => {
  const handlers = availabilityHandlers({ async query() { assert.fail("database must not be called"); } });
  const res = response();

  await handlers.save({ auth: { userId: 7 }, params: { date: "2026-08-12" }, body: { status: "limited", startTime: "18:00", endTime: "17:00", note: "Appointment" } }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /start and end time/);
});

test("available schedule saves a note under the authenticated user", async () => {
  const calls = [];
  const handlers = availabilityHandlers({ async query(sql, values) {
    calls.push([sql, values]);
    if (sql.startsWith("SELECT")) return [[{ AVAILABILITY_ID: 4, USER_ID: 7 }]];
    return [{ affectedRows: 1 }];
  } });
  const res = response();

  await handlers.save({ auth: { userId: 7 }, params: { date: "2026-08-12" }, body: { status: "available", note: "Free after work" } }, res);

  assert.deepEqual(calls[0][1], [7, "2026-08-12", "AVAILABLE", null, null, "Free after work"]);
  assert.equal(res.body.data.USER_ID, 7);
});
