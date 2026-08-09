const nodemailer = require("nodemailer");
const BOARD_NIGHT_GMAIL_ADDRESS = "boardnight.email.services@gmail.com";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function getValue(record, ...names) {
  for (const name of names) if (record[name] != null) return record[name];
  return "";
}

function invitationDetails(invite) {
  return {
    eventId: getValue(invite, "EVENT_ID", "eventId"),
    eventTitle: getValue(invite, "EVENT_TITLE", "eventTitle"),
    eventDescription: getValue(invite, "EVENT_DESCRIPTION", "eventDescription"),
    eventDate: getValue(invite, "EVENT_DATE", "eventDate"),
    eventTime: getValue(invite, "EVENT_TIME", "eventTime"),
    eventLocation: getValue(invite, "EVENT_LOCATION", "eventLocation"),
    eventStatus: String(getValue(invite, "EVENT_STATUS", "STATUS", "eventStatus", "status")).toUpperCase(),
    gameName: getValue(invite, "GAME_NAME", "gameName"),
    hostName: getValue(invite, "HOST_NAME", "HOST_FIRST_NAME", "HOST_EMAIL", "hostName", "hostEmail"),
    recipientEmail: getValue(invite, "RECIPIENT_EMAIL", "INVITEE_EMAIL", "USER_EMAIL", "EMAIL", "recipientEmail", "email"),
    recipientFirstName: getValue(invite, "RECIPIENT_FIRST_NAME", "INVITEE_FIRST_NAME", "USER_FIRST_NAME", "FIRST_NAME", "recipientFirstName", "firstName")
  };
}

function requiredEmailConfig(environment, includeFrontend = false) {
  const required = ["EMAIL_PROVIDER", "GMAIL_USER", "GMAIL_APP_PASSWORD", "EMAIL_FROM_ADDRESS", "EMAIL_FROM_NAME"];
  if (includeFrontend) required.push("FRONTEND_BASE_URL");
  const missing = required.filter((name) => !String(environment[name] || "").trim());
  if (String(environment.EMAIL_PROVIDER || "gmail").toLowerCase() !== "gmail") missing.push("EMAIL_PROVIDER=gmail");
  if (missing.length) throw new Error(`Email service is not configured (${missing.join(", ")})`);
  if (String(environment.GMAIL_USER).trim().toLowerCase() !== BOARD_NIGHT_GMAIL_ADDRESS
      || String(environment.EMAIL_FROM_ADDRESS).trim().toLowerCase() !== BOARD_NIGHT_GMAIL_ADDRESS) {
    throw new Error("Email sender configuration is invalid");
  }
  return {
    user: String(environment.GMAIL_USER).trim(),
    password: String(environment.GMAIL_APP_PASSWORD),
    fromName: String(environment.EMAIL_FROM_NAME).trim(),
    fromAddress: String(environment.EMAIL_FROM_ADDRESS).trim()
  };
}

function safeRsvpUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch (_) { throw new Error("RSVP URL is invalid"); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("RSVP URL is invalid");
  return url.toString();
}

function messageContent(details, rsvpUrl) {
  const greeting = details.recipientFirstName ? `Hi ${details.recipientFirstName},` : "Hello,";
  const descriptionText = details.eventDescription ? `\nDescription:\n${details.eventDescription}\n` : "";
  const gameText = details.gameName || "Not selected";
  const text = `${greeting}\n\nBoard Night\nYou're Invited!\n\n${details.eventTitle}\n\n${details.hostName} has invited you to a Board Night.\n${descriptionText}\nDate: ${details.eventDate}\nTime: ${details.eventTime}\nLocation: ${details.eventLocation}\nGame: ${gameText}\n\nView Board Night & RSVP:\n${rsvpUrl}`;
  const descriptionHtml = details.eventDescription
    ? `<p><strong>Description:</strong><br>${escapeHtml(details.eventDescription).replace(/\r?\n/g, "<br>")}</p>`
    : "";
  const html = `<div><p>${escapeHtml(greeting)}</p><p><strong>Board Night</strong><br><strong>You're Invited!</strong></p><h2>${escapeHtml(details.eventTitle)}</h2><p>${escapeHtml(details.hostName)} has invited you to a Board Night.</p>${descriptionHtml}<p><strong>Date:</strong> ${escapeHtml(details.eventDate)}<br><strong>Time:</strong> ${escapeHtml(details.eventTime)}<br><strong>Location:</strong> ${escapeHtml(details.eventLocation)}<br><strong>Game:</strong> ${escapeHtml(gameText)}</p><p><a href="${escapeHtml(rsvpUrl)}">View Board Night &amp; RSVP</a></p></div>`;
  return { text, html };
}

function createEmailService(options = {}) {
  const environment = options.environment || process.env;
  const mailLibrary = options.nodemailer || nodemailer;
  let transporter;

  function transport() {
    const config = requiredEmailConfig(environment);
    if (!transporter) {
      transporter = mailLibrary.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: config.user, pass: config.password }
      });
    }
    return { transporter, config };
  }

  async function sendInvitationEmail(invite, rsvpUrl) {
    const details = invitationDetails(invite);
    if (!details.recipientEmail) throw new Error("Invitation recipient email is missing");
    const safeUrl = safeRsvpUrl(rsvpUrl);
    const { transporter: smtp, config } = transport();
    const content = messageContent(details, safeUrl);
    const result = await smtp.sendMail({
      from: { name: config.fromName, address: config.fromAddress },
      to: details.recipientEmail,
      subject: `You're invited to ${details.eventTitle}`,
      text: content.text,
      html: content.html
    });
    if (!result || !result.messageId) throw new Error("Email provider did not return a message ID");
    return { messageId: String(result.messageId) };
  }

  return { invitationDetails, sendInvitationEmail };
}

const service = createEmailService();
module.exports = { ...service, BOARD_NIGHT_GMAIL_ADDRESS, createEmailService, invitationDetails, messageContent, requiredEmailConfig, safeRsvpUrl };
