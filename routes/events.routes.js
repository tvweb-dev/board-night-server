const express = require("express");
const eventsController = require("../controllers/events.controller");

const router = express.Router();

router.get("/", eventsController.listEvents);
router.post("/", eventsController.createEvent);
router.get("/group/:groupId", eventsController.readGroupEvents);
router.get("/:eventId/rsvps", eventsController.readEventRSVPs);

module.exports = router;
