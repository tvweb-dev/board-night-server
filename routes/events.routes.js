const express = require("express");
const eventsController = require("../controllers/events.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, eventsController.listEvents);
router.post("/", requireAuth, eventsController.createEvent);
router.get("/group/:groupId", eventsController.readGroupEvents);
router.get("/:eventId/rsvps", eventsController.readEventRSVPs);
router.put("/:eventId", requireAuth, eventsController.updateEvent);
router.patch("/:eventId/image", requireAuth, eventsController.updateEventImage);
router.patch("/:eventId/cancel", requireAuth, eventsController.cancelEvent);
router.patch("/:eventId/host", requireAuth, eventsController.changeHost);

module.exports = router;
