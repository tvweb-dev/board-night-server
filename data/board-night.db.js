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
    async createEvent(groupId, hostId, eventTitle, eventDescription, eventDate, eventTime, eventLocation, eventImageUrl, rehostedFromEventId = null) {
      if (rehostedFromEventId) {
        const [sources] = await connection.query(
          `SELECT EVENT_ID, GROUP_ID FROM events
            WHERE EVENT_ID = ? AND HOST_ID = ? AND GROUP_ID = ?
              AND (EVENT_STATUS IN ('CANCELED', 'CANCELLED', 'COMPLETED') OR TIMESTAMP(EVENT_DATE, EVENT_TIME) <= NOW())`,
          [rehostedFromEventId, hostId, groupId]
        );
        if (!sources.length) throw new Error("Only the original host can rehost a past or cancelled event in the same group");
      }
      const [rows] = await connection.query("CALL CreateEvent(?, ?, ?, ?, ?, ?, ?)", [
        groupId, hostId, eventTitle, eventDescription, eventDate, eventTime, eventLocation
      ]);
      const event = firstProcedureRow(rows);
      if (event && eventImageUrl) {
        await connection.query("UPDATE events SET EVENT_IMAGE_URL = ? WHERE EVENT_ID = ? AND HOST_ID = ?", [eventImageUrl, event.EVENT_ID, hostId]);
        event.EVENT_IMAGE_URL = eventImageUrl;
      }
      if (event && rehostedFromEventId) {
        await connection.query("UPDATE events SET REHOSTED_FROM_EVENT_ID = ? WHERE EVENT_ID = ? AND HOST_ID = ?", [rehostedFromEventId, event.EVENT_ID, hostId]);
        event.REHOSTED_FROM_EVENT_ID = rehostedFromEventId;
      }
      return event;
    },
    async readGroupEvents(groupId) {
      const [rows] = await connection.query(
        `SELECT e.EVENT_ID, e.GROUP_ID, e.HOST_ID, u.EMAIL AS HOST_EMAIL,
                up.NICKNAME AS HOST_NICKNAME, up.FIRST_NAME AS HOST_FIRST_NAME,
                up.LAST_NAME AS HOST_LAST_NAME, up.IMAGE_URL AS HOST_IMAGE_URL,
                e.EVENT_TITLE, e.EVENT_DESCRIPTION, e.EVENT_DATE, e.EVENT_TIME,
                e.EVENT_LOCATION, e.EVENT_IMAGE_URL, e.REHOSTED_FROM_EVENT_ID,
                e.EVENT_STATUS, e.CREATED_AT,
                CASE
                  WHEN e.EVENT_STATUS IN ('CANCELED', 'CANCELLED') THEN 'CANCELED'
                  WHEN e.EVENT_STATUS = 'COMPLETED' OR TIMESTAMP(e.EVENT_DATE, e.EVENT_TIME) <= NOW() THEN 'PAST'
                  ELSE 'UPCOMING'
                END AS DISPLAY_STATUS
         FROM events e
         JOIN users u ON u.USER_ID = e.HOST_ID
         LEFT JOIN user_profile up ON up.USER_ID = e.HOST_ID
         WHERE e.GROUP_ID = ?
         ORDER BY e.EVENT_DATE, e.EVENT_TIME`,
        [groupId]
      );
      return rows;
    },
    async updateEvent(eventId, requestingUserId, eventTitle, eventDescription, eventDate, eventTime, eventLocation, eventImageUrl) {
      const [result] = await connection.query(
        `UPDATE events SET EVENT_TITLE = ?, EVENT_DESCRIPTION = ?, EVENT_DATE = ?, EVENT_TIME = ?, EVENT_LOCATION = ?, EVENT_IMAGE_URL = ?
         WHERE EVENT_ID = ? AND HOST_ID = ? AND EVENT_STATUS NOT IN ('CANCELED', 'CANCELLED', 'COMPLETED')
           AND TIMESTAMP(EVENT_DATE, EVENT_TIME) > NOW()`,
        [eventTitle, eventDescription, eventDate, eventTime, eventLocation, eventImageUrl, eventId, requestingUserId]
      );
      if (!result.affectedRows) return null;
      const [rows] = await connection.query("SELECT * FROM events WHERE EVENT_ID = ?", [eventId]);
      return rows[0] || null;
    },
    async updateEventImage(eventId, requestingUserId, eventImageUrl) {
      const [result] = await connection.query(
        `UPDATE events SET EVENT_IMAGE_URL = ?
          WHERE EVENT_ID = ? AND HOST_ID = ? AND EVENT_STATUS NOT IN ('CANCELED', 'CANCELLED', 'COMPLETED')
            AND TIMESTAMP(EVENT_DATE, EVENT_TIME) > NOW()`,
        [eventImageUrl, eventId, requestingUserId]
      );
      if (!result.affectedRows) return null;
      const [rows] = await connection.query("SELECT EVENT_ID, EVENT_IMAGE_URL FROM events WHERE EVENT_ID = ?", [eventId]);
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
