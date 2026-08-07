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
    }
  };
}

const handlers = createNotificationHandlers();
module.exports = { list: handlers.list, markRead: handlers.markRead, markAllRead: handlers.markAllRead, createNotificationHandlers };
