const { pool } = require("../config/database");

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
    const { groupName } = req.body;
    const createdBy = req.auth.userId;

    const [rows] = await pool.query("CALL CreateGroup(?, ?)", [
      groupName,
      createdBy
    ]);

    res.status(201).json({
      success: true,
      message: "Group created successfully",
      data: getFirstResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

async function readUserGroups(req, res) {
  try {
    const { userId } = req.params;

    const [rows] = await pool.query("CALL ReadUserGroups(?)", [userId]);

    res.json({
      success: true,
      message: "User groups loaded successfully",
      data: unwrapProcedureResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

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

    const [rows] = await pool.query("CALL ReadGroupMembers(?)", [groupId]);

    res.json({
      success: true,
      message: "Group members loaded successfully",
      data: unwrapProcedureResult(rows)
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
  readGroupMembers
};
