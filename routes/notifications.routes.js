const express = require("express");
const { requireAuth } = require("../middleware/auth");
const controller = require("../controllers/notifications.controller");

const router = express.Router();
router.get("/", requireAuth, controller.list);
router.patch("/read-all", requireAuth, controller.markAllRead);
router.patch("/:notificationId/read", requireAuth, controller.markRead);

module.exports = router;
