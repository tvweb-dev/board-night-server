const express = require("express");
const eventsController = require("../controllers/events.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", eventsController.listEvents);
router.post("/", eventsController.createEvent);
router.get("/group/:groupId", eventsController.readGroupEvents);
router.get("/:eventId/rsvps", eventsController.readEventRSVPs);
router.patch("/:eventId/cancel", requireAuth, eventsController.cancelEvent);
router.patch("/:eventId/host", requireAuth, eventsController.changeHost);

module.exports = router;
