const express = require("express");
const groupsController = require("../controllers/groups.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", groupsController.listGroups);
router.post("/", requireAuth, groupsController.createGroup);
router.get("/user/:userId", groupsController.readUserGroups);
router.post("/members", requireAuth, groupsController.addGroupMember);
router.delete("/:groupId/members/:userId", requireAuth, groupsController.removeGroupMember);
router.patch("/:groupId/image", requireAuth, groupsController.updateGroupImage);
router.patch("/:groupId/inactive", requireAuth, groupsController.setInactive);
router.post("/:groupId/reactivate", requireAuth, groupsController.reactivate);
router.get("/:groupId/members", groupsController.readGroupMembers);

module.exports = router;
