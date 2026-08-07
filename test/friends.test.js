const test = require("node:test");
const assert = require("node:assert/strict");
const { ensureFriendsSchema } = require("../data/friends.schema");
const { friendsHandlers } = require("../controllers/friends.controller");

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("friends schema stores hidden status per user and friend", async () => {
  let statement;
  await ensureFriendsSchema({ async query(sql) { statement = sql; } });
  assert.match(statement, /PRIMARY KEY \(USER_ID, FRIEND_USER_ID\)/);
  assert.match(statement, /ON DELETE CASCADE/);
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
  assert.deepEqual(query[1], [1]);
  assert.equal(res.body.data[0].FRIENDS_SINCE, "2026-01-02");
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
