const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { addGroupMemberHandler } = require("../controllers/groups.controller");

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
