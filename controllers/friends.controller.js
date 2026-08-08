const { pool } = require("../config/database");

function validId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function friendsHandlers(database = pool) {
  async function list(req, res) {
    try {
      const [rows] = await database.query(
        `SELECT other.USER_ID, other.EMAIL, up.FIRST_NAME, up.LAST_NAME, up.NICKNAME, up.IMAGE_URL,
                COUNT(DISTINCT mine.GROUP_ID) AS SHARED_GROUP_COUNT,
                MIN(GREATEST(mine.CREATED_AT, theirs.CREATED_AT)) AS FRIENDS_SINCE,
                CASE WHEN hidden.FRIEND_USER_ID IS NULL THEN 0 ELSE 1 END AS IS_HIDDEN,
                notes.NOTE AS FRIEND_NOTE
           FROM group_members mine
           JOIN group_members theirs ON theirs.GROUP_ID = mine.GROUP_ID AND theirs.USER_ID <> mine.USER_ID
           JOIN users other ON other.USER_ID = theirs.USER_ID
           LEFT JOIN user_profile up ON up.USER_ID = other.USER_ID
           LEFT JOIN hidden_friends hidden ON hidden.USER_ID = mine.USER_ID AND hidden.FRIEND_USER_ID = other.USER_ID
           LEFT JOIN friend_notes notes ON notes.USER_ID = mine.USER_ID AND notes.FRIEND_USER_ID = other.USER_ID
          WHERE mine.USER_ID = ?
          GROUP BY other.USER_ID, other.EMAIL, up.FIRST_NAME, up.LAST_NAME, up.NICKNAME, up.IMAGE_URL, hidden.FRIEND_USER_ID, notes.NOTE
          ORDER BY COALESCE(up.NICKNAME, up.FIRST_NAME, other.EMAIL)`,
        [req.auth.userId]
      );
      return res.json({ success: true, message: "Friends loaded successfully", data: rows });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.sqlMessage || error.message });
    }
  }

  async function setHidden(req, res) {
    const friendId = validId(req.params.friendId);
    if (!friendId || friendId === req.auth.userId) return res.status(400).json({ success: false, message: "A valid friend ID is required" });
    const hidden = req.body && req.body.hidden;
    if (typeof hidden !== "boolean") return res.status(400).json({ success: false, message: "hidden must be true or false" });
    try {
      const [sharedGroups] = await database.query(
        `SELECT 1 FROM group_members mine
          JOIN group_members theirs ON theirs.GROUP_ID = mine.GROUP_ID
         WHERE mine.USER_ID = ? AND theirs.USER_ID = ? LIMIT 1`,
        [req.auth.userId, friendId]
      );
      if (!sharedGroups.length) return res.status(404).json({ success: false, message: "This user does not share a group with you" });
      if (hidden) {
        await database.query(
          "INSERT INTO hidden_friends (USER_ID, FRIEND_USER_ID) VALUES (?, ?) ON DUPLICATE KEY UPDATE HIDDEN_AT = HIDDEN_AT",
          [req.auth.userId, friendId]
        );
      } else {
        await database.query("DELETE FROM hidden_friends WHERE USER_ID = ? AND FRIEND_USER_ID = ?", [req.auth.userId, friendId]);
      }
      return res.json({ success: true, message: hidden ? "Friend hidden" : "Friend shown", data: { USER_ID: friendId, IS_HIDDEN: hidden } });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.sqlMessage || error.message });
    }
  }

  async function saveNote(req, res) {
    const friendId = validId(req.params.friendId);
    if (!friendId || friendId === req.auth.userId) return res.status(400).json({ success: false, message: "A valid friend ID is required" });
    const note = String(req.body && req.body.note || "").trim();
    if (note.length > 300) return res.status(400).json({ success: false, message: "Friend note must be 300 characters or fewer" });
    try {
      const [sharedGroups] = await database.query(
        `SELECT 1 FROM group_members mine JOIN group_members theirs ON theirs.GROUP_ID = mine.GROUP_ID
          WHERE mine.USER_ID = ? AND theirs.USER_ID = ? LIMIT 1`,
        [req.auth.userId, friendId]
      );
      if (!sharedGroups.length) return res.status(404).json({ success: false, message: "This user does not share a group with you" });
      if (note) {
        await database.query(
          `INSERT INTO friend_notes (USER_ID, FRIEND_USER_ID, NOTE) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE NOTE = VALUES(NOTE)`,
          [req.auth.userId, friendId, note]
        );
      } else {
        await database.query("DELETE FROM friend_notes WHERE USER_ID = ? AND FRIEND_USER_ID = ?", [req.auth.userId, friendId]);
      }
      return res.json({ success: true, message: note ? "Friend note saved" : "Friend note removed", data: { USER_ID: friendId, FRIEND_NOTE: note } });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.sqlMessage || error.message });
    }
  }

  return { list, setHidden, saveNote };
}

module.exports = { friendsHandlers };
