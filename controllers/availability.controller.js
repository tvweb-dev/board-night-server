const { pool } = require("../config/database");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUSES = new Set(["AVAILABLE", "UNAVAILABLE", "LIMITED"]);

function availabilityHandlers(database = pool) {
  async function list(req, res) {
    const start = String(req.query.start || "");
    const end = String(req.query.end || "");
    if (!DATE_PATTERN.test(start) || !DATE_PATTERN.test(end) || start > end) {
      return res.status(400).json({ success: false, message: "Valid start and end dates are required" });
    }
    try {
      const [rows] = await database.query(
        `SELECT ua.AVAILABILITY_ID, ua.USER_ID, ua.AVAILABILITY_DATE, ua.AVAILABILITY_STATUS,
                ua.START_TIME, ua.END_TIME, ua.NOTE, u.EMAIL,
                up.FIRST_NAME, up.LAST_NAME, up.NICKNAME, up.IMAGE_URL
           FROM user_availability ua
           JOIN users u ON u.USER_ID = ua.USER_ID
           LEFT JOIN user_profile up ON up.USER_ID = ua.USER_ID
          WHERE ua.AVAILABILITY_DATE BETWEEN ? AND ?
            AND (ua.USER_ID = ? OR EXISTS (
              SELECT 1 FROM group_members mine
              JOIN group_members theirs ON theirs.GROUP_ID = mine.GROUP_ID
              WHERE mine.USER_ID = ? AND theirs.USER_ID = ua.USER_ID
            ))
          ORDER BY ua.AVAILABILITY_DATE, COALESCE(up.NICKNAME, up.FIRST_NAME, u.EMAIL)`,
        [start, end, req.auth.userId, req.auth.userId]
      );
      return res.json({ success: true, message: "Availability loaded successfully", data: rows });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.sqlMessage || error.message });
    }
  }

  async function save(req, res) {
    const date = String(req.params.date || "");
    const status = String(req.body && req.body.status || "").toUpperCase();
    const note = String(req.body && req.body.note || "").trim();
    const startTime = String(req.body && req.body.startTime || "").trim();
    const endTime = String(req.body && req.body.endTime || "").trim();
    if (!DATE_PATTERN.test(date)) return res.status(400).json({ success: false, message: "A valid availability date is required" });
    if (!STATUSES.has(status)) return res.status(400).json({ success: false, message: "Status must be Available, Unavailable, or Limited" });
    if (note.length > 250) return res.status(400).json({ success: false, message: "Note must be 250 characters or fewer" });
    if (status === "LIMITED" && (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime) || startTime >= endTime)) {
      return res.status(400).json({ success: false, message: "Limited availability requires a valid start and end time" });
    }
    const savedStart = status === "LIMITED" ? startTime : null;
    const savedEnd = status === "LIMITED" ? endTime : null;
    try {
      await database.query(
        `INSERT INTO user_availability (USER_ID, AVAILABILITY_DATE, AVAILABILITY_STATUS, START_TIME, END_TIME, NOTE)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE AVAILABILITY_STATUS = VALUES(AVAILABILITY_STATUS), START_TIME = VALUES(START_TIME),
                                 END_TIME = VALUES(END_TIME), NOTE = VALUES(NOTE)`,
        [req.auth.userId, date, status, savedStart, savedEnd, note || null]
      );
      const [rows] = await database.query(
        "SELECT * FROM user_availability WHERE USER_ID = ? AND AVAILABILITY_DATE = ?",
        [req.auth.userId, date]
      );
      return res.json({ success: true, message: "Schedule updated successfully", data: rows[0] });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.sqlMessage || error.message });
    }
  }

  return { list, save };
}

module.exports = { availabilityHandlers };
