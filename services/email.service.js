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
    hostName: getValue(invite, "HOST_NAME", "HOST_FIRST_NAME", "HOST_EMAIL", "hostName", "hostEmail"),
    recipientEmail: getValue(invite, "RECIPIENT_EMAIL", "INVITEE_EMAIL", "USER_EMAIL", "EMAIL", "recipientEmail", "email"),
    recipientFirstName: getValue(invite, "RECIPIENT_FIRST_NAME", "INVITEE_FIRST_NAME", "USER_FIRST_NAME", "FIRST_NAME", "recipientFirstName", "firstName")
  };
}

async function sendInvitationEmail(invite, rsvpUrl) {
  const apiKey = process.env.EMAIL_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  const fromName = process.env.EMAIL_FROM_NAME || "Board Night";
  if (!apiKey || !fromAddress) throw new Error("Email service is not configured");
  const details = invitationDetails(invite);
  const greeting = details.recipientFirstName ? `Hi ${escapeHtml(details.recipientFirstName)},` : "Hello,";
  const descriptionHtml = details.eventDescription
    ? `<p>${escapeHtml(details.eventDescription).replace(/\r?\n/g, "<br>")}</p>`
    : "";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${fromName} <${fromAddress}>`, to: [details.recipientEmail], subject: `You're invited to ${details.eventTitle}`,
      html: `<p>${greeting}</p><p>${escapeHtml(details.hostName)} invited you to <strong>${escapeHtml(details.eventTitle)}</strong>.</p>${descriptionHtml}<p>${escapeHtml(details.eventDate)} at ${escapeHtml(details.eventTime)}<br>${escapeHtml(details.eventLocation)}</p><p><a href="${escapeHtml(rsvpUrl)}">RSVP to this event</a></p><p>${escapeHtml(rsvpUrl)}</p>`
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) throw new Error("Email provider rejected the invitation");
  return { messageId: payload.id };
}

module.exports = { invitationDetails, sendInvitationEmail };
