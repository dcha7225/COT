// routes/messageRoutes.js
const express = require("express");
const router = express.Router();
const { generateResponse } = require("../controllers/messageController");

// POST /message - Send a message to the chatbot and receive a response
router.post("/", generateResponse);

module.exports = router;
