const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeImageUrl } = require("../utils/image-url");
const { ensureMediaSchema } = require("../data/media.schema");
const { createDatabase } = require("../data/board-night.db");
const { updateGroupImageHandler } = require("../controllers/groups.controller");

function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }

test("event and group image URLs accept HTTP(S) and reject unsafe protocols", () => {
  assert.equal(normalizeImageUrl(" https://example.com/game.jpg ", "image"), "https://example.com/game.jpg");
  assert.equal(normalizeImageUrl("", "image"), null);
  assert.throws(() => normalizeImageUrl("javascript:alert(1)", "image"), /HTTP\(S\)/);
});

test("media schema adds both image columns when missing", async () => {
  const statements = [];
  await ensureMediaSchema({ async query(sql, params) { statements.push([sql, params]); return sql.includes("information_schema") ? [[]] : [{ affectedRows: 0 }]; } });
  assert.match(statements[1][0], /EVENT_IMAGE_URL/);
  assert.match(statements[3][0], /GROUP_IMAGE_URL/);
});

test("event image updates remain scoped to the authenticated host", async () => {
  const calls = [];
  const database = createDatabase({ async query(sql, params) { calls.push([sql, params]); return sql.startsWith("UPDATE") ? [{ affectedRows: 1 }] : [[{ EVENT_ID: 4 }]]; } });
  await database.updateEvent(4, 7, "Game", null, "2026-09-01", "19:00", "Hall", "https://example.com/event.jpg");
  assert.match(calls[0][0], /EVENT_IMAGE_URL = \?/);
  assert.match(calls[0][0], /HOST_ID = \?/);
  assert.deepEqual(calls[0][1].slice(-3), ["https://example.com/event.jpg", 4, 7]);
});

test("only the group creator can update a group image", async () => {
  let params;
  const handler = updateGroupImageHandler({ async query(_sql, values) { params = values; return [{ affectedRows: 0 }]; } });
  const res = response();
  await handler({ params: { groupId: "3" }, body: { groupImageUrl: "https://example.com/group.jpg" }, auth: { userId: 8 } }, res);
  assert.deepEqual(params, ["https://example.com/group.jpg", 3, 8]);
  assert.equal(res.statusCode, 403);
});
