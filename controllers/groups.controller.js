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

async function addGroupMember(req, res) {
  try {
    const { groupId, userId, memberRole } = req.body;
    const [ownedGroups] = await pool.query(
      "SELECT GROUP_ID FROM `groups` WHERE GROUP_ID = ? AND CREATED_BY = ?",
      [groupId, req.auth.userId]
    );
    if (!ownedGroups.length) {
      return res.status(403).json({ success: false, message: "Only the group host can add members" });
    }

    const [rows] = await pool.query("CALL AddGroupMember(?, ?, ?)", [
      groupId,
      userId,
      memberRole || "MEMBER"
    ]);

    await notifications.notifyGroupMemberAdded(pool, {
      userId: Number(userId), groupId: Number(groupId), actorUserId: req.auth.userId
    });

    res.status(201).json({
      success: true,
      message: "Member added successfully",
      data: getFirstResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

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
  readGroupMembers,
  updateGroupImage,
  updateGroupImageHandler
};
