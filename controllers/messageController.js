const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

const generateResponse = async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ error: "Prompt content is required" });
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const result = await model.generateContent(prompt);

        res.json({ message: result.response.text() });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to generate content" });
    }
};

// Export the controller function for use in your routes
module.exports = { generateResponse };
