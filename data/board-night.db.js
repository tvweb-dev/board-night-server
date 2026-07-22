const { pool } = require("../config/database");

function procedureRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.find((item) => Array.isArray(item)) || [];
}

function firstProcedureRow(rows) {
  return procedureRows(rows)[0] || null;
}

const DB = {
  async createEvent(groupId, hostId, eventTitle, eventDate, eventTime, eventLocation) {
    const [rows] = await pool.query("CALL CreateEvent(?, ?, ?, ?, ?, ?)", [
      groupId, hostId, eventTitle, eventDate, eventTime, eventLocation
    ]);
    return firstProcedureRow(rows);
  },
  async readInviteForEmail(inviteId, requestingUserId) {
    const [rows] = await pool.query("CALL ReadInviteForEmail(?, ?)", [inviteId, requestingUserId]);
    return firstProcedureRow(rows);
  },
  async updateInviteEmailStatus(inviteId, requestingUserId, emailStatus, messageId, errorMessage) {
    const [rows] = await pool.query("CALL UpdateInviteEmailStatus(?, ?, ?, ?, ?)", [inviteId, requestingUserId, emailStatus, messageId, errorMessage]);
    return firstProcedureRow(rows);
  },
  async cancelEvent(eventId, requestingUserId) {
    const [rows] = await pool.query("CALL CancelEvent(?, ?)", [eventId, requestingUserId]);
    return firstProcedureRow(rows);
  },
  async changeHost(eventId, requestingUserId, newHostId) {
    const [rows] = await pool.query("CALL ChangeEventHost(?, ?, ?)", [eventId, requestingUserId, newHostId]);
    return firstProcedureRow(rows);
  }
};

module.exports = { DB, firstProcedureRow, procedureRows };
