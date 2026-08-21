const test = require("node:test");
const assert = require("node:assert/strict");
const { ensureFriendsSchema } = require("../data/friends.schema");
const { friendsHandlers } = require("../controllers/friends.controller");

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("friends schema stores hidden status per user and friend", async () => {
  const statements = [];
  await ensureFriendsSchema({ async query(sql) { statements.push(sql); } });
  assert.equal(statements.length, 3);
  assert.match(statements[0], /CREATE TABLE IF NOT EXISTS direct_friends/);
  assert.match(statements[0], /PRIMARY KEY \(USER_ID, FRIEND_USER_ID\)/);
  assert.match(statements[1], /CREATE TABLE IF NOT EXISTS hidden_friends/);
  assert.match(statements[2], /CREATE TABLE IF NOT EXISTS friend_notes/);
  assert.match(statements[2], /NOTE VARCHAR\(300\) NOT NULL/);
});

test("friend list derives first shared date and group count in the database", async () => {
  let query;
  const handlers = friendsHandlers({ async query(sql, values) {
    query = [sql, values];
    return [[{ USER_ID: 2, SHARED_GROUP_COUNT: 3, FRIENDS_SINCE: "2026-01-02", IS_HIDDEN: 0 }]];
  } });
  const res = response();

  await handlers.list({ auth: { userId: 1 } }, res);

  assert.match(query[0], /MIN\(GREATEST\(mine\.CREATED_AT, theirs\.CREATED_AT\)\) AS FRIENDS_SINCE/);
  assert.match(query[0], /COUNT\(DISTINCT mine\.GROUP_ID\) AS SHARED_GROUP_COUNT/);
  assert.match(query[0], /FROM direct_friends WHERE USER_ID/);
  assert.match(query[0], /notes\.NOTE AS FRIEND_NOTE/);
  assert.deepEqual(query[1], [1, 1, 1, 1]);
  assert.equal(res.body.data[0].FRIENDS_SINCE, "2026-01-02");
});

test("adding by nickname creates a mutual direct friendship", async () => {
  const calls = [];
  const handlers = friendsHandlers({ async query(sql, values) {
    calls.push([sql, values]);
    if (sql.includes("FROM users u")) return [[{ USER_ID: 7, EMAIL: "sam@example.com", NICKNAME: "MeepleFan" }]];
    return [{ affectedRows: 2 }];
  } });
  const res = response();

  await handlers.add({ auth: { userId: 1 }, body: { friendQuery: "MeepleFan" } }, res);

  assert.equal(res.statusCode, 201);
  assert.match(calls[1][0], /INSERT IGNORE INTO direct_friends/);
  assert.deepEqual(calls[1][1], [1, 7, 7, 1]);
  assert.equal(res.body.data.USER_ID, 7);
  assert.equal(res.body.data.ALREADY_FRIEND, false);
});

test("adding an existing direct friend is idempotent", async () => {
  const handlers = friendsHandlers({ async query(sql) {
    if (sql.includes("FROM users u")) return [[{ USER_ID: 7, NICKNAME: "MeepleFan" }]];
    return [{ affectedRows: 0 }];
  } });
  const res = response();

  await handlers.add({ auth: { userId: 1 }, body: { friendQuery: "7" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.ALREADY_FRIEND, true);
});

test("an ambiguous display name asks for a unique identifier", async () => {
  const handlers = friendsHandlers({ async query() { return [[{ USER_ID: 2 }, { USER_ID: 3 }]]; } });
  const res = response();

  await handlers.add({ auth: { userId: 1 }, body: { friendQuery: "Sam Player" } }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /email or user ID/);
});

test("a user cannot add themselves", async () => {
  const handlers = friendsHandlers({ async query(sql) {
    assert.doesNotMatch(sql, /INSERT IGNORE/);
    return [[{ USER_ID: 1 }]];
  } });
  const res = response();

  await handlers.add({ auth: { userId: 1 }, body: { friendQuery: "1" } }, res);

  assert.equal(res.statusCode, 400);
});

test("a private friend note is saved only after shared-group validation", async () => {
  const calls = [];
  const handlers = friendsHandlers({ async query(sql, values) {
    calls.push([sql, values]);
    return sql.startsWith("SELECT 1") ? [[{ shared: 1 }]] : [{ affectedRows: 1 }];
  } });
  const res = response();

  await handlers.saveNote({ auth: { userId: 1 }, params: { friendId: "2" }, body: { note: "Bring the train game next time" } }, res);

  assert.equal(res.statusCode, 200);
  assert.match(calls[1][0], /INSERT INTO friend_notes/);
  assert.deepEqual(calls[1][1], [1, 2, "Bring the train game next time"]);
  assert.equal(res.body.data.FRIEND_NOTE, "Bring the train game next time");
});

test("friend notes are limited to 300 characters", async () => {
  const handlers = friendsHandlers({ async query() { assert.fail("database must not be called"); } });
  const res = response();
  await handlers.saveNote({ auth: { userId: 1 }, params: { friendId: "2" }, body: { note: "x".repeat(301) } }, res);
  assert.equal(res.statusCode, 400);
});

test("a user can hide a current shared-group friend", async () => {
  const calls = [];
  const handlers = friendsHandlers({ async query(sql, values) {
    calls.push([sql, values]);
    return sql.startsWith("SELECT 1") ? [[{ shared: 1 }]] : [{ affectedRows: 1 }];
  } });
  const res = response();

  await handlers.setHidden({ auth: { userId: 1 }, params: { friendId: "2" }, body: { hidden: true } }, res);

  assert.equal(res.statusCode, 200);
  assert.match(calls[1][0], /INSERT INTO hidden_friends/);
  assert.deepEqual(calls[1][1], [1, 2]);
  assert.equal(res.body.data.IS_HIDDEN, true);
});

test("hidden state cannot be set for a user with no shared group", async () => {
  const handlers = friendsHandlers({ async query() { return [[]]; } });
  const res = response();

  await handlers.setHidden({ auth: { userId: 1 }, params: { friendId: "3" }, body: { hidden: true } }, res);

  assert.equal(res.statusCode, 404);
});
