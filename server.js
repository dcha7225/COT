require("dotenv").config();
const cors = require("cors");
const express = require("express");

const app = express();

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

// Routers
app.use("/message", require("./routes/messageRoutes")); // Message router
app.use("/chain", require("./routes/coTRoutes"));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        message: err.message || "Something went wrong",
        error: process.env.NODE_ENV === "production" ? {} : err,
    });
});

// Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on PORT ${PORT}`));
