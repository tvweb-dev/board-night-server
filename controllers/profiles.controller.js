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

async function createUserProfile(req, res) {
  try {
    const {
      userId,
      firstName,
      lastName,
      nickname,
      imageUrl,
      birthday,
      favoriteFood,
      favoriteDrink,
      allergies,
      city,
      province,
      country
    } = req.body;

    const [rows] = await pool.query(
      "CALL CreateUserProfile(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        userId,
        firstName,
        lastName,
        nickname,
        imageUrl,
        birthday,
        favoriteFood,
        favoriteDrink,
        allergies,
        city,
        province,
        country
      ]
    );

    res.status(201).json({
      success: true,
      message: "Profile created successfully",
      data: getFirstResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

async function readUserProfile(req, res) {
  try {
    const { userId } = req.params;

    const [rows] = await pool.query("CALL ReadUserProfile(?)", [userId]);

    res.json({
      success: true,
      message: "Profile loaded successfully",
      data: getFirstResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

async function updateUserProfile(req, res) {
  try {
    const { userId } = req.params;

    const {
      firstName,
      lastName,
      nickname,
      imageUrl,
      birthday,
      favoriteFood,
      favoriteDrink,
      allergies,
      city,
      province,
      country
    } = req.body;

    const [rows] = await pool.query(
      "CALL UpdateUserProfile(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        userId,
        firstName,
        lastName,
        nickname,
        imageUrl,
        birthday,
        favoriteFood,
        favoriteDrink,
        allergies,
        city,
        province,
        country
      ]
    );

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: getFirstResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

module.exports = {
  createUserProfile,
  readUserProfile,
  updateUserProfile
};
