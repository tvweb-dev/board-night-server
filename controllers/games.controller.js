const { pool } = require("../config/database");

const COMPACT_FIELDS = `g.GAME_ID, g.GAME_NAME, g.CATEGORY, g.THUMBNAIL_URL,
  g.MIN_PLAYERS, g.MAX_PLAYERS, g.MIN_PLAYTIME, g.MAX_PLAYTIME, g.MIN_AGE,
  g.AVERAGE_RATING, g.USERS_RATED`;
const DETAIL_FIELDS = `g.GAME_ID, g.SOURCE_GAME_ID, g.GAME_NAME, g.CATEGORY, g.DESCRIPTION,
  g.THUMBNAIL_URL, g.IMAGE_URL, g.MIN_PLAYERS, g.MAX_PLAYERS, g.MIN_PLAYTIME,
  g.MAX_PLAYTIME, g.MIN_AGE, g.YEAR_PUBLISHED, g.MECHANICS, g.DESIGNERS,
  g.PUBLISHERS, g.AVERAGE_RATING, g.USERS_RATED, g.RULES_URL`;

function validId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function safeError(res, error, fallback = "Unable to complete game request") {
  const message = error && !error.sqlMessage ? String(error.message || fallback).slice(0, 240) : fallback;
  return res.status(400).json({ success: false, message });
}

function createCatalogueHandlers(database = pool) {
  return {
    create(_req, res) {
      return res.status(403).json({ success: false, message: "Catalogue creation is not available through the application API" });
    },
    async legacyList(_req, res) {
      try {
        const [rows] = await database.query("SELECT GAME_ID, GAME_NAME, CATEGORY FROM games ORDER BY GAME_NAME");
        return res.json({ success: true, message: "Games loaded successfully", data: rows });
      } catch (error) { return safeError(res, error, "Unable to load games"); }
    },
    async search(req, res) {
      const query = String(req.query.q || "").trim();
      if (!query || query.length > 100) return res.status(400).json({ success: false, message: "q must contain between 1 and 100 characters" });
      const rawLimit = req.query.limit;
      const limit = rawLimit == null || rawLimit === "" ? 25 : Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) return res.status(400).json({ success: false, message: "limit must be an integer between 1 and 50" });
      try {
        const [rows] = await database.query(
          `SELECT ${COMPACT_FIELDS} FROM games g
            WHERE LOWER(g.GAME_NAME) LIKE CONCAT('%', LOWER(?), '%')
            ORDER BY CASE
              WHEN LOWER(g.GAME_NAME) = LOWER(?) THEN 0
              WHEN LOWER(g.GAME_NAME) LIKE CONCAT(LOWER(?), '%') THEN 1
              ELSE 2 END,
              COALESCE(g.USERS_RATED, 0) DESC, g.GAME_NAME ASC
            LIMIT ?`,
          [query, query, query, limit]
        );
        return res.json({ success: true, message: "Games found successfully", data: rows });
      } catch (error) { return safeError(res, error, "Unable to search games"); }
    },
    async details(req, res) {
      const gameId = validId(req.params.gameId);
      if (!gameId) return res.status(400).json({ success: false, message: "A valid game ID is required" });
      try {
        const [rows] = await database.query(`SELECT ${DETAIL_FIELDS} FROM games g WHERE g.GAME_ID = ?`, [gameId]);
        if (!rows.length) return res.status(404).json({ success: false, message: "Game not found" });
        return res.json({ success: true, message: "Game loaded successfully", data: rows[0] });
      } catch (error) { return safeError(res, error, "Unable to load game" ); }
    }
  };
}

