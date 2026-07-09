const { pool } = require("../config/database");

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

module.exports = {
  listInvites,
  createInvite,
  updateRSVP
};
