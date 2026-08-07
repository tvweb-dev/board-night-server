const test = require("node:test");
const assert = require("node:assert/strict");
const { removePlaceholderUsers } = require("../data/placeholder-users.cleanup");

test("placeholder cleanup deletes only reserved-domain users and their memberships", async () => {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push(["BEGIN"]); },
    async query(sql, values) {
      calls.push([sql, values]);
      if (sql.startsWith("SELECT")) return [[{ USER_ID: 10 }, { USER_ID: 11 }]];
      return [{ affectedRows: 2 }];
    },
    async commit() { calls.push(["COMMIT"]); },
    async rollback() { assert.fail("must not roll back"); },
    release() { calls.push(["RELEASE"]); }
  };

  const removed = await removePlaceholderUsers({ async getConnection() { return connection; } });

  assert.equal(removed, 2);
  assert.deepEqual(calls[1][1], ["%@board-night.local"]);
  assert.match(calls[2][0], /^DELETE FROM group_members/);
  assert.deepEqual(calls[2][1], [[10, 11]]);
  assert.match(calls[3][0], /^DELETE FROM users/);
  assert.deepEqual(calls[3][1], [[10, 11]]);
});
