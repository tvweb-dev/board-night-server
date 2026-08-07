const express = require("express");
const gamesController = require("../controllers/games.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/", gamesController.createGame);
router.get("/", requireAuth, gamesController.readGames);
router.post("/favorites", requireAuth, gamesController.addFavoriteGame);
router.delete("/favorites", requireAuth, gamesController.removeFavoriteGame);
router.get("/favorites/:userId", requireAuth, gamesController.readUserFavoriteGames);
router.put("/favorites/:userId", requireAuth, gamesController.replaceFavoriteGames);

module.exports = router;
