const { pool } = require("../config/database");

function unwrapProcedureResult(rows) { return rows && rows[0] ? rows[0] : []; }
function getFirstResult(rows) { const result = unwrapProcedureResult(rows); return result && result[0] ? result[0] : null; }
function handleDbError(res, error, statusCode = 400) { return res.status(statusCode).json({ success: false, message: error.sqlMessage || error.message || "Database error" }); }
function validUserId(value) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

async function createGame(req, res) {
  try {
    const { gameName, category } = req.body;
    const [rows] = await pool.query("CALL CreateGame(?, ?)", [gameName, category]);
    res.status(201).json({ success: true, message: "Game created successfully", data: getFirstResult(rows) });
  } catch (error) { handleDbError(res, error); }
}

async function readGames(req, res) {
  try {
    const [rows] = await pool.query("SELECT GAME_ID, GAME_NAME, CATEGORY FROM games ORDER BY GAME_NAME");
    res.json({ success: true, message: "Games loaded successfully", data: rows });
  } catch (error) { handleDbError(res, error); }
}

function favoriteHandlers(database = pool) {
  function owner(req, res, requestedId) {
    if (!requestedId) { res.status(400).json({ success: false, message: "A valid user ID is required" }); return false; }
    if (requestedId !== req.auth.userId) { res.status(403).json({ success: false, message: "You can only update your own favorite games" }); return false; }
    return true;
  }

  return {
    async read(req, res) {
      const requestedId = validUserId(req.params.userId);
      if (!requestedId) return res.status(400).json({ success: false, message: "A valid user ID is required" });
      try {
        const [rows] = await database.query(
          `SELECT ufg.USER_ID, g.GAME_ID, g.GAME_NAME, g.CATEGORY
             FROM user_favorite_games ufg JOIN games g ON g.GAME_ID = ufg.GAME_ID
            WHERE ufg.USER_ID = ? ORDER BY g.GAME_NAME`,
          [requestedId]
        );
        return res.json({ success: true, message: "Favorite games loaded successfully", data: rows });
      } catch (error) { return handleDbError(res, error); }
    },

    async replace(req, res) {
      const requestedId = validUserId(req.params.userId);
      if (!owner(req, res, requestedId)) return;
      const rawIds = req.body && req.body.gameIds;
      if (!Array.isArray(rawIds)) return res.status(400).json({ success: false, message: "gameIds must be an array" });
      const gameIds = [...new Set(rawIds.map(Number))];
      if (gameIds.some((id) => !Number.isInteger(id) || id < 1)) return res.status(400).json({ success: false, message: "Every game ID must be valid" });

      const connection = database.getConnection ? await database.getConnection() : database;
      try {
        if (connection.beginTransaction) await connection.beginTransaction();
        if (gameIds.length) {
          const placeholders = gameIds.map(() => "?").join(",");
          const [games] = await connection.query(`SELECT GAME_ID FROM games WHERE GAME_ID IN (${placeholders})`, gameIds);
          if (games.length !== gameIds.length) throw new Error("One or more games do not exist");
        }
        await connection.query("DELETE FROM user_favorite_games WHERE USER_ID = ?", [requestedId]);
        if (gameIds.length) {
          const values = gameIds.map(() => "(?, ?)").join(",");
          await connection.query(`INSERT INTO user_favorite_games (USER_ID, GAME_ID) VALUES ${values}`, gameIds.flatMap((gameId) => [requestedId, gameId]));
        }
        if (connection.commit) await connection.commit();
        return res.json({ success: true, message: "Favorite games updated successfully", data: gameIds });
      } catch (error) {
        if (connection.rollback) await connection.rollback();
        return handleDbError(res, error);
      } finally {
        if (connection.release) connection.release();
      }
    },

    async add(req, res) {
      const requestedId = validUserId(req.body && req.body.userId);
      if (!owner(req, res, requestedId)) return;
      try {
        const [rows] = await database.query("CALL AddFavoriteGame(?, ?)", [requestedId, req.body.gameId]);
        return res.status(201).json({ success: true, message: "Favorite game added successfully", data: getFirstResult(rows) });
      } catch (error) { return handleDbError(res, error); }
    },

    async remove(req, res) {
      const requestedId = validUserId(req.body && req.body.userId);
      if (!owner(req, res, requestedId)) return;
      try {
        const [rows] = await database.query("CALL RemoveFavoriteGame(?, ?)", [requestedId, req.body.gameId]);
        return res.json({ success: true, message: "Favorite game removed successfully", data: getFirstResult(rows) });
      } catch (error) { return handleDbError(res, error); }
    }
  };
}

const favorites = favoriteHandlers();
module.exports = { createGame, readGames, addFavoriteGame: favorites.add, removeFavoriteGame: favorites.remove, readUserFavoriteGames: favorites.read, replaceFavoriteGames: favorites.replace, favoriteHandlers };
