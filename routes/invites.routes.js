const express = require("express");
const invitesController = require("../controllers/invites.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", invitesController.listInvites);
router.post("/", requireAuth, invitesController.createInvite);
router.put("/rsvp", requireAuth, invitesController.updateRSVP);
router.get("/:inviteId/email-status", requireAuth, invitesController.readEmailDetails);
router.put("/:inviteId/email-status", requireAuth, invitesController.updateEmailDetails);
router.post("/:inviteId/send-email", requireAuth, invitesController.sendInviteEmail);

module.exports = router;
