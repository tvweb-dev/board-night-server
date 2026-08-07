const test = require("node:test");
const assert = require("node:assert/strict");
const { favoriteHandlers } = require("../controllers/games.controller");

function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }

test("users cannot replace another user's favorite games", async () => {
  const res = response();
  await favoriteHandlers({}).replace({ params: { userId: "8" }, body: { gameIds: [1] }, auth: { userId: 7 } }, res);
  assert.equal(res.statusCode, 403);
});

test("favorite games are replaced atomically without duplicates", async () => {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push("begin"); }, async commit() { calls.push("commit"); }, release() { calls.push("release"); },
    async query(sql, params) { calls.push([sql, params]); if (sql.startsWith("SELECT GAME_ID")) return [[{ GAME_ID: 1 }, { GAME_ID: 2 }]]; return [{ affectedRows: 1 }]; }
  };
  const res = response();
  await favoriteHandlers({ async getConnection() { return connection; } }).replace({ params: { userId: "7" }, body: { gameIds: [1, 2, 2] }, auth: { userId: 7 } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, [1, 2]);
  assert.deepEqual(calls.filter(Array.isArray).at(-1)[1], [7, 1, 7, 2]);
  assert.deepEqual(calls.slice(-2), ["commit", "release"]);
});
