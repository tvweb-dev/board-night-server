const { pool } = require("../config/database");

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

module.exports = {
  listEvents,
  createEvent,
  readGroupEvents,
  readEventRSVPs
};
