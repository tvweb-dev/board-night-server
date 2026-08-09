const { pool } = require("../config/database");

function createNotificationHandlers(database = pool) {
  return {
    async list(req, res) {
      try {
        const unreadOnly = req.query.unread === "true";
        const [rows] = await database.query(
          `SELECT NOTIFICATION_ID, TYPE, TITLE, MESSAGE, GROUP_ID, EVENT_ID,
                  ACTOR_USER_ID, IS_READ, CREATED_AT, READ_AT
             FROM notifications
            WHERE USER_ID = ? ${unreadOnly ? "AND IS_READ = 0" : ""}
            ORDER BY CREATED_AT DESC, NOTIFICATION_ID DESC`,
          [req.auth.userId]
        );
        return res.json({ success: true, message: "Notifications loaded successfully", data: rows });
      } catch (error) {
        return res.status(400).json({ success: false, message: error.sqlMessage || error.message || "Database error" });
      }
    },

    async markRead(req, res) {
      const notificationId = Number(req.params.notificationId);
      if (!Number.isInteger(notificationId) || notificationId < 1) {
        return res.status(400).json({ success: false, message: "A valid notification ID is required" });
      }
      try {
        const [result] = await database.query(
          "UPDATE notifications SET IS_READ = 1, READ_AT = COALESCE(READ_AT, NOW()) WHERE NOTIFICATION_ID = ? AND USER_ID = ?",
          [notificationId, req.auth.userId]
        );
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Notification not found" });
        return res.json({ success: true, message: "Notification marked as read" });
      } catch (error) {
        return res.status(400).json({ success: false, message: error.sqlMessage || error.message || "Database error" });
      }
    },

    async markAllRead(req, res) {
      try {
        const [result] = await database.query(
          "UPDATE notifications SET IS_READ = 1, READ_AT = COALESCE(READ_AT, NOW()) WHERE USER_ID = ? AND IS_READ = 0",
          [req.auth.userId]
        );
        return res.json({ success: true, message: "Notifications marked as read", updated: result.affectedRows });
      } catch (error) {
        return res.status(400).json({ success: false, message: error.sqlMessage || error.message || "Database error" });
      }
    },

    async respondToGroupInvitation(req, res) {
      const notificationId = Number(req.params.notificationId);
      const decision = String(req.body && req.body.decision || "").toUpperCase();
      if (!Number.isInteger(notificationId) || notificationId < 1) {
        return res.status(400).json({ success: false, message: "A valid notification ID is required" });
      }
      if (!['JOIN', 'DECLINE'].includes(decision)) {
        return res.status(400).json({ success: false, message: "Decision must be JOIN or DECLINE" });
      }

      const connection = database.getConnection ? await database.getConnection() : database;
      try {
        if (connection.beginTransaction) await connection.beginTransaction();
        const [rows] = await connection.query(
          `SELECT n.GROUP_ID, g.CREATED_BY
             FROM notifications n
             JOIN \`groups\` g ON g.GROUP_ID = n.GROUP_ID
            WHERE n.NOTIFICATION_ID = ? AND n.USER_ID = ? AND n.TYPE = 'GROUP_MEMBER_ADDED'
            FOR UPDATE`,
          [notificationId, req.auth.userId]
        );
        if (!rows.length) {
          if (connection.rollback) await connection.rollback();
          return res.status(404).json({ success: false, message: "Group invitation not found" });
        }

        const groupId = Number(rows[0].GROUP_ID);
        if (decision === 'DECLINE') {
          if (Number(rows[0].CREATED_BY) === req.auth.userId) {
            if (connection.rollback) await connection.rollback();
            return res.status(403).json({ success: false, message: "The group creator cannot decline their own group" });
          }
          await connection.query(
            `DELETE ei FROM event_invites ei
              JOIN events e ON e.EVENT_ID = ei.EVENT_ID
             WHERE e.GROUP_ID = ? AND ei.USER_ID = ?`,
            [groupId, req.auth.userId]
          );
          await connection.query("DELETE FROM group_members WHERE GROUP_ID = ? AND USER_ID = ?", [groupId, req.auth.userId]);
        }
        await connection.query(
          "UPDATE notifications SET IS_READ = 1, READ_AT = COALESCE(READ_AT, NOW()) WHERE NOTIFICATION_ID = ? AND USER_ID = ?",
          [notificationId, req.auth.userId]
        );
        if (connection.commit) await connection.commit();
        return res.json({
          success: true,
          message: decision === 'JOIN' ? "Group invitation accepted" : "Group invitation declined",
          data: { GROUP_ID: groupId, DECISION: decision }
        });
      } catch (error) {
        if (connection.rollback) await connection.rollback();
        return res.status(400).json({ success: false, message: error.sqlMessage || error.message || "Database error" });
      } finally {
        if (connection.release) connection.release();
      }
    }
  };
}

const handlers = createNotificationHandlers();
module.exports = { list: handlers.list, markRead: handlers.markRead, markAllRead: handlers.markAllRead, respondToGroupInvitation: handlers.respondToGroupInvitation, createNotificationHandlers };
