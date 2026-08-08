const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createCatalogueHandlers, favoriteHandlers } = require("../controllers/games.controller");

function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }

test("game search is case-insensitive and orders exact, prefix, contains, popularity, then name", async () => {
  let call;
  const handlers = createCatalogueHandlers({ async query(sql, values) { call = [sql, values]; return [[{ GAME_ID: 1, GAME_NAME: "Catan" }]]; } });
  const res = response();
  await handlers.search({ query: { q: "CaTaN" } }, res);
  assert.match(call[0], /LOWER\(g\.GAME_NAME\).*LIKE/);
  assert.match(call[0], /WHEN LOWER\(g\.GAME_NAME\) = LOWER\(\?\) THEN 0/);
  assert.match(call[0], /CONCAT\(LOWER\(\?\), '%'\) THEN 1/);
  assert.match(call[0], /USERS_RATED, 0\) DESC, g\.GAME_NAME ASC/);
  assert.deepEqual(call[1], ["CaTaN", "CaTaN", "CaTaN", 25]);
  assert.equal(res.body.data[0].GAME_ID, 1);
});

test("game search accepts a maximum limit of 50", async () => {
  let values;
  const handlers = createCatalogueHandlers({ async query(_sql, params) { values = params; return [[]]; } });
  await handlers.search({ query: { q: "cat", limit: "50" } }, response());
  assert.equal(values.at(-1), 50);
});

for (const query of [{ q: "" }, { q: "cat", limit: "0" }, { q: "cat", limit: "51" }, { q: "cat", limit: "abc" }]) {
  test(`invalid search input is rejected: ${JSON.stringify(query)}`, async () => {
    const res = response();
    await createCatalogueHandlers({ query: async () => assert.fail("database must not be called") }).search({ query }, res);
    assert.equal(res.statusCode, 400);
  });
}

test("game details preserve nullable rules URLs", async () => {
  const row = { GAME_ID: 1, GAME_NAME: "Catan", RULES_URL: null };
  const res = response();
  await createCatalogueHandlers({ async query(sql, values) { assert.match(sql, /SOURCE_GAME_ID/); assert.deepEqual(values, [1]); return [[row]]; } }).details({ params: { gameId: "1" } }, res);
  assert.deepEqual(res.body.data, row);
});

test("invalid and missing game details return 400 and 404", async () => {
  const invalid = response();
  await createCatalogueHandlers({}).details({ params: { gameId: "x" } }, invalid);
  assert.equal(invalid.statusCode, 400);
  const missing = response();
  await createCatalogueHandlers({ async query() { return [[]]; } }).details({ params: { gameId: "99" } }, missing);
  assert.equal(missing.statusCode, 404);
});

test("public game creation is disabled", () => {
  const res = response();
  createCatalogueHandlers().create({}, res);
  assert.equal(res.statusCode, 403);
});

test("game search and details routes require authentication and precede the ID route", () => {
  const source = fs.readFileSync(path.join(__dirname, "../routes/games.routes.js"), "utf8");
  assert.match(source, /router\.get\("\/search", requireAuth/);
  assert.match(source, /router\.get\("\/:gameId", requireAuth/);
  assert.ok(source.indexOf('"/search"') < source.indexOf('"/:gameId"'));
  assert.ok(source.indexOf('"/favorites') < source.indexOf('"/:gameId"'));
});

test("favorite reads include catalogue display fields", async () => {
  let sql;
  const res = response();
  await favoriteHandlers({ async query(statement) { sql = statement; return [[{ GAME_ID: 1 }]]; } }).read({ params: { userId: "7" } }, res);
  assert.match(sql, /THUMBNAIL_URL/);
  assert.match(sql, /IMAGE_URL/);
  assert.match(sql, /AVERAGE_RATING/);
});

test("authenticated user can add and remove their own favorite", async () => {
  const addDb = { calls: 0, async query() { this.calls += 1; return this.calls === 1 ? [[{ GAME_ID: 1 }]] : [{ affectedRows: 1 }]; } };
  const added = response();
  await favoriteHandlers(addDb).add({ auth: { userId: 7 }, body: { userId: 7, gameId: 1 } }, added);
  assert.equal(added.statusCode, 201);
  const removed = response();
  await favoriteHandlers({ async query() { return [{ affectedRows: 1 }]; } }).remove({ auth: { userId: 7 }, body: { gameId: 1 } }, removed);
  assert.equal(removed.statusCode, 200);
});

test("cross-user favorite add is rejected", async () => {
  const res = response();
  await favoriteHandlers({ async query() { assert.fail("database must not be called"); } }).add({ auth: { userId: 7 }, body: { userId: 8, gameId: 1 } }, res);
  assert.equal(res.statusCode, 403);
});

test("duplicate favorite is 409 and nonexistent game is 404", async () => {
  const duplicateDb = { calls: 0, async query() { this.calls += 1; return this.calls === 1 ? [[{ GAME_ID: 1 }]] : [{ affectedRows: 0 }]; } };
  const duplicate = response();
  await favoriteHandlers(duplicateDb).add({ auth: { userId: 7 }, body: { gameId: 1 } }, duplicate);
  assert.equal(duplicate.statusCode, 409);
  const missing = response();
  await favoriteHandlers({ async query() { return [[]]; } }).add({ auth: { userId: 7 }, body: { gameId: 999 } }, missing);
  assert.equal(missing.statusCode, 404);
});

test("empty favorite replacement remains transactional", async () => {
  const calls = [];
  const connection = { async beginTransaction() { calls.push("begin"); }, async query(sql) { calls.push(sql); return [{ affectedRows: 1 }]; }, async commit() { calls.push("commit"); }, release() { calls.push("release"); } };
  const res = response();
  await favoriteHandlers({ async getConnection() { return connection; } }).replace({ auth: { userId: 7 }, params: { userId: "7" }, body: { gameIds: [] } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(calls.includes("commit"));
  assert.ok(calls.includes("release"));
});
