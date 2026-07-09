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

async function createGame(req, res) {
  try {
    const { gameName, category } = req.body;

    const [rows] = await pool.query("CALL CreateGame(?, ?)", [
      gameName,
      category
    ]);

    res.status(201).json({
      success: true,
      message: "Game created successfully",
      data: getFirstResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

async function readGames(req, res) {
  try {
    const [rows] = await pool.query("CALL ReadGames()");

    res.json({
      success: true,
      message: "Games loaded successfully",
      data: unwrapProcedureResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

async function addFavoriteGame(req, res) {
  try {
    const { userId, gameId } = req.body;

    const [rows] = await pool.query("CALL AddFavoriteGame(?, ?)", [
      userId,
      gameId
    ]);

    res.status(201).json({
      success: true,
      message: "Favorite game added successfully",
      data: getFirstResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

async function removeFavoriteGame(req, res) {
  try {
    const { userId, gameId } = req.body;

    const [rows] = await pool.query("CALL RemoveFavoriteGame(?, ?)", [
      userId,
      gameId
    ]);

    res.json({
      success: true,
      message: "Favorite game removed successfully",
      data: getFirstResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

async function readUserFavoriteGames(req, res) {
  try {
    const { userId } = req.params;

    const [rows] = await pool.query("CALL ReadUserFavoriteGames(?)", [
      userId
    ]);

    res.json({
      success: true,
      message: "Favorite games loaded successfully",
      data: unwrapProcedureResult(rows)
    });
  } catch (error) {
    handleDbError(res, error);
  }
}

module.exports = {
  createGame,
  readGames,
  addFavoriteGame,
  removeFavoriteGame,
  readUserFavoriteGames
};
