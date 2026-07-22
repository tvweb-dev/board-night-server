const { pool } = require("../config/database");
const { DB } = require("../data/board-night.db");
const { sendDatabaseError } = require("../utils/http-errors");

function unwrapProcedureResult(rows) {
  return rows && rows[0] ? rows[0] : [];
}

function getFirstResult(rows) {
  const result = unwrapProcedureResult(rows);
  return result && result[0] ? result[0] : null;
}

function handleDbError(res, error, statusCode = 400) {
  return res.status(statusCode).json({
    success: false,
    message: error.sqlMessage || error.message || "Database error"
  });
}

async function listEvents(req, res) {
  res.json({
    success: true,
    message: "Events endpoint ready",
    data: []
  });
}

function createEventHandler(database = DB, options = {}) {
  const submissions = new Map();
  const deduplicationWindowMs = options.deduplicationWindowMs || 2000;

  return async function createEvent(req, res) {
    const { groupId, eventTitle, eventDate, eventTime, eventLocation } = req.body || {};
    const hostId = req.auth.userId;
    const suppliedKey = String(req.get && req.get("idempotency-key") || "").trim();
    const fingerprint = suppliedKey || JSON.stringify([hostId, groupId, eventTitle, eventDate, eventTime, eventLocation]);
    const now = Date.now();
    const existing = submissions.get(fingerprint);
    const isDuplicate = Boolean(existing && now - existing.createdAt < deduplicationWindowMs);

    try {
      let eventPromise;
      if (isDuplicate) {
        eventPromise = existing.eventPromise;
      } else {
        eventPromise = database.createEvent(groupId, hostId, eventTitle, eventDate, eventTime, eventLocation);
        submissions.set(fingerprint, { createdAt: now, eventPromise });
        const cleanup = setTimeout(() => submissions.delete(fingerprint), deduplicationWindowMs);
        if (cleanup.unref) cleanup.unref();
      }

      const event = await eventPromise;
      return res.status(isDuplicate ? 200 : 201).json({
        success: true,
        message: "Event created successfully",
        event,
        data: event
      });
    } catch (error) {
      submissions.delete(fingerprint);
      return handleDbError(res, error);
    }
  };
}

const createEvent = createEventHandler();

async function readGroupEvents(req, res) {
  try {
    const { groupId } = req.params;

    const [rows] = await pool.query("CALL ReadGroupEvents(?)", [groupId]);

    res.json({
      success: true,
      message: "Group events loaded successfully",
      data: unwrapProcedureResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

async function readEventRSVPs(req, res) {
  try {
    const { eventId } = req.params;

    const [rows] = await pool.query("CALL ReadEventRSVPs(?)", [eventId]);

    res.json({
      success: true,
      message: "Event RSVPs loaded successfully",
      data: unwrapProcedureResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

function validId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function createStoryHandlers(database = DB) {
  return {
    async cancelEvent(req, res) {
      const eventId = validId(req.params.eventId);
      if (!eventId) return res.status(400).json({ success: false, message: "A valid event ID is required" });
      try {
        const event = await database.cancelEvent(eventId, req.auth.userId);
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });
        return res.json({ success: true, message: "Event cancelled successfully", event });
      } catch (error) {
        return sendDatabaseError(res, error, "Unable to cancel event");
      }
    },

    async changeHost(req, res) {
      const eventId = validId(req.params.eventId);
      const newHostId = validId(req.body && req.body.newHostId);
      if (!eventId || !newHostId) return res.status(400).json({ success: false, message: "Valid event and new host IDs are required" });
      try {
        const event = await database.changeHost(eventId, req.auth.userId, newHostId);
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });
        return res.json({ success: true, message: "Event host changed successfully", event });
      } catch (error) {
        return sendDatabaseError(res, error, "Unable to change event host");
      }
    }
  };
}

const storyHandlers = createStoryHandlers();

module.exports = {
  listEvents,
  createEvent,
  readGroupEvents,
  readEventRSVPs,
  cancelEvent: storyHandlers.cancelEvent,
  changeHost: storyHandlers.changeHost,
  createStoryHandlers,
  createEventHandler
};
