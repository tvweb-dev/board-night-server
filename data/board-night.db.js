const { pool } = require("../config/database");

function procedureRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.find((item) => Array.isArray(item)) || [];
}

function firstProcedureRow(rows) {
  return procedureRows(rows)[0] || null;
}

function createDatabase(connection = pool) {
  return {
    async createEvent(groupId, hostId, eventTitle, eventDescription, eventDate, eventTime, eventLocation) {
      const [rows] = await connection.query("CALL CreateEvent(?, ?, ?, ?, ?, ?, ?)", [
        groupId, hostId, eventTitle, eventDescription, eventDate, eventTime, eventLocation
      ]);
      return firstProcedureRow(rows);
    },
    async readGroupEvents(groupId) {
      const [rows] = await connection.query("CALL ReadGroupEvents(?)", [groupId]);
      return procedureRows(rows);
    },
    async readInviteForEmail(inviteId, requestingUserId) {
      const [rows] = await connection.query("CALL ReadInviteForEmail(?, ?)", [inviteId, requestingUserId]);
      return firstProcedureRow(rows);
    },
    async updateInviteEmailStatus(inviteId, requestingUserId, emailStatus, messageId, errorMessage) {
      const [rows] = await connection.query("CALL UpdateInviteEmailStatus(?, ?, ?, ?, ?)", [inviteId, requestingUserId, emailStatus, messageId, errorMessage]);
      return firstProcedureRow(rows);
    },
    async cancelEvent(eventId, requestingUserId) {
      const [rows] = await connection.query("CALL CancelEvent(?, ?)", [eventId, requestingUserId]);
      return firstProcedureRow(rows);
    },
    async changeHost(eventId, requestingUserId, newHostId) {
      const [rows] = await connection.query("CALL ChangeEventHost(?, ?, ?)", [eventId, requestingUserId, newHostId]);
      return firstProcedureRow(rows);
    }
  };
}

const DB = createDatabase();

module.exports = { DB, createDatabase, firstProcedureRow, procedureRows };