function favoriteHandlers(database = pool) {
  function owner(req, res, requestedValue) {
    const suppliedId = requestedValue == null || requestedValue === "" ? req.auth.userId : validId(requestedValue);
    if (!suppliedId) { res.status(400).json({ success: false, message: "A valid user ID is required" }); return null; }
    if (suppliedId !== req.auth.userId) { res.status(403).json({ success: false, message: "You can only update your own favorite games" }); return null; }
    return req.auth.userId;
  }

  return {
    async read(req, res) {
      const requestedId = validId(req.params.userId);
      if (!requestedId) return res.status(400).json({ success: false, message: "A valid user ID is required" });
      try {
        const [rows] = await database.query(
          `SELECT ufg.USER_ID, ${COMPACT_FIELDS}, g.IMAGE_URL
             FROM user_favorite_games ufg JOIN games g ON g.GAME_ID = ufg.GAME_ID
            WHERE ufg.USER_ID = ? ORDER BY g.GAME_NAME`, [requestedId]
        );
        return res.json({ success: true, message: "Favorite games loaded successfully", data: rows });
      } catch (error) { return safeError(res, error, "Unable to load favorite games"); }
    },
    async replace(req, res) {
      const requestedId = owner(req, res, req.params.userId);
      if (!requestedId) return;
      const rawIds = req.body && req.body.gameIds;
      if (!Array.isArray(rawIds)) return res.status(400).json({ success: false, message: "gameIds must be an array" });
      const gameIds = [...new Set(rawIds.map(Number))];
      if (gameIds.some((id) => !validId(id))) return res.status(400).json({ success: false, message: "Every game ID must be valid" });
      const connection = database.getConnection ? await database.getConnection() : database;
      try {
        if (connection.beginTransaction) await connection.beginTransaction();
        if (gameIds.length) {
          const placeholders = gameIds.map(() => "?").join(",");
          const [games] = await connection.query(`SELECT GAME_ID FROM games WHERE GAME_ID IN (${placeholders})`, gameIds);
          if (games.length !== gameIds.length) { const error = new Error("One or more games do not exist"); error.statusCode = 404; throw error; }
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
        if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
        return safeError(res, error, "Unable to update favorite games");
      } finally { if (connection.release) connection.release(); }
    },
    async add(req, res) {
      const userId = owner(req, res, req.body && req.body.userId);
      if (!userId) return;
      const gameId = validId(req.body && req.body.gameId);
      if (!gameId) return res.status(400).json({ success: false, message: "A valid game ID is required" });
      try {
        const [games] = await database.query("SELECT GAME_ID FROM games WHERE GAME_ID = ?", [gameId]);
        if (!games.length) return res.status(404).json({ success: false, message: "Game not found" });
        const [result] = await database.query("INSERT IGNORE INTO user_favorite_games (USER_ID, GAME_ID) VALUES (?, ?)", [userId, gameId]);
        if (!result.affectedRows) return res.status(409).json({ success: false, message: "Game is already a favorite" });
        return res.status(201).json({ success: true, message: "Favorite game added successfully", data: { USER_ID: userId, GAME_ID: gameId } });
      } catch (error) { return safeError(res, error, "Unable to add favorite game"); }
    },
    async remove(req, res) {
      const userId = owner(req, res, req.body && req.body.userId);
      if (!userId) return;
      const gameId = validId(req.body && req.body.gameId);
      if (!gameId) return res.status(400).json({ success: false, message: "A valid game ID is required" });
      try {
        const [result] = await database.query("DELETE FROM user_favorite_games WHERE USER_ID = ? AND GAME_ID = ?", [userId, gameId]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Favorite game not found" });
        return res.json({ success: true, message: "Favorite game removed successfully", data: { USER_ID: userId, GAME_ID: gameId } });
      } catch (error) { return safeError(res, error, "Unable to remove favorite game"); }
    }
  };
}

const catalogue = createCatalogueHandlers();
const favorites = favoriteHandlers();
module.exports = {
  createGame: catalogue.create, readGames: catalogue.legacyList, searchGames: catalogue.search, readGameDetails: catalogue.details,
  addFavoriteGame: favorites.add, removeFavoriteGame: favorites.remove, readUserFavoriteGames: favorites.read,
  replaceFavoriteGames: favorites.replace, favoriteHandlers, createCatalogueHandlers
};
