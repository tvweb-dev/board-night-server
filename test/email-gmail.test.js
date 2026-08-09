const test = require("node:test");
const assert = require("node:assert/strict");
const { createEmailService } = require("../services/email.service");

function environment(overrides = {}) {
  return {
    EMAIL_PROVIDER: "gmail",
    EMAIL_FROM_NAME: "Board Night",
    EMAIL_FROM_ADDRESS: "boardnight.email.services@gmail.com",
    GMAIL_USER: "boardnight.email.services@gmail.com",
    GMAIL_APP_PASSWORD: "mock-app-password",
    ...overrides
  };
}

function invitation(overrides = {}) {
  return {
    EVENT_ID: 9, EVENT_TITLE: "Catan & Snacks", EVENT_DESCRIPTION: "Bring <chips>",
    EVENT_DATE: "2099-08-10", EVENT_TIME: "19:00:00", EVENT_LOCATION: "Sam's <house>",
    EVENT_STATUS: "ACTIVE", GAME_NAME: "Catan <script>", HOST_NAME: "Host & Friend",
    RECIPIENT_EMAIL: "guest@example.com", RECIPIENT_FIRST_NAME: "Guest", ...overrides
  };
}

test("Gmail transport uses secure smtp.gmail.com configuration and is reused", async () => {
  let transportConfig;
  let transports = 0;
  const sent = [];
  const service = createEmailService({
    environment: environment(),
    nodemailer: { createTransport(config) { transports += 1; transportConfig = config; return { sendMail: async (message) => { sent.push(message); return { messageId: `gmail-${sent.length}` }; } }; } }
  });
  await service.sendInvitationEmail(invitation(), "https://board-night.example/rsvp.html?event=9&invite=3");
  await service.sendInvitationEmail(invitation(), "https://board-night.example/rsvp.html?event=9&invite=3");
  assert.deepEqual(transportConfig, {
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: "boardnight.email.services@gmail.com", pass: "mock-app-password" }
  });
  assert.equal(transports, 1);
});

test("invitation uses the fixed sender, invite recipient, RSVP URL, escaped HTML, and text fallback", async () => {
  let message;
  const service = createEmailService({
    environment: environment(),
    nodemailer: { createTransport: () => ({ sendMail: async (value) => { message = value; return { messageId: "gmail-message-id" }; } }) }
  });
  const result = await service.sendInvitationEmail(invitation(), "https://board-night.example/rsvp.html?event=9&invite=3");
  assert.deepEqual(message.from, { name: "Board Night", address: "boardnight.email.services@gmail.com" });
  assert.equal(message.to, "guest@example.com");
  assert.match(message.html, /Catan &amp; Snacks/);
  assert.match(message.html, /Sam&#39;s &lt;house&gt;/);
  assert.match(message.html, /Catan &lt;script&gt;/);
  assert.doesNotMatch(message.html, /<script>/i);
  assert.match(message.html, /https:\/\/board-night\.example\/rsvp\.html\?event=9&amp;invite=3/);
  assert.match(message.text, /View Board Night & RSVP/);
  assert.match(message.text, /Bring <chips>/);
  assert.equal(result.messageId, "gmail-message-id");
});

test("missing Gmail configuration fails before a transport or message is created", async () => {
  let created = false;
  const service = createEmailService({
    environment: environment({ GMAIL_APP_PASSWORD: "" }),
    nodemailer: { createTransport: () => { created = true; return {}; } }
  });
  await assert.rejects(() => service.sendInvitationEmail(invitation(), "https://board-night.example/rsvp"), /GMAIL_APP_PASSWORD/);
  assert.equal(created, false);
});

test("Gmail provider failures reject without exposing credentials through the service", async () => {
  const service = createEmailService({
    environment: environment(),
    nodemailer: { createTransport: () => ({ sendMail: async () => { throw new Error("SMTP authentication failed"); } }) }
  });
  await assert.rejects(() => service.sendInvitationEmail(invitation(), "https://board-night.example/rsvp"), /SMTP authentication failed/);
});

test("unsafe RSVP URL protocols are rejected", async () => {
  const service = createEmailService({ environment: environment(), nodemailer: { createTransport: () => ({}) } });
  await assert.rejects(() => service.sendInvitationEmail(invitation(), "javascript:alert(1)"), /RSVP URL is invalid/);
});
