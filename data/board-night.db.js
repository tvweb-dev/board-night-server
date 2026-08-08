const { pool } = require("../config/database");

function procedureRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.find((item) => Array.isArray(item)) || [];
}

function firstProcedureRow(rows) {
  return procedureRows(rows)[0] || null;
}

function withGame(row) {
  if (!row) return null;
  const game = row.GAME_ID == null ? null : {
    GAME_ID: row.GAME_ID, GAME_NAME: row.GAME_NAME, CATEGORY: row.GAME_CATEGORY,
    DESCRIPTION: row.GAME_DESCRIPTION, THUMBNAIL_URL: row.GAME_THUMBNAIL_URL,
    IMAGE_URL: row.GAME_IMAGE_URL, MIN_PLAYERS: row.GAME_MIN_PLAYERS,
    MAX_PLAYERS: row.GAME_MAX_PLAYERS, MIN_PLAYTIME: row.GAME_MIN_PLAYTIME,
    MAX_PLAYTIME: row.GAME_MAX_PLAYTIME, MIN_AGE: row.GAME_MIN_AGE,
    YEAR_PUBLISHED: row.GAME_YEAR_PUBLISHED, MECHANICS: row.GAME_MECHANICS,
    DESIGNERS: row.GAME_DESIGNERS, PUBLISHERS: row.GAME_PUBLISHERS,
    AVERAGE_RATING: row.GAME_AVERAGE_RATING, RULES_URL: row.GAME_RULES_URL
  };
  const event = { ...row, GAME: game };
  for (const field of [
    "GAME_NAME", "GAME_CATEGORY", "GAME_DESCRIPTION", "GAME_THUMBNAIL_URL", "GAME_IMAGE_URL",
    "GAME_MIN_PLAYERS", "GAME_MAX_PLAYERS", "GAME_MIN_PLAYTIME", "GAME_MAX_PLAYTIME",
    "GAME_MIN_AGE", "GAME_YEAR_PUBLISHED", "GAME_MECHANICS", "GAME_DESIGNERS",
    "GAME_PUBLISHERS", "GAME_AVERAGE_RATING", "GAME_RULES_URL"
  ]) delete event[field];
  return event;
}

