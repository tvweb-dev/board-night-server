const express = require("express");
const groupsController = require("../controllers/groups.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", groupsController.listGroups);
router.post("/", requireAuth, groupsController.createGroup);
router.get("/user/:userId", groupsController.readUserGroups);
router.post("/members", requireAuth, groupsController.addGroupMember);
router.patch("/:groupId/image", requireAuth, groupsController.updateGroupImage);
router.get("/:groupId/members", groupsController.readGroupMembers);

module.exports = router;
