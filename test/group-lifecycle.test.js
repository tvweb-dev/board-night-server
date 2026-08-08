const test = require("node:test");
const assert = require("node:assert/strict");
const { ensureGroupLifecycleSchema } = require("../data/groups.schema");
const { groupLifecycleHandlers } = require("../controllers/groups.controller");

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("group lifecycle schema adds each missing lifecycle column", async () => {
  const statements = [];
  await ensureGroupLifecycleSchema({ async query(sql, values) {
    statements.push([sql, values]);
    return sql.includes("information_schema") ? [[]] : [{ affectedRows: 0 }];
  } });
  assert.equal(statements.filter(([sql]) => sql.startsWith("ALTER TABLE")).length, 3);
  assert.match(statements[1][0], /IS_ACTIVE/);
  assert.match(statements[5][0], /REACTIVATED_FROM_GROUP_ID/);
});

test("only the creator can set an active group inactive", async () => {
  const handlers = groupLifecycleHandlers({ async query(sql, values) {
    assert.match(sql, /CREATED_BY = \?/);
    assert.deepEqual(values, [9, 4]);
    return [{ affectedRows: 1 }];
  } });
  const res = response();
  await handlers.setInactive({ auth: { userId: 4 }, params: { groupId: "9" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.IS_ACTIVE, 0);
});

test("reactivating creates a new group ID and copies members in a transaction", async () => {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push("begin"); },
    async commit() { calls.push("commit"); },
    async rollback() { calls.push("rollback"); },
    release() { calls.push("release"); },
    async query(sql, values) {
      calls.push([sql, values]);
      if (sql.startsWith("SELECT source.GROUP_NAME")) return [[{ GROUP_NAME: "Friday Crew", GROUP_IMAGE_URL: "https://example.com/group.jpg" }]];
      if (sql.startsWith("INSERT INTO `groups`")) return [{ insertId: 42 }];
      return [{ affectedRows: 3 }];
    }
  };
  const handlers = groupLifecycleHandlers({ async getConnection() { return connection; } });
  const res = response();
  await handlers.reactivate({ auth: { userId: 4 }, params: { groupId: "9" } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.GROUP_ID, 42);
  assert.equal(res.body.data.REACTIVATED_FROM_GROUP_ID, 9);
  assert.ok(calls.some((call) => Array.isArray(call) && /INSERT INTO group_members/.test(call[0])));
  assert.ok(calls.includes("commit"));
});
