import express from "express";
import cors from "cors";
import { login } from "./auth.js";
import { questionsRouter } from "./questions.js";
import { practiceRouter } from "./practice.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  app.post("/api/auth/login", (req, res) => {
    const result = login(req.body.username, req.body.password);
    if (!result) return res.status(401).json({ message: "Invalid username or password." });
    return res.json(result);
  });

  app.post("/api/auth/logout", (req, res) => {
    res.json({ success: true });
  });

  app.use("/api", questionsRouter);
  app.use("/api", practiceRouter);

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: "Unexpected server error." });
  });

  return app;
}
