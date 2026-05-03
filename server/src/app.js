import express from "express";
import cors from "cors";
import { login } from "./auth.js";
import { getDatabaseMode } from "./db.js";
import { questionsRouter } from "./questions.js";
import { practiceRouter } from "./practice.js";

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (req, res) => res.json({ ok: true, database: getDatabaseMode() }));

  app.post("/api/auth/login", asyncRoute(async (req, res) => {
    const result = await login(req.body.username, req.body.password);
    if (!result) return res.status(401).json({ message: "Invalid username or password." });
    return res.json(result);
  }));

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
