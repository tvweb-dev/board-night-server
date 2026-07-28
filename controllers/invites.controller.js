const { pool } = require("../config/database");
const { DB } = require("../data/board-night.db");
const emailService = require("../services/email.service");
const { sendDatabaseError } = require("../utils/http-errors");

function getFirstResult(rows) {
  const result = rows && rows[0] ? rows[0] : [];
  return result && result[0] ? result[0] : null;
}

function handleDbError(res, error, statusCode = 400) {
  return res.status(statusCode).json({
    success: false,
    message: error.sqlMessage || error.message || "Database error"
  });
}

async function listInvites(req, res) {
  res.json({
    success: true,
    message: "Invites endpoint ready",
    data: []
  });
}

async function createInvite(req, res) {
  try {
    const { eventId, userId } = req.body;

    const [rows] = await pool.query("CALL CreateInvite(?, ?)", [
      eventId,
      userId
    ]);

    res.status(201).json({
      success: true,
      message: "Invite created successfully",
      data: getFirstResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

async function updateRSVP(req, res) {
  try {
    const { inviteId, rsvpStatus } = req.body;

    const [rows] = await pool.query("CALL UpdateRSVP(?, ?)", [
      inviteId,
      rsvpStatus
    ]);

    res.json({
      success: true,
      message: "RSVP updated successfully",
      data: getFirstResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

function createEmailHandler(database = DB, mailer = emailService) {
  return async function sendInviteEmail(req, res) {
    const inviteId = Number(req.params.inviteId);
    if (!Number.isInteger(inviteId) || inviteId < 1) return res.status(400).json({ success: false, message: "A valid invitation ID is required" });

    let invite;
    try {
      invite = await database.readInviteForEmail(inviteId, req.auth.userId);
      if (!invite) return res.status(404).json({ success: false, message: "Invitation not found" });
    } catch (error) {
      return sendDatabaseError(res, error, "Unable to load invitation");
    }

    const details = mailer.invitationDetails(invite);
    if (["CANCELLED", "COMPLETED"].includes(details.eventStatus)) {
      return res.status(409).json({ success: false, message: `Cannot email an invitation for a ${details.eventStatus.toLowerCase()} event` });
    }

    try {
      await database.updateInviteEmailStatus(inviteId, req.auth.userId, "SENDING", null, null);
      const baseUrl = String(process.env.FRONTEND_BASE_URL || "").replace(/\/$/, "");
      if (!baseUrl) throw new Error("Frontend URL is not configured");
      const rsvpUrl = `${baseUrl}/rsvp.html?event=${encodeURIComponent(details.eventId)}`;
      const sent = await mailer.sendInvitationEmail(invite, rsvpUrl);
      const updated = await database.updateInviteEmailStatus(inviteId, req.auth.userId, "SENT", sent.messageId, null);
      return res.json({
        success: true,
        message: "Invitation email sent successfully",
        inviteId,
        emailStatus: "SENT",
        emailSentAt: updated && (updated.EMAIL_SENT_AT || updated.emailSentAt) || new Date().toISOString(),
        recipientEmail: details.recipientEmail
      });
    } catch (error) {
      const credential = process.env.EMAIL_API_KEY;
      const rawError = String(error.message || "Email delivery failed");
      const safeError = (credential ? rawError.split(credential).join("[redacted]") : rawError).slice(0, 240);
      try {
        await database.updateInviteEmailStatus(inviteId, req.auth.userId, "FAILED", null, safeError);
      } catch (statusError) {
        // Preserve the original delivery error; neither error is exposed verbatim.
      }
      return res.status(502).json({ success: false, message: "Invitation email could not be sent" });
    }
  };
}

const sendInviteEmail = createEmailHandler();

const EMAIL_STATUSES = new Set(["NOT_SENT", "SENDING", "SENT", "FAILED"]);

function validInviteId(value) {
  const inviteId = Number(value);
  return Number.isInteger(inviteId) && inviteId > 0 ? inviteId : null;
}

function emailDetailsHandler(database = DB) {
  return {
    async read(req, res) {
      const inviteId = validInviteId(req.params.inviteId);
      if (!inviteId) return res.status(400).json({ success: false, message: "A valid invitation ID is required" });

      try {
        const data = await database.readInviteEmailStatus(inviteId, req.auth.userId);
        if (!data) return res.status(404).json({ success: false, message: "Invitation not found" });
        return res.json({ success: true, message: "Invitation email status retrieved successfully", data });
      } catch (error) {
        return sendDatabaseError(res, error, "Unable to read invitation email status");
      }
    },

    async update(req, res) {
      const inviteId = validInviteId(req.params.inviteId);
      if (!inviteId) return res.status(400).json({ success: false, message: "A valid invitation ID is required" });

      const { emailStatus, emailSentAt = null, emailMessageId = null, emailError = null } = req.body || {};
      if (!EMAIL_STATUSES.has(emailStatus)) {
        return res.status(400).json({ success: false, message: "emailStatus must be NOT_SENT, SENDING, SENT, or FAILED" });
      }
      if (emailSentAt !== null && (typeof emailSentAt !== "string" || Number.isNaN(Date.parse(emailSentAt)))) {
        return res.status(400).json({ success: false, message: "emailSentAt must be a valid date/time or null" });
      }
      if (emailMessageId !== null && (typeof emailMessageId !== "string" || emailMessageId.length > 255)) {
        return res.status(400).json({ success: false, message: "emailMessageId must be a string of at most 255 characters or null" });
      }
      if (emailError !== null && (typeof emailError !== "string" || emailError.length > 2000)) {
        return res.status(400).json({ success: false, message: "emailError must be a string of at most 2000 characters or null" });
      }

      try {
        const data = await database.updateInviteEmailDetails(
          inviteId, req.auth.userId, emailStatus, emailSentAt, emailMessageId, emailError
        );
        if (!data) return res.status(404).json({ success: false, message: "Invitation not found" });
        return res.json({ success: true, message: "Invitation email status updated successfully", data });
      } catch (error) {
        return sendDatabaseError(res, error, "Unable to update invitation email status");
      }
    }
  };
}

const emailDetails = emailDetailsHandler();

module.exports = {
  listInvites,
  createInvite,
  updateRSVP,
  sendInviteEmail,
  createEmailHandler,
  readEmailDetails: emailDetails.read,
  updateEmailDetails: emailDetails.update,
  emailDetailsHandler
};
