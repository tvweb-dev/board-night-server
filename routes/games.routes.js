const express = require("express");
const gamesController = require("../controllers/games.controller");

const router = express.Router();

router.post("/", gamesController.createGame);
router.get("/", gamesController.readGames);
router.post("/favorites", gamesController.addFavoriteGame);
router.delete("/favorites", gamesController.removeFavoriteGame);
router.get("/favorites/:userId", gamesController.readUserFavoriteGames);

module.exports = router;
