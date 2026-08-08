const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { friendsHandlers } = require("../controllers/friends.controller");

const router = express.Router();
const handlers = friendsHandlers();

router.get("/", requireAuth, handlers.list);
router.patch("/:friendId/hidden", requireAuth, handlers.setHidden);
router.put("/:friendId/note", requireAuth, handlers.saveNote);

module.exports = router;
