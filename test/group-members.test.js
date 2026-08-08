const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { addGroupMemberHandler, removeGroupMemberHandler } = require("../controllers/groups.controller");

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function request(memberQuery) {
  return { body: { groupId: 9, memberQuery }, auth: { userId: 4 } };
}

test("group host can add an existing user by nickname without creating an account", async () => {
  const calls = [];
  const database = { async query(sql, values) {
    calls.push([sql, values]);
    if (sql.includes("CREATED_BY")) return [[{ GROUP_ID: 9 }]];
    if (sql.includes("LEFT JOIN user_profile")) return [[{ USER_ID: 1 }]];
    return [[[{ GROUP_ID: 9, USER_ID: 1 }], { affectedRows: 0 }]];
  } };
  let notifiedUserId;
  const handler = addGroupMemberHandler(database, { async notifyGroupMemberAdded(_db, item) { notifiedUserId = item.userId; } });
  const res = response();

  await handler(request("Dice Master"), res);

  assert.equal(res.statusCode, 201);
  assert.match(calls[1][0], /up\.NICKNAME/);
  assert.deepEqual(calls[1][1], ["Dice Master", "Dice Master", "Dice Master"]);
  assert.deepEqual(calls[2][1], [9, 1, "MEMBER"]);
  assert.equal(notifiedUserId, 1);
});

test("unknown display name is rejected and no member is added", async () => {
  const calls = [];
  const database = { async query(sql, values) {
    calls.push([sql, values]);
    return sql.includes("CREATED_BY") ? [[{ GROUP_ID: 9 }]] : [[]];
  } };
  const handler = addGroupMemberHandler(database, { async notifyGroupMemberAdded() { assert.fail("must not notify"); } });
  const res = response();

  await handler(request("Not A User"), res);

  assert.equal(res.statusCode, 404);
  assert.equal(calls.length, 2);
});

test("ambiguous display name requires an email or user ID", async () => {
  const database = { async query(sql) {
    return sql.includes("CREATED_BY") ? [[{ GROUP_ID: 9 }]] : [[{ USER_ID: 1 }, { USER_ID: 2 }]];
  } };
  const handler = addGroupMemberHandler(database, { async notifyGroupMemberAdded() {} });
  const res = response();

  await handler(request("Alex"), res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /email or user ID/);
});

test("frontend member flow never creates placeholder accounts", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../board-night/js/data.js"), "utf8");
  assert.doesNotMatch(source, /@board-night\.local/);
  const memberFlow = source.match(/async addMember[\s\S]*?\/\* ---- events ---- \*\//)[0];
  assert.doesNotMatch(memberFlow, /createUser/);
  assert.match(memberFlow, /memberQuery/);
});

test("registration rejects the old placeholder email domain", () => {
  const source = fs.readFileSync(path.join(__dirname, "../controllers/users.controller.js"), "utf8");
  assert.match(source, /endsWith\("@board-night\.local"\)/);
  assert.match(source, /domain is reserved/);
});

test("group creator removes a member and their group-event invitations atomically", async () => {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push(["BEGIN"]); },
    async query(sql, values) {
      calls.push([sql, values]);
      if (sql.includes("SELECT g.CREATED_BY")) return [[{ CREATED_BY: 4, IS_EVENT_HOST: 0 }]];
      return [{ affectedRows: 1 }];
    },
    async commit() { calls.push(["COMMIT"]); },
    async rollback() { assert.fail("must not roll back"); },
    release() { calls.push(["RELEASE"]); }
  };
  const handler = removeGroupMemberHandler({ async getConnection() { return connection; } });
  const res = response();

  await handler({ auth: { userId: 4 }, params: { groupId: "9", userId: "7" } }, res);

  assert.equal(res.statusCode, 200);
  assert.match(calls[2][0], /DELETE ei FROM event_invites/);
  assert.deepEqual(calls[2][1], [9, 7]);
  assert.match(calls[3][0], /DELETE FROM group_members/);
  assert.deepEqual(calls[3][1], [9, 7]);
});

test("event host can remove a member but cannot remove the group creator", async () => {
  let rollbackCount = 0;
  const connection = {
    async beginTransaction() {},
    async query(sql) {
      if (sql.includes("SELECT g.CREATED_BY")) return [[{ CREATED_BY: 4, IS_EVENT_HOST: 1 }]];
      return [{ affectedRows: 1 }];
    },
    async commit() {}, async rollback() { rollbackCount += 1; }, release() {}
  };
  const handler = removeGroupMemberHandler({ async getConnection() { return connection; } });
  const allowed = response();
  await handler({ auth: { userId: 8 }, params: { groupId: "9", userId: "7" } }, allowed);
  assert.equal(allowed.statusCode, 200);

  const blocked = response();
  await handler({ auth: { userId: 8 }, params: { groupId: "9", userId: "4" } }, blocked);
  assert.equal(blocked.statusCode, 403);
  assert.match(blocked.body.message, /creator cannot be removed/);
  assert.equal(rollbackCount, 1);
});

test("ordinary group member cannot remove another member", async () => {
  const connection = {
    async beginTransaction() {},
    async query() { return [[{ CREATED_BY: 4, IS_EVENT_HOST: 0 }]]; },
    async rollback() {}, release() {}
  };
  const handler = removeGroupMemberHandler({ async getConnection() { return connection; } });
  const res = response();

  await handler({ auth: { userId: 6 }, params: { groupId: "9", userId: "7" } }, res);

  assert.equal(res.statusCode, 403);
});