function createDatabase(connection = pool) {
  return {
    async createEvent(groupId, hostId, eventTitle, eventDescription, eventDate, eventTime, eventLocation, eventImageUrl, rehostedFromEventId = null, gameId = null) {
      if (rehostedFromEventId) {
        const [sources] = await connection.query(
          `SELECT EVENT_ID, GROUP_ID FROM events
            WHERE EVENT_ID = ? AND HOST_ID = ? AND GROUP_ID = ?
              AND (EVENT_STATUS IN ('CANCELED', 'CANCELLED', 'COMPLETED') OR TIMESTAMP(EVENT_DATE, EVENT_TIME) <= NOW())`,
          [rehostedFromEventId, hostId, groupId]
        );
        if (!sources.length) throw new Error("Only the original host can rehost a past or cancelled event in the same group");
      }
      if (gameId != null) {
        const [games] = await connection.query("SELECT GAME_ID FROM games WHERE GAME_ID = ?", [gameId]);
        if (!games.length) throw new Error("Game not found");
      }
      const procedure = gameId == null ? "CALL CreateEvent(?, ?, ?, ?, ?, ?, ?)" : "CALL CreateEventWithGame(?, ?, ?, ?, ?, ?, ?, ?)";
      const parameters = gameId == null
        ? [groupId, hostId, eventTitle, eventDescription, eventDate, eventTime, eventLocation]
        : [groupId, hostId, eventTitle, eventDescription, gameId, eventDate, eventTime, eventLocation];
      const [rows] = await connection.query(procedure, parameters);
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
                e.EVENT_LOCATION, e.EVENT_IMAGE_URL, e.REHOSTED_FROM_EVENT_ID, e.GAME_ID,
                game.GAME_NAME, game.THUMBNAIL_URL AS GAME_THUMBNAIL_URL,
                game.MIN_PLAYERS AS GAME_MIN_PLAYERS, game.MAX_PLAYERS AS GAME_MAX_PLAYERS,
                game.MIN_PLAYTIME AS GAME_MIN_PLAYTIME, game.MAX_PLAYTIME AS GAME_MAX_PLAYTIME,
                e.EVENT_STATUS, e.CREATED_AT,
                CASE
                  WHEN e.EVENT_STATUS IN ('CANCELED', 'CANCELLED') THEN 'CANCELED'
                  WHEN e.EVENT_STATUS = 'COMPLETED' OR TIMESTAMP(e.EVENT_DATE, e.EVENT_TIME) <= NOW() THEN 'PAST'
                  ELSE 'UPCOMING'
                END AS DISPLAY_STATUS
         FROM events e
         JOIN users u ON u.USER_ID = e.HOST_ID
         LEFT JOIN user_profile up ON up.USER_ID = e.HOST_ID
         LEFT JOIN games game ON game.GAME_ID = e.GAME_ID
         WHERE e.GROUP_ID = ?
         ORDER BY e.EVENT_DATE, e.EVENT_TIME`,
        [groupId]
      );
      return rows;
    },
    async readUserEvents(userId) {
      const [rows] = await connection.query(
        `SELECT e.EVENT_ID, e.GROUP_ID, e.HOST_ID, g.GROUP_NAME, u.EMAIL AS HOST_EMAIL,
                up.NICKNAME AS HOST_NICKNAME, up.FIRST_NAME AS HOST_FIRST_NAME,
                up.LAST_NAME AS HOST_LAST_NAME, up.IMAGE_URL AS HOST_IMAGE_URL,
                e.EVENT_TITLE, e.EVENT_DESCRIPTION, e.EVENT_DATE, e.EVENT_TIME,
                e.EVENT_LOCATION, e.EVENT_IMAGE_URL, e.REHOSTED_FROM_EVENT_ID, e.GAME_ID,
                game.GAME_NAME, game.THUMBNAIL_URL AS GAME_THUMBNAIL_URL,
                game.MIN_PLAYERS AS GAME_MIN_PLAYERS, game.MAX_PLAYERS AS GAME_MAX_PLAYERS,
                game.MIN_PLAYTIME AS GAME_MIN_PLAYTIME, game.MAX_PLAYTIME AS GAME_MAX_PLAYTIME,
                e.EVENT_STATUS, e.CREATED_AT,
                CASE
                  WHEN e.EVENT_STATUS IN ('CANCELED', 'CANCELLED') THEN 'CANCELED'
                  WHEN e.EVENT_STATUS = 'COMPLETED' OR TIMESTAMP(e.EVENT_DATE, e.EVENT_TIME) <= NOW() THEN 'PAST'
                  ELSE 'UPCOMING'
                END AS DISPLAY_STATUS
           FROM events e
           JOIN \`groups\` g ON g.GROUP_ID = e.GROUP_ID
           JOIN users u ON u.USER_ID = e.HOST_ID
           LEFT JOIN user_profile up ON up.USER_ID = e.HOST_ID
           LEFT JOIN games game ON game.GAME_ID = e.GAME_ID
           LEFT JOIN event_invites mine ON mine.EVENT_ID = e.EVENT_ID AND mine.USER_ID = ?
          WHERE e.HOST_ID = ? OR mine.INVITE_ID IS NOT NULL
          ORDER BY e.EVENT_DATE, e.EVENT_TIME`,
        [userId, userId]
      );
      return rows;
    },
    async readEvent(eventId) {
      const [rows] = await connection.query(
        `SELECT e.*, g.GROUP_NAME, u.EMAIL AS HOST_EMAIL, up.NICKNAME AS HOST_NICKNAME,
                up.FIRST_NAME AS HOST_FIRST_NAME, up.LAST_NAME AS HOST_LAST_NAME,
                up.IMAGE_URL AS HOST_IMAGE_URL, game.GAME_NAME,
                game.CATEGORY AS GAME_CATEGORY, game.DESCRIPTION AS GAME_DESCRIPTION,
                game.THUMBNAIL_URL AS GAME_THUMBNAIL_URL, game.IMAGE_URL AS GAME_IMAGE_URL,
                game.MIN_PLAYERS AS GAME_MIN_PLAYERS, game.MAX_PLAYERS AS GAME_MAX_PLAYERS,
                game.MIN_PLAYTIME AS GAME_MIN_PLAYTIME, game.MAX_PLAYTIME AS GAME_MAX_PLAYTIME,
                game.MIN_AGE AS GAME_MIN_AGE, game.YEAR_PUBLISHED AS GAME_YEAR_PUBLISHED,
                game.MECHANICS AS GAME_MECHANICS, game.DESIGNERS AS GAME_DESIGNERS,
                game.PUBLISHERS AS GAME_PUBLISHERS, game.AVERAGE_RATING AS GAME_AVERAGE_RATING,
                game.RULES_URL AS GAME_RULES_URL
           FROM events e JOIN \`groups\` g ON g.GROUP_ID = e.GROUP_ID
           JOIN users u ON u.USER_ID = e.HOST_ID LEFT JOIN user_profile up ON up.USER_ID = e.HOST_ID
           LEFT JOIN games game ON game.GAME_ID = e.GAME_ID WHERE e.EVENT_ID = ?`, [eventId]
      );
      return withGame(rows[0]);
    },
    async setEventGame(eventId, requestingUserId, gameId) {
      const [events] = await connection.query("SELECT EVENT_ID, HOST_ID, EVENT_STATUS, TIMESTAMP(EVENT_DATE, EVENT_TIME) <= NOW() AS HAS_STARTED FROM events WHERE EVENT_ID = ?", [eventId]);
      if (!events.length) throw new Error("Event not found");
      const event = events[0];
      if (Number(event.HOST_ID) !== requestingUserId) throw new Error("Requesting user is not the current host");
      if (["CANCELED", "CANCELLED", "COMPLETED"].includes(event.EVENT_STATUS)) throw new Error("Event is cancelled or completed");
      if (Number(event.HAS_STARTED)) throw new Error("Event already started");
      if (gameId != null) {
        const [games] = await connection.query("SELECT GAME_ID FROM games WHERE GAME_ID = ?", [gameId]);
        if (!games.length) throw new Error("Game not found");
      }
      const [result] = await connection.query(
        `UPDATE events SET GAME_ID = ? WHERE EVENT_ID = ? AND HOST_ID = ?
          AND EVENT_STATUS NOT IN ('CANCELED', 'CANCELLED', 'COMPLETED')
          AND TIMESTAMP(EVENT_DATE, EVENT_TIME) > NOW()`, [gameId, eventId, requestingUserId]
      );
      if (!result.affectedRows) throw new Error("Event can no longer be modified");
      return this.readEvent(eventId);
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

module.exports = { DB, createDatabase, firstProcedureRow, procedureRows, withGame };
