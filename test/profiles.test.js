const test = require("node:test");
const assert = require("node:assert/strict");
const { createProfileHandlers, normalizeProfile } = require("../controllers/profiles.controller");

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("profile updates are restricted to the authenticated user", async () => {
  const handlers = createProfileHandlers({ query: async () => { throw new Error("should not query"); } });
  const res = response();
  await handlers.save({ params: { userId: "8" }, auth: { userId: 7 }, body: {} }, res);
  assert.equal(res.statusCode, 403);
});

test("profile save uses an upsert and returns the saved profile", async () => {
  const queries = [];
  const database = { async query(sql, params) { queries.push({ sql, params }); return sql.includes("SELECT u.USER_ID") ? [[{ USER_ID: 7, NICKNAME: "MeepleFan" }]] : [{ affectedRows: 1 }]; } };
  const res = response();
  await createProfileHandlers(database).save({ params: { userId: "7" }, auth: { userId: 7 }, body: { firstName: "Sam", lastName: "Player", nickname: "MeepleFan", imageUrl: "https://example.com/avatar.png", birthday: "1990-01-02", favoriteFood: "Pizza", favoriteDrink: "Tea", allergies: "None", city: "Victoria", province: "BC", country: "Canada" } }, res);
  assert.match(queries[0].sql, /ON DUPLICATE KEY UPDATE/);
  assert.equal(res.body.data.NICKNAME, "MeepleFan");
});

test("profile image URL must use HTTP or HTTPS", () => {
  assert.throws(() => normalizeProfile({ firstName: "Sam", lastName: "Player", nickname: "MeepleFan", imageUrl: "javascript:alert(1)", birthday: "1990-01-02", favoriteFood: "Pizza", favoriteDrink: "Tea", allergies: "None", city: "Victoria", province: "BC", country: "Canada" }), /HTTP\(S\)/);
});

test("all profile fields except image URL are required", () => {
  const complete = { firstName: "Sam", lastName: "Player", nickname: "MeepleFan", birthday: "1990-01-02", favoriteFood: "Pizza", favoriteDrink: "Tea", allergies: "None", city: "Victoria", province: "BC", country: "Canada" };
  assert.equal(normalizeProfile(complete).imageUrl, null);
  for (const field of Object.keys(complete)) assert.throws(() => normalizeProfile({ ...complete, [field]: "" }), /required/);
});
