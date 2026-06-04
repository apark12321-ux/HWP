import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please verify your Gemini API key is configured in the Secrets pane in Google AI Studio.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support large base64 file payloads for math images/PDFs
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Route: Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route: AI Math OCR & Extraction
  app.post("/api/ocr", async (req, res) => {
    try {
      const { fileBase64, mimeType, filename } = req.body;

      if (!fileBase64) {
        return res.status(400).json({ error: "No file content provided." });
      }

      console.log(`[AI OCR] Analyzing uploaded math file: ${filename || "unnamed"} (${mimeType})`);

      const imagePart = {
        inlineData: {
          mimeType: mimeType || "image/png",
          data: fileBase64,
        },
      };

      const systemPrompt = `You are a world-class STEM professor and math OCR specialist.
Your task is to transcribe all mathematical or scientific problems with absolute precision.

Rules:
1. Extract numbered problems from the given document/image into separate problem structures.
2. For ANY math expression, formula, scientific variable, fraction, square root, equation, or complex mathematical symbol, wrap it inside «...» using LaTeX format.
   - Example 1 (quadratic formula): «x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}»
   - Example 2 (complex math): «z_1 = (1 - i)^2», «z_2 = \\frac{3 - \\sqrt{3}i}{3 + \\sqrt{3}i}»
   - Example 3 (simple inline): «\\alpha», «\\beta», «z = x + yi»
   - Example 4 (limit/sum): «\\lim_{n \\to \\infty} \\sum_{k=1}^n \\frac{1}{k^2}»
3. NEVER use general LaTeX delimiters like $ or $$ or \\[ \\] inside the problems. ONLY use «...» wrappers for math.
4. Transcribe all text (Korean, English, symbols) around the math exactly as it appears.
5. If you see diagrams, graphs, drawings, or geometric shapes, insert a short text placeholder such as "[그림]" in a standalone line so the user knows where diagrams were located.
6. For multi-choice selections (usually ①, ②, ③, ④, ⑤), put them on their own line with LaTeX expressions if containing math. For example:
   "① «-2»  ② «-1»  ③ «0»  ④ «1»  ⑤ «2»"
7. Retain the exact numerical order of the problems. Ensure each problem has a unique number.`;

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          imagePart,
          {
            text: "Extract and structure all math problems from this document/image. Convert all math formulas into standard latex wrapped in «...» tags.",
          },
        ],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              problems: {
                type: Type.ARRAY,
                description: "List of extracted mathematical problems",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    number: {
                      type: Type.STRING,
                      description: "The problem number, e.g. '0001' or '23'",
                    },
                    lines: {
                      type: Type.ARRAY,
                      description: "The paragraphs or rows of text that form this problem. Choice line of ① to ⑤ should be a single string.",
                      items: {
                        type: Type.STRING,
                      },
                    },
                  },
                  required: ["number", "lines"],
                },
              },
            },
            required: ["problems"],
          },
        },
      });

      const resultText = response.text || "{}";
      const parsed = JSON.parse(resultText);

      res.json({
        success: true,
        problems: parsed.problems || [],
      });
    } catch (error: any) {
      console.error("[AI OCR Error]", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to process the document with Gemini AI.",
      });
    }
  });

  // Vite development middleware vs. static production build serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("[Vite] Configured Vite middleware for development");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("[Production] Serving static files from dist/");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
