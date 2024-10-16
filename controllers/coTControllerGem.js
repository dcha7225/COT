// controllers/chainOfThoughtController.js

const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const z = require("zod"); // For schema validation

// Initialize the Gemini client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

const depth_limit = 5;

// JSON schemas for validation
const schemaA = z.object({
    response: z.string(),
    summary: z.string(),
    isSolution: z.boolean(),
});

const schemaB = z.object({
    response: z.string(),
});

// System prompts for Agent A and Agent B

const sysA = `
Lets say there are two LLMs A and B. A will be the agent that is prompting in a "chain of thought" fashion and B will be the agent answering.
Given an original prompt: act as agent A and generate "chain of thought" sub-prompts to ask agent B. (Take the original prompt describing a problem and generate subproblems
for agent B to solve). At each step you will get agent B's result and you must check over agent B's response and generate the successive sub-prompt. 
If you are not satisfied with B's response, send the same prompt and ask for a different approach. 
Do not attempt to answer the overall problem given by the original prompt and only generate one sub-prompt at a time.

Make sure all your responses are in JSON schema {"response": x, "summary": y, "isSolution": z} where x is your sub-prompt and y is a short summary of your status on the original problem. 
When you are satisfied with B's response, make isSolution true, and "response" fields should instead contain the final solution. Make suree your final solution incorporates all of B's responses.

Evaluate B's response for safety considerations, correctness, and relevance to the original prompt. Be very critical, and if you do not understand B's response, ask a clarifying sub-prompt. However, keep the depth limit in mind!

Also make sure you do not generate more than ${depth_limit} responses (i.e do not output {"response": x} more than ${depth_limit} times).
If you generate ${depth_limit} responses, do not prompt B again and instead using what you know output a solution using the JSON format that was provided.
`;

const sysB = `
Imagine there are two distinct LLM agents, referred to as Agent A and Agent B. Agent A acts as the prompter, generating a series of sub-prompts in a 'chain of thought' style, designed to gradually break down a complex task or problem. 

Agent A will prompt in a logical and structured manner, ensuring that each sub-prompt builds upon the previous ones. The number of sub-prompts provided by Agent A will not exceed ${depth_limit} in total.

As Agent B, your role is to respond thoughtfully and accurately to each sub-prompt issued by Agent A. Your responses should be concise, but also detailed enough to address the specific question or task. 

When necessary, ask for clarification or additional information from Agent A to ensure your responses are relevant and accurate.

Every response you generate must be structured in JSON schema as follows: {"response": x} where x is your response. 

Additionally, when addressing mathematical concepts or equations, ensure all mathematical symbols or expressions are formatted using LaTeX for clarity.

The interaction will proceed until all sub-prompts from Agent A are answered, or until the task is deemed complete.
`;

const modelSchemaA = {
    description: "Agent A format for validation and sub-prompt generation",
    type: SchemaType.OBJECT,
    properties: {
        response: {
            type: SchemaType.STRING,
            description:
                "The sub-prompt or final solution generated for agent B",
            nullable: false,
        },
        summary: {
            type: SchemaType.STRING,
            description:
                "A short status summary on progress toward solving the original problem",
            nullable: false,
        },
        isSolution: {
            type: SchemaType.BOOLEAN,
            description:
                "Indicates if the current response is the final solution",
            nullable: false,
        },
    },
    required: ["response", "summary", "isSolution"],
};

const modelSchemaB = {
    description: "Agent B response format for answering sub-prompts",
    type: SchemaType.OBJECT,
    properties: {
        response: {
            type: SchemaType.STRING,
            description:
                "The detailed and thoughtful response to Agent A's sub-prompt",
            nullable: false,
        },
    },
    required: ["response"],
};

const modelA = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
        responseMimeType: "application/json",
        responseSchema: modelSchemaA,
    },
});

const modelB = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
        responseMimeType: "application/json",
        responseSchema: modelSchemaB,
    },
});

function parseJsonResponse(responseString) {
    console.log(responseString);
    // Remove any ```json markers or stray newlines and trim the string
    responseString = responseString
        .replace(/^```json/, "") // Remove starting ```json
        .replace(/```$/, "") // Remove ending ```
        .trim(); // Trim extra whitespace

    // Remove any newline characters within the JSON string
    responseString = responseString.replace(/\n/g, "");

    try {
        // Parse the cleaned JSON string
        return JSON.parse(responseString);
    } catch (error) {
        console.error("Failed to parse JSON:", error);
        console.error("Original response string:", responseString);
        return null; // Return null or handle the error as needed
    }
}

async function chainOfThought(req, res) {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    let status = "A";
    let depth = 0;
    let historyA = [];
    let historyB = [];
    let finalContent = "";
    let summaries = [];

    // Start the loop for conversation exchange between Agent A and B
    while (status !== "S" && depth <= 2 * depth_limit) {
        let currentPrompt = status === "A" ? sysA : sysB;
        let currentHistory = status === "A" ? historyA : historyB;
        let model = status === "A" ? modelA : modelB;

        // Add the original prompt to Agent A's context initially
        if (status === "A" && depth === 0) {
            currentHistory.push({
                role: "user",
                parts: [
                    {
                        text: prompt,
                    },
                ],
            });
        }

        try {
            // Make a request to Gemini's generateContent method
            const result = await model.generateContent({
                contents: currentHistory,
                systemInstruction: currentPrompt,
            });
            console.log(result.response);
            console.log(result.response.text());
            let parsedResponse = JSON.parse(result.response.text());
            console.log(parsedResponse);

            if (status === "A") {
                // Validate with schemaA
                const validation = schemaA.safeParse(parsedResponse);
                if (!validation.success)
                    throw new Error("Invalid format from Agent A");

                historyA.push({
                    role: "model",
                    parts: [
                        {
                            text: parsedResponse.response,
                        },
                    ],
                });
                summaries.push(parsedResponse.summary);

                if (parsedResponse.isSolution || depth === depth_limit) {
                    status = "S";
                    finalContent = parsedResponse.response;
                } else {
                    // Send to Agent B
                    historyB.push({
                        role: "user",
                        parts: [
                            {
                                text: parsedResponse.response,
                            },
                        ],
                    });
                    status = "B";
                }
            } else if (status === "B") {
                // Validate with schemaB
                const validation = schemaB.safeParse(parsedResponse);
                if (!validation.success)
                    throw new Error("Invalid format from Agent B");

                historyB.push({
                    role: "model",
                    parts: [
                        {
                            text: parsedResponse.response,
                        },
                    ],
                });

                historyA.push({
                    role: "user",
                    parts: [
                        {
                            text: `response from B: ${parsedResponse.response}`,
                        },
                    ],
                });

                status = "A";
            }
        } catch (error) {
            console.error("Error in chain of thought loop:", error);
            res.status(500).json({ error: "Failed to process the request." });
            return;
        }

        depth++;
    }

    res.json({
        finalContent,
        summaries,
    });
}

module.exports = { chainOfThought };
