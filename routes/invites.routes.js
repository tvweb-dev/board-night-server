const express = require("express");
const invitesController = require("../controllers/invites.controller");

const router = express.Router();

router.get("/", invitesController.listInvites);
router.post("/", invitesController.createInvite);
router.put("/rsvp", invitesController.updateRSVP);

module.exports = router;
