const { pool } = require("../config/database");
const { signToken } = require("../middleware/auth");

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

async function listUsers(req, res) {
  res.json({
    success: true,
    message: "Users endpoint ready",
    data: []
  });
}

async function createUser(req, res) {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.query("CALL CreateUser(?, ?)", [
      email,
      password
    ]);

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: getFirstResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

async function loginUser(req, res) {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.query("CALL LoginUser(?, ?)", [
      email,
      password
    ]);

    const user = getFirstResult(rows);
    if (!user) return res.status(401).json({ success: false, message: "Invalid email or password" });
    user.token = signToken(user.USER_ID);

    res.json({
      success: true,
      message: "Login successful",
      data: user
    });
  } catch (error) {
    handleDbError(res, error, 401);
  }
}

module.exports = {
  listUsers,
  createUser,
  loginUser
};
