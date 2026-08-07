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
      const [rows] = await connection.query(
        `SELECT e.EVENT_ID, e.GROUP_ID, e.HOST_ID, u.EMAIL AS HOST_EMAIL,
                e.EVENT_TITLE, e.EVENT_DESCRIPTION, e.EVENT_DATE, e.EVENT_TIME,
                e.EVENT_LOCATION, e.EVENT_STATUS, e.CREATED_AT
         FROM events e
         JOIN users u ON u.USER_ID = e.HOST_ID
         WHERE e.GROUP_ID = ?
         ORDER BY e.EVENT_DATE, e.EVENT_TIME`,
        [groupId]
      );
      return rows;
    },
    async updateEvent(eventId, requestingUserId, eventTitle, eventDescription, eventDate, eventTime, eventLocation) {
      const [result] = await connection.query(
        `UPDATE events SET EVENT_TITLE = ?, EVENT_DESCRIPTION = ?, EVENT_DATE = ?, EVENT_TIME = ?, EVENT_LOCATION = ?
         WHERE EVENT_ID = ? AND HOST_ID = ? AND EVENT_STATUS NOT IN ('CANCELED', 'CANCELLED', 'COMPLETED')`,
        [eventTitle, eventDescription, eventDate, eventTime, eventLocation, eventId, requestingUserId]
      );
      if (!result.affectedRows) return null;
      const [rows] = await connection.query("SELECT * FROM events WHERE EVENT_ID = ?", [eventId]);
      return rows[0] || null;
    },
    async readInviteForEmail(inviteId, requestingUserId) {
      const [rows] = await connection.query("CALL ReadInviteForEmail(?, ?)", [inviteId, requestingUserId]);
      return firstProcedureRow(rows);
    },
    async updateInviteEmailStatus(inviteId, requestingUserId, emailStatus, messageId, errorMessage) {
      const [rows] = await connection.query("CALL UpdateInviteEmailStatus(?, ?, ?, ?, ?)", [inviteId, requestingUserId, emailStatus, messageId, errorMessage]);
      return firstProcedureRow(rows);
    },
    async readInviteEmailStatus(inviteId, requestingUserId) {
      const [rows] = await connection.query("CALL ReadInviteEmailStatus(?, ?)", [inviteId, requestingUserId]);
      return firstProcedureRow(rows);
    },
    async updateInviteEmailDetails(inviteId, requestingUserId, emailStatus, emailSentAt, messageId, errorMessage) {
      const [rows] = await connection.query("CALL UpdateInviteEmailDetails(?, ?, ?, ?, ?, ?)", [
        inviteId, requestingUserId, emailStatus, emailSentAt, messageId, errorMessage
      ]);
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
