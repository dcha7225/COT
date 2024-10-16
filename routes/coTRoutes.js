// routes/chainRoutes.js
const express = require("express");
const router = express.Router();
const { chainOfThought } = require("../controllers/coTControllerGem");

router.post("/", chainOfThought);

module.exports = router;
