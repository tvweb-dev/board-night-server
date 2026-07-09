const express = require("express");
const groupsController = require("../controllers/groups.controller");

const router = express.Router();

router.get("/", groupsController.listGroups);
router.post("/", groupsController.createGroup);
router.get("/user/:userId", groupsController.readUserGroups);
router.post("/members", groupsController.addGroupMember);
router.get("/:groupId/members", groupsController.readGroupMembers);

module.exports = router;
