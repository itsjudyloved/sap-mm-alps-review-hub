import { Router } from "express";
import { getDb } from "./db.js";
import { authenticate, requireAdmin } from "./auth.js";
import { validateQuestion } from "./validation.js";
import { parseBatch } from "./batchParser.js";

export const questionsRouter = Router();

questionsRouter.use(authenticate);

questionsRouter.get("/categories", (req, res) => {
  const categories = getDb()
    .prepare("SELECT DISTINCT category FROM questions ORDER BY category")
    .all()
    .map((row) => row.category);
  res.json({ categories });
});

questionsRouter.get("/questions", (req, res) => {
  const { search, category, type, difficulty, marked } = req.query;
  const clauses = [];
  const params = {};

  if (search) {
    clauses.push("(q.question LIKE @search OR q.explanation LIKE @search)");
    params.search = `%${search}%`;
  }
  if (category) {
    clauses.push("q.category = @category");
    params.category = category;
  }
  if (type) {
    clauses.push("q.type = @type");
    params.type = type;
  }
  if (difficulty) {
    clauses.push("q.difficulty = @difficulty");
    params.difficulty = difficulty;
  }
  if (marked === "true") {
    clauses.push("rm.id IS NOT NULL");
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(`
      SELECT q.*, CASE WHEN rm.id IS NULL THEN 0 ELSE 1 END AS marked
      FROM questions q
      LEFT JOIN review_marks rm ON rm.question_id = q.id AND rm.user_id = @userId
      ${where}
      ORDER BY q.updated_at DESC, q.id DESC
    `)
    .all({ ...params, userId: req.user.id });

  res.json({ questions: rows });
});

questionsRouter.post("/questions", requireAdmin, (req, res) => {
  const result = validateQuestion(req.body);
  if (!result.valid) return res.status(400).json({ errors: result.errors });

  const question = insertQuestion(result.question, req.user.id);
  return res.status(201).json({ question });
});

questionsRouter.put("/questions/:id", requireAdmin, (req, res) => {
  const result = validateQuestion(req.body);
  if (!result.valid) return res.status(400).json({ errors: result.errors });

  const existing = getDb().prepare("SELECT id FROM questions WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ message: "Question not found." });

  getDb()
    .prepare(`
      UPDATE questions
      SET question = @question, type = @type, choice_a = @choice_a, choice_b = @choice_b,
        choice_c = @choice_c, choice_d = @choice_d, correct_answer = @correct_answer,
        explanation = @explanation, category = @category, difficulty = @difficulty,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `)
    .run({ ...result.question, id: req.params.id });

  res.json({ question: getQuestion(req.params.id, req.user.id) });
});

questionsRouter.delete("/questions/:id", requireAdmin, (req, res) => {
  getDb().prepare("DELETE FROM questions WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

questionsRouter.post("/questions/batch-preview", requireAdmin, (req, res) => {
  const rows = parseBatch(req.body.text || "");
  res.json({ rows, validCount: rows.filter((row) => row.valid).length });
});

questionsRouter.post("/questions/batch-save", requireAdmin, (req, res) => {
  const rows = parseBatch(req.body.text || "");
  const validRows = rows.filter((row) => row.valid);
  const db = getDb();
  let saved = [];
  try {
    db.exec("BEGIN");
    saved = validRows.map((row) => insertQuestion(row.question, req.user.id));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  res.status(201).json({ saved, savedCount: saved.length, invalidRows: rows.filter((row) => !row.valid) });
});

questionsRouter.post("/questions/:id/mark", (req, res) => {
  const question = getDb().prepare("SELECT id FROM questions WHERE id = ?").get(req.params.id);
  if (!question) return res.status(404).json({ message: "Question not found." });

  getDb()
    .prepare("INSERT OR IGNORE INTO review_marks (user_id, question_id) VALUES (?, ?)")
    .run(req.user.id, req.params.id);
  res.status(201).json({ marked: true });
});

questionsRouter.delete("/questions/:id/mark", (req, res) => {
  getDb()
    .prepare("DELETE FROM review_marks WHERE user_id = ? AND question_id = ?")
    .run(req.user.id, req.params.id);
  res.json({ marked: false });
});

function insertQuestion(question, userId) {
  const result = getDb()
    .prepare(`
      INSERT INTO questions (
        question, type, choice_a, choice_b, choice_c, choice_d, correct_answer,
        explanation, category, difficulty, created_by
      ) VALUES (
        @question, @type, @choice_a, @choice_b, @choice_c, @choice_d, @correct_answer,
        @explanation, @category, @difficulty, @created_by
      )
    `)
    .run({ ...question, created_by: userId });

  return getQuestion(result.lastInsertRowid, userId);
}

function getQuestion(id, userId) {
  return getDb()
    .prepare(`
      SELECT q.*, CASE WHEN rm.id IS NULL THEN 0 ELSE 1 END AS marked
      FROM questions q
      LEFT JOIN review_marks rm ON rm.question_id = q.id AND rm.user_id = ?
      WHERE q.id = ?
    `)
    .get(userId, id);
}
