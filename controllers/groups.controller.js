const { pool } = require("../config/database");
const notifications = require("../services/notification.service");
const { normalizeImageUrl } = require("../utils/image-url");

function unwrapProcedureResult(rows) {
  return rows && rows[0] ? rows[0] : [];
}

function getFirstResult(rows) {
  const result = unwrapProcedureResult(rows);
  return result && result[0] ? result[0] : null;
}

function handleDbError(res, error, statusCode = 400) {
  return res.status(statusCode).json({
    success: false,
    message: error.sqlMessage || error.message || "Database error"
  });
}

async function listGroups(req, res) {
  res.json({
    success: true,
    message: "Groups endpoint ready",
    data: []
  });
}

async function createGroup(req, res) {
  try {
    const { groupName, groupImageUrl } = req.body;
    const createdBy = req.auth.userId;
    const imageUrl = normalizeImageUrl(groupImageUrl, "groupImageUrl");

    const [rows] = await pool.query("CALL CreateGroup(?, ?)", [
      groupName,
      createdBy
    ]);

    const group = getFirstResult(rows);
    if (group && imageUrl) {
      await pool.query("UPDATE `groups` SET GROUP_IMAGE_URL = ? WHERE GROUP_ID = ? AND CREATED_BY = ?", [imageUrl, group.GROUP_ID, createdBy]);
      group.GROUP_IMAGE_URL = imageUrl;
    }
    res.status(201).json({
      success: true,
      message: "Group created successfully",
      data: group
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

async function readUserGroups(req, res) {
  try {
    const { userId } = req.params;

    const [rows] = await pool.query(
      `SELECT g.*, gm.MEMBER_ROLE
         FROM group_members gm JOIN \`groups\` g ON g.GROUP_ID = gm.GROUP_ID
        WHERE gm.USER_ID = ? ORDER BY g.GROUP_NAME`,
      [userId]
    );

    res.json({
      success: true,
      message: "User groups loaded successfully",
      data: rows
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

function updateGroupImageHandler(database = pool) {
  return async function updateGroupImage(req, res) {
    const groupId = Number(req.params.groupId);
    if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ success: false, message: "A valid group ID is required" });
    try {
      const imageUrl = normalizeImageUrl(req.body && req.body.groupImageUrl, "groupImageUrl");
      const [result] = await database.query(
        "UPDATE `groups` SET GROUP_IMAGE_URL = ? WHERE GROUP_ID = ? AND CREATED_BY = ?",
        [imageUrl, groupId, req.auth.userId]
      );
      if (!result.affectedRows) return res.status(403).json({ success: false, message: "Only the group creator can update the group image" });
      return res.json({ success: true, message: "Group image updated successfully", data: { GROUP_ID: groupId, GROUP_IMAGE_URL: imageUrl } });
    } catch (error) {
      return handleDbError(res, error);
    }
  };
}

const updateGroupImage = updateGroupImageHandler();

function addGroupMemberHandler(database = pool, notificationService = notifications) {
  return async function addGroupMember(req, res) {
  try {
    const { groupId, userId, memberQuery, memberRole } = req.body || {};
    const lookup = String(memberQuery ?? userId ?? "").trim();
    if (!lookup) return res.status(400).json({ success: false, message: "Enter an existing user ID, email, nickname, or full name" });
    const [ownedGroups] = await database.query(
      "SELECT GROUP_ID FROM `groups` WHERE GROUP_ID = ? AND CREATED_BY = ?",
      [groupId, req.auth.userId]
    );
    if (!ownedGroups.length) {
      return res.status(403).json({ success: false, message: "Only the group host can add members" });
    }

    const numericUserId = /^\d+$/.test(lookup) ? Number(lookup) : null;
    const [matchedUsers] = numericUserId
      ? await database.query("SELECT USER_ID FROM users WHERE USER_ID = ?", [numericUserId])
      : await database.query(
        `SELECT u.USER_ID FROM users u
          LEFT JOIN user_profile up ON up.USER_ID = u.USER_ID
         WHERE LOWER(u.EMAIL) = LOWER(?)
            OR LOWER(up.NICKNAME) = LOWER(?)
            OR LOWER(TRIM(CONCAT_WS(' ', up.FIRST_NAME, up.LAST_NAME))) = LOWER(?)
         LIMIT 2`,
        [lookup, lookup, lookup]
      );
    if (!matchedUsers.length) return res.status(404).json({ success: false, message: "No existing user matches that ID, email, nickname, or name" });
    if (matchedUsers.length > 1) return res.status(409).json({ success: false, message: "More than one user has that display name. Use their email or user ID" });
    const resolvedUserId = Number(matchedUsers[0].USER_ID);

    const [rows] = await database.query("CALL AddGroupMember(?, ?, ?)", [
      groupId,
      resolvedUserId,
      memberRole || "MEMBER"
    ]);

    await notificationService.notifyGroupMemberAdded(database, {
      userId: resolvedUserId, groupId: Number(groupId), actorUserId: req.auth.userId
    });

    res.status(201).json({
      success: true,
      message: "Member added successfully",
      data: getFirstResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
  };
}

const addGroupMember = addGroupMemberHandler();

function removeGroupMemberHandler(database = pool) {
  return async function removeGroupMember(req, res) {
    const groupId = Number(req.params.groupId);
    const memberId = Number(req.params.userId);
    if (!Number.isInteger(groupId) || groupId < 1 || !Number.isInteger(memberId) || memberId < 1) return res.status(400).json({ success: false, message: "Valid group and member IDs are required" });
    if (memberId === req.auth.userId) return res.status(400).json({ success: false, message: "You cannot remove yourself from the group" });
    const connection = database.getConnection ? await database.getConnection() : database;
    try {
      if (connection.beginTransaction) await connection.beginTransaction();
      const [permissions] = await connection.query(
        `SELECT g.CREATED_BY,
                EXISTS(SELECT 1 FROM events e WHERE e.GROUP_ID = g.GROUP_ID AND e.HOST_ID = ?
                  AND e.EVENT_STATUS NOT IN ('CANCELED', 'CANCELLED', 'COMPLETED')
                  AND TIMESTAMP(e.EVENT_DATE, e.EVENT_TIME) > NOW()) AS IS_EVENT_HOST
           FROM \`groups\` g WHERE g.GROUP_ID = ? FOR UPDATE`,
        [req.auth.userId, groupId]
      );
      if (!permissions.length) {
        if (connection.rollback) await connection.rollback();
        return res.status(404).json({ success: false, message: "Group not found" });
      }
      const permission = permissions[0];
      if (Number(permission.CREATED_BY) !== req.auth.userId && !Number(permission.IS_EVENT_HOST)) {
        if (connection.rollback) await connection.rollback();
        return res.status(403).json({ success: false, message: "Only the group creator or an event host can remove members" });
      }
      if (Number(permission.CREATED_BY) === memberId) {
        if (connection.rollback) await connection.rollback();
        return res.status(403).json({ success: false, message: "The group creator cannot be removed" });
      }
      await connection.query(
        `DELETE ei FROM event_invites ei JOIN events e ON e.EVENT_ID = ei.EVENT_ID
          WHERE e.GROUP_ID = ? AND ei.USER_ID = ?`,
        [groupId, memberId]
      );
      const [result] = await connection.query("DELETE FROM group_members WHERE GROUP_ID = ? AND USER_ID = ?", [groupId, memberId]);
      if (!result.affectedRows) {
        if (connection.rollback) await connection.rollback();
        return res.status(404).json({ success: false, message: "Group member not found" });
      }
      if (connection.commit) await connection.commit();
      return res.json({ success: true, message: "Member removed successfully", data: { GROUP_ID: groupId, USER_ID: memberId } });
    } catch (error) {
      if (connection.rollback) await connection.rollback();
      return handleDbError(res, error);
    } finally {
      if (connection.release) connection.release();
    }
  };
}

const removeGroupMember = removeGroupMemberHandler();

async function readGroupMembers(req, res) {
  try {
    const { groupId } = req.params;

    const [rows] = await pool.query(
      `SELECT gm.*, u.EMAIL, up.FIRST_NAME, up.LAST_NAME, up.NICKNAME, up.IMAGE_URL
         FROM group_members gm
         JOIN users u ON u.USER_ID = gm.USER_ID
         LEFT JOIN user_profile up ON up.USER_ID = gm.USER_ID
        WHERE gm.GROUP_ID = ?
        ORDER BY CASE WHEN gm.MEMBER_ROLE = 'HOST' THEN 0 ELSE 1 END,
                 COALESCE(up.NICKNAME, up.FIRST_NAME, u.EMAIL)`,
      [groupId]
    );

    res.json({
      success: true,
      message: "Group members loaded successfully",
      data: rows
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

module.exports = {
  listGroups,
  createGroup,
  readUserGroups,
  addGroupMember,
  addGroupMemberHandler,
  removeGroupMember,
  removeGroupMemberHandler,
  readGroupMembers,
  updateGroupImage,
  updateGroupImageHandler
};
