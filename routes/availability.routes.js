const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { availabilityHandlers } = require("../controllers/availability.controller");

const router = express.Router();
const handlers = availabilityHandlers();

router.get("/", requireAuth, handlers.list);
router.put("/:date", requireAuth, handlers.save);

module.exports = router;
