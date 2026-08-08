const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createStoryHandlers, readEventHandler } = require("../controllers/events.controller");
const { createDatabase, withGame } = require("../data/board-night.db");

function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function request(gameId, userId = 7) { return { auth: { userId }, params: { eventId: "4" }, body: { gameId } }; }

test("event detail and event-game routes require authentication", () => {
  const source = fs.readFileSync(path.join(__dirname, "../routes/events.routes.js"), "utf8");
  assert.match(source, /router\.patch\("\/:eventId\/game", requireAuth/);
  assert.match(source, /router\.get\("\/:eventId", requireAuth/);
  assert.ok(source.indexOf('"/:eventId/rsvps"') < source.lastIndexOf('"/:eventId"'));
});

test("event detail returns existing fields with a nested game", async () => {
  const event = withGame({ EVENT_ID: 4, EVENT_TITLE: "Friday", GAME_ID: 1, GAME_NAME: "Catan", GAME_CATEGORY: "Strategy", GAME_RULES_URL: null });
  const res = response();
  await readEventHandler({ async readEvent(id) { assert.equal(id, 4); return event; } })({ params: { eventId: "4" } }, res);
  assert.equal(res.body.data.EVENT_TITLE, "Friday");
  assert.equal(res.body.data.GAME.GAME_NAME, "Catan");
  assert.equal(res.body.data.GAME.RULES_URL, null);
});

test("event detail returns null GAME when no game is selected", async () => {
  const res = response();
  await readEventHandler({ async readEvent() { return withGame({ EVENT_ID: 4, GAME_ID: null }); } })({ params: { eventId: "4" } }, res);
  assert.equal(res.body.data.GAME_ID, null);
  assert.equal(res.body.data.GAME, null);
});

test("host can select, change, and remove an event game", async () => {
  const received = [];
  const handlers = createStoryHandlers({ async setEventGame(eventId, userId, gameId) { received.push([eventId, userId, gameId]); return { EVENT_ID: eventId, GAME_ID: gameId }; } });
  for (const gameId of [1, 2, null]) {
    const res = response();
    await handlers.setEventGame(request(gameId), res);
    assert.equal(res.statusCode, 200);
  }
  assert.deepEqual(received, [[4, 7, 1], [4, 7, 2], [4, 7, null]]);
});

test("invalid event game input is rejected", async () => {
  const res = response();
  await createStoryHandlers({ setEventGame: async () => assert.fail("database must not be called") }).setEventGame(request("bad"), res);
  assert.equal(res.statusCode, 400);
});

for (const [message, status] of [
  ["Event not found", 404],
  ["Game not found", 404],
  ["Requesting user is not the current host", 403],
  ["Event is cancelled or completed", 409],
  ["Event already started", 409]
]) test(`event game update maps ${message}`, async () => {
  const res = response();
  await createStoryHandlers({ async setEventGame() { throw new Error(message); } }).setEventGame(request(1), res);
  assert.equal(res.statusCode, status);
});

test("database enforces host and active-state checks before updating the event game", async () => {
  const calls = [];
  const database = createDatabase({ async query(sql, values) {
    calls.push([sql, values]);
    if (sql.startsWith("SELECT EVENT_ID")) return [[{ EVENT_ID: 4, HOST_ID: 7, EVENT_STATUS: "ACTIVE", HAS_STARTED: 0 }]];
    if (sql.startsWith("SELECT GAME_ID")) return [[{ GAME_ID: 1 }]];
    if (sql.startsWith("UPDATE")) return [{ affectedRows: 1 }];
    if (sql.startsWith("SELECT e.*")) return [[{ EVENT_ID: 4, GAME_ID: 1, GAME_NAME: "Catan" }]];
    return [[]];
  } });
  const event = await database.setEventGame(4, 7, 1);
  assert.match(calls[0][0], /HOST_ID/);
  assert.match(calls[2][0], /HOST_ID = \?/);
  assert.equal(event.GAME.GAME_NAME, "Catan");
});

test("collection event queries use LEFT JOIN and retain optional games", async () => {
  let sql;
  await createDatabase({ async query(statement) { sql = statement; return [[{ EVENT_ID: 4, GAME_ID: null }]]; } }).readGroupEvents(2);
  assert.match(sql, /LEFT JOIN games/);
  assert.match(sql, /e\.GAME_ID/);
});
