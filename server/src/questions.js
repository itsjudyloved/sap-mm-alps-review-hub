import { Router } from "express";
import { authenticate, requireAdmin } from "./auth.js";
import { validateQuestion } from "./validation.js";
import { parseBatch } from "./batchParser.js";
import {
  createQuestion,
  deleteQuestion,
  getQuestion,
  listCategories,
  listQuestions,
  markQuestion,
  saveBatchQuestions,
  unmarkQuestion,
  updateQuestion
} from "./db.js";

export const questionsRouter = Router();

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

questionsRouter.use(authenticate);

questionsRouter.get("/categories", asyncRoute(async (req, res) => {
  res.json({ categories: await listCategories() });
}));

questionsRouter.get("/questions", asyncRoute(async (req, res) => {
  const questions = await listQuestions(req.query, req.user.id);
  res.json({ questions });
}));

questionsRouter.post("/questions", requireAdmin, asyncRoute(async (req, res) => {
  const result = validateQuestion(req.body);
  if (!result.valid) return res.status(400).json({ errors: result.errors });

  const question = await createQuestion(result.question, req.user.id);
  return res.status(201).json({ question });
}));

questionsRouter.put("/questions/:id", requireAdmin, asyncRoute(async (req, res) => {
  const result = validateQuestion(req.body);
  if (!result.valid) return res.status(400).json({ errors: result.errors });

  const question = await updateQuestion(req.params.id, result.question, req.user.id);
  if (!question) return res.status(404).json({ message: "Question not found." });

  res.json({ question });
}));

questionsRouter.delete("/questions/:id", requireAdmin, asyncRoute(async (req, res) => {
  await deleteQuestion(req.params.id);
  res.json({ success: true });
}));

questionsRouter.post("/questions/batch-preview", requireAdmin, (req, res) => {
  const rows = parseBatch(req.body.text || "");
  res.json({ rows, validCount: rows.filter((row) => row.valid).length });
});

questionsRouter.post("/questions/batch-save", requireAdmin, asyncRoute(async (req, res) => {
  const rows = parseBatch(req.body.text || "");
  const validRows = rows.filter((row) => row.valid);
  const saved = await saveBatchQuestions(validRows.map((row) => row.question), req.user.id);
  res.status(201).json({ saved, savedCount: saved.length, invalidRows: rows.filter((row) => !row.valid) });
}));

questionsRouter.post("/questions/:id/mark", asyncRoute(async (req, res) => {
  const marked = await markQuestion(req.params.id, req.user.id);
  if (!marked) return res.status(404).json({ message: "Question not found." });
  res.status(201).json({ marked: true });
}));

questionsRouter.delete("/questions/:id/mark", asyncRoute(async (req, res) => {
  await unmarkQuestion(req.params.id, req.user.id);
  res.json({ marked: false });
}));
