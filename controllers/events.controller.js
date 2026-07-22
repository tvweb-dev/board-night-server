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

async function createEvent(req, res) {
  try {
    const {
      groupId,
      hostId,
      eventTitle,
      eventDate,
      eventTime,
      eventLocation
    } = req.body;

    const [rows] = await pool.query("CALL CreateEvent(?, ?, ?, ?, ?, ?)", [
      groupId,
      hostId,
      eventTitle,
      eventDate,
      eventTime,
      eventLocation
    ]);

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: getFirstResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

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
  createStoryHandlers
};
