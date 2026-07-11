import "dotenv/config";
import express from "express";
import cors from "cors";
import { compose } from "./compose.js";
import { CATALOG } from "./catalog.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const HTTP_STATUS = {
  bad_request: 400,
  llm_invalid_output: 422,
  llm_error: 502,
  internal: 500,
};

app.get("/api/catalog", (_req, res) => res.json(CATALOG));

app.post("/api/compose", async (req, res) => {
  const { prompt, song = null } = req.body ?? {};
  if (typeof prompt !== "string" || !prompt.trim()) {
    return res
      .status(400)
      .json({ error: { code: "bad_request", message: "prompt (non-empty string) is required" } });
  }

  try {
    const result = await compose({ prompt, song }); // { song, message }
    res.json(result);
  } catch (e) {
    const code = e.code ?? "internal";
    res.status(HTTP_STATUS[code] ?? 500).json({ error: { code, message: e.message } });
  }
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => console.log(`PromptBeats backend on http://localhost:${PORT}`));
