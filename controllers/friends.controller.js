const { pool } = require("../config/database");

function validId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function friendsHandlers(database = pool) {
  async function friendshipExists(userId, friendId) {
    const [rows] = await database.query(
      `SELECT 1 FROM (
         SELECT theirs.USER_ID AS FRIEND_USER_ID
           FROM group_members mine
           JOIN group_members theirs ON theirs.GROUP_ID = mine.GROUP_ID
          WHERE mine.USER_ID = ? AND theirs.USER_ID = ?
         UNION ALL
         SELECT FRIEND_USER_ID FROM direct_friends WHERE USER_ID = ? AND FRIEND_USER_ID = ?
       ) friendships LIMIT 1`,
      [userId, friendId, userId, friendId]
    );
    return rows.length > 0;
  }

  async function list(req, res) {
    try {
      const [rows] = await database.query(
        `SELECT other.USER_ID, other.EMAIL, up.FIRST_NAME, up.LAST_NAME, up.NICKNAME, up.IMAGE_URL,
                MAX(friendships.SHARED_GROUP_COUNT) AS SHARED_GROUP_COUNT,
                MIN(friendships.FRIENDS_SINCE) AS FRIENDS_SINCE,
                CASE WHEN hidden.FRIEND_USER_ID IS NULL THEN 0 ELSE 1 END AS IS_HIDDEN,
                notes.NOTE AS FRIEND_NOTE
           FROM (
             SELECT theirs.USER_ID AS FRIEND_USER_ID,
                    COUNT(DISTINCT mine.GROUP_ID) AS SHARED_GROUP_COUNT,
                    MIN(GREATEST(mine.CREATED_AT, theirs.CREATED_AT)) AS FRIENDS_SINCE
               FROM group_members mine
               JOIN group_members theirs ON theirs.GROUP_ID = mine.GROUP_ID AND theirs.USER_ID <> mine.USER_ID
              WHERE mine.USER_ID = ?
              GROUP BY theirs.USER_ID
             UNION ALL
             SELECT FRIEND_USER_ID, 0 AS SHARED_GROUP_COUNT, CREATED_AT AS FRIENDS_SINCE
               FROM direct_friends WHERE USER_ID = ?
           ) friendships
           JOIN users other ON other.USER_ID = friendships.FRIEND_USER_ID
           LEFT JOIN user_profile up ON up.USER_ID = other.USER_ID
           LEFT JOIN hidden_friends hidden ON hidden.USER_ID = ? AND hidden.FRIEND_USER_ID = other.USER_ID
           LEFT JOIN friend_notes notes ON notes.USER_ID = ? AND notes.FRIEND_USER_ID = other.USER_ID
          GROUP BY other.USER_ID, other.EMAIL, up.FIRST_NAME, up.LAST_NAME, up.NICKNAME, up.IMAGE_URL, hidden.FRIEND_USER_ID, notes.NOTE
          ORDER BY COALESCE(up.NICKNAME, up.FIRST_NAME, other.EMAIL)`,
        [req.auth.userId, req.auth.userId, req.auth.userId, req.auth.userId]
      );
      return res.json({ success: true, message: "Friends loaded successfully", data: rows });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.sqlMessage || error.message });
    }
  }

  async function add(req, res) {
    const lookup = String(req.body && (req.body.friendQuery ?? req.body.query) || "").trim();
    if (!lookup) return res.status(400).json({ success: false, message: "Enter a user ID, full name, nickname, or email" });
    try {
      const numericUserId = /^\d+$/.test(lookup) ? Number(lookup) : null;
      const [matches] = numericUserId
        ? await database.query(
          `SELECT u.USER_ID, u.EMAIL, up.FIRST_NAME, up.LAST_NAME, up.NICKNAME, up.IMAGE_URL
             FROM users u LEFT JOIN user_profile up ON up.USER_ID = u.USER_ID WHERE u.USER_ID = ?`,
          [numericUserId]
        )
        : await database.query(
          `SELECT u.USER_ID, u.EMAIL, up.FIRST_NAME, up.LAST_NAME, up.NICKNAME, up.IMAGE_URL
             FROM users u LEFT JOIN user_profile up ON up.USER_ID = u.USER_ID
            WHERE LOWER(u.EMAIL) = LOWER(?) OR LOWER(up.NICKNAME) = LOWER(?)
               OR LOWER(TRIM(CONCAT_WS(' ', up.FIRST_NAME, up.LAST_NAME))) = LOWER(?)
            LIMIT 2`,
          [lookup, lookup, lookup]
        );
      if (!matches.length) return res.status(404).json({ success: false, message: "No user matches that ID, name, nickname, or email" });
      if (matches.length > 1) return res.status(409).json({ success: false, message: "More than one user has that name. Use their email or user ID" });
      const friend = matches[0];
      if (Number(friend.USER_ID) === req.auth.userId) return res.status(400).json({ success: false, message: "You cannot add yourself as a friend" });

      const [result] = await database.query(
        `INSERT IGNORE INTO direct_friends (USER_ID, FRIEND_USER_ID) VALUES (?, ?), (?, ?)`,
        [req.auth.userId, friend.USER_ID, friend.USER_ID, req.auth.userId]
      );
      return res.status(result.affectedRows ? 201 : 200).json({
        success: true,
        message: result.affectedRows ? "Friend added successfully" : "This user is already your friend",
        data: { ...friend, SHARED_GROUP_COUNT: 0, IS_HIDDEN: 0, FRIEND_NOTE: null, ALREADY_FRIEND: !result.affectedRows }
      });
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
      if (!await friendshipExists(req.auth.userId, friendId)) return res.status(404).json({ success: false, message: "This user is not in your friends list" });
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
      if (!await friendshipExists(req.auth.userId, friendId)) return res.status(404).json({ success: false, message: "This user is not in your friends list" });
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

  return { list, add, setHidden, saveNote };
}

module.exports = { friendsHandlers };
