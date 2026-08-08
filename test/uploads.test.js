const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createUploadSignatureHandler } = require("../controllers/uploads.controller");

function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }

test("upload signatures are scoped by image type and never expose the secret", () => {
  const env = { CLOUDINARY_CLOUD_NAME: "cloud", CLOUDINARY_API_KEY: "key", CLOUDINARY_API_SECRET: "secret" };
  const res = response();
  createUploadSignatureHandler(env, () => 1234)({ body: { type: "profile" } }, res);
  const expected = crypto.createHash("sha1").update("folder=board-night/profiles&timestamp=1234secret").digest("hex");
  assert.equal(res.body.data.signature, expected);
  assert.equal(res.body.data.folder, "board-night/profiles");
  assert.doesNotMatch(JSON.stringify(res.body), /secret/);
});

test("upload signature rejects unsupported types and missing configuration", () => {
  const invalid = response();
  createUploadSignatureHandler({})({ body: { type: "other" } }, invalid);
  assert.equal(invalid.statusCode, 400);
  const missing = response();
  createUploadSignatureHandler({})({ body: { type: "event" } }, missing);
  assert.equal(missing.statusCode, 503);
});
