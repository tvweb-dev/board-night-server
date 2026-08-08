const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("member and RSVP reads include profile nickname and image", () => {
  const groups = fs.readFileSync(path.join(__dirname, "../controllers/groups.controller.js"), "utf8");
  const events = fs.readFileSync(path.join(__dirname, "../controllers/events.controller.js"), "utf8");
  for (const source of [groups, events]) {
    assert.match(source, /LEFT JOIN user_profile/i);
    assert.match(source, /up\.NICKNAME/);
    assert.match(source, /up\.IMAGE_URL/);
  }
});

test("RSVP reads include attendee food, drink, and allergy preferences", () => {
  const events = fs.readFileSync(path.join(__dirname, "../controllers/events.controller.js"), "utf8");
  const routes = fs.readFileSync(path.join(__dirname, "../routes/events.routes.js"), "utf8");
  assert.match(events, /up\.FAVORITE_FOOD/);
  assert.match(events, /up\.FAVORITE_DRINK/);
  assert.match(events, /up\.ALLERGIES/);
  assert.match(routes, /router\.get\("\/:eventId\/rsvps", requireAuth/);
});
