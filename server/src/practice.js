import { Router } from "express";
import { authenticate } from "./auth.js";
import { getDb } from "./db.js";

export const practiceRouter = Router();

practiceRouter.use(authenticate);

practiceRouter.get("/practice/attempts", (req, res) => {
  const limit = clampNumber(req.query.limit, 5, 1, 20);
  const attempts = getDb()
    .prepare(`
      SELECT *
      FROM exam_attempts
      WHERE user_id = ? AND mode = 'practice' AND completed_at IS NOT NULL
      ORDER BY completed_at DESC, id DESC
      LIMIT ?
    `)
    .all(req.user.id, limit)
    .map(formatAttempt);

  res.json({ attempts });
});

practiceRouter.post("/practice/start", (req, res) => {
  const count = clampNumber(req.body.count, 10, 1, 100);
  const category = normalizeCategory(req.body.category);
  const timerMinutes = normalizeTimer(req.body.timer_minutes);

  const questionRows = selectRandomQuestions(count, category);
  if (questionRows.length === 0) {
    return res.status(400).json({ message: "No questions match this practice setup." });
  }

  const db = getDb();
  let attemptId;
  try {
    db.exec("BEGIN");
    const result = db
      .prepare(`
        INSERT INTO exam_attempts (user_id, mode, score, total_items, category, timer_minutes)
        VALUES (?, 'practice', 0, ?, ?, ?)
      `)
      .run(req.user.id, questionRows.length, category, timerMinutes);
    attemptId = result.lastInsertRowid;

    const insertAnswer = db.prepare(`
      INSERT INTO exam_answers (attempt_id, question_id, position)
      VALUES (?, ?, ?)
    `);
    questionRows.forEach((question, index) => insertAnswer.run(attemptId, question.id, index + 1));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  res.status(201).json({
    attempt: formatAttempt(getAttempt(attemptId, req.user.id)),
    questions: questionRows.map(sanitizeQuestion)
  });
});

practiceRouter.post("/practice/:attemptId/answer", (req, res) => {
  const attempt = requireAttempt(req.params.attemptId, req.user.id, res);
  if (!attempt) return;
  if (attempt.completed_at) return res.status(400).json({ message: "This practice attempt is already complete." });

  const questionId = Number(req.body.question_id);
  const selectedAnswer = String(req.body.selected_answer || "").trim();
  if (!questionId || !selectedAnswer) {
    return res.status(400).json({ message: "Question and selected answer are required." });
  }

  const row = getAnswerWithQuestion(attempt.id, questionId);
  if (!row) return res.status(404).json({ message: "Question is not part of this attempt." });

  if (row.answered_at) {
    return res.json({ feedback: formatFeedback(row) });
  }

  const normalizedAnswer = normalizeSelectedAnswer(selectedAnswer, row.type);
  const isCorrect = gradeAnswer(normalizedAnswer, row.correct_answer, row.type) ? 1 : 0;

  getDb()
    .prepare(`
      UPDATE exam_answers
      SET selected_answer = ?, is_correct = ?, answered_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .run(normalizedAnswer, isCorrect, row.answer_id);

  const updated = getAnswerWithQuestion(attempt.id, questionId);
  res.json({ feedback: formatFeedback(updated) });
});

practiceRouter.post("/practice/:attemptId/complete", (req, res) => {
  const attempt = requireAttempt(req.params.attemptId, req.user.id, res);
  if (!attempt) return;

  if (!attempt.completed_at) {
    const timedOut = req.body.timed_out ? 1 : 0;
    const db = getDb();
    db.prepare(`
      UPDATE exam_answers
      SET is_correct = 0
      WHERE attempt_id = ? AND is_correct IS NULL
    `).run(attempt.id);

    const score = db
      .prepare("SELECT COUNT(*) AS score FROM exam_answers WHERE attempt_id = ? AND is_correct = 1")
      .get(attempt.id).score;

    db.prepare(`
      UPDATE exam_attempts
      SET score = ?,
        timed_out = ?,
        duration_seconds = CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER),
        completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(score, timedOut, attempt.id);
  }

  res.json(getAttemptReview(attempt.id, req.user.id));
});

practiceRouter.get("/practice/:attemptId", (req, res) => {
  const attempt = requireAttempt(req.params.attemptId, req.user.id, res);
  if (!attempt) return;
  res.json(getAttemptReview(attempt.id, req.user.id));
});

function selectRandomQuestions(count, category) {
  if (category) {
    return getDb()
      .prepare(`
        SELECT id, question, type, choice_a, choice_b, choice_c, choice_d, category, difficulty
        FROM questions
        WHERE category = ?
        ORDER BY RANDOM()
        LIMIT ?
      `)
      .all(category, count);
  }

  return getDb()
    .prepare(`
      SELECT id, question, type, choice_a, choice_b, choice_c, choice_d, category, difficulty
      FROM questions
      ORDER BY RANDOM()
      LIMIT ?
    `)
    .all(count);
}

function requireAttempt(attemptId, userId, res) {
  const attempt = getAttempt(attemptId, userId);
  if (!attempt) {
    res.status(404).json({ message: "Practice attempt not found." });
    return null;
  }
  return attempt;
}

function getAttempt(id, userId) {
  return getDb()
    .prepare("SELECT * FROM exam_attempts WHERE id = ? AND user_id = ? AND mode = 'practice'")
    .get(id, userId);
}

function getAnswerWithQuestion(attemptId, questionId) {
  return getDb()
    .prepare(`
      SELECT ea.id AS answer_id, ea.attempt_id, ea.question_id, ea.position, ea.selected_answer,
        ea.is_correct, ea.answered_at, q.question, q.type, q.choice_a, q.choice_b,
        q.choice_c, q.choice_d, q.correct_answer, q.explanation, q.category, q.difficulty
      FROM exam_answers ea
      JOIN questions q ON q.id = ea.question_id
      WHERE ea.attempt_id = ? AND ea.question_id = ?
    `)
    .get(attemptId, questionId);
}

function getAttemptReview(attemptId, userId) {
  const attempt = formatAttempt(getAttempt(attemptId, userId));
  const answers = getDb()
    .prepare(`
      SELECT ea.question_id, ea.position, ea.selected_answer, ea.is_correct, ea.answered_at,
        q.question, q.type, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
        q.correct_answer, q.explanation, q.category, q.difficulty
      FROM exam_answers ea
      JOIN questions q ON q.id = ea.question_id
      WHERE ea.attempt_id = ?
      ORDER BY ea.position ASC
    `)
    .all(attemptId)
    .map((row) => ({
      ...row,
      is_correct: row.is_correct === null ? null : Boolean(row.is_correct)
    }));

  return {
    attempt,
    answers,
    summary: {
      score: attempt.score,
      total_items: attempt.total_items,
      correct_answers: attempt.score,
      wrong_answers: attempt.total_items - attempt.score,
      percentage: attempt.total_items ? Math.round((attempt.score / attempt.total_items) * 100) : 0
    }
  };
}

function formatAttempt(attempt) {
  if (!attempt) return null;
  return {
    ...attempt,
    timed_out: Boolean(attempt.timed_out)
  };
}

function formatFeedback(row) {
  return {
    question_id: row.question_id,
    position: row.position,
    selected_answer: row.selected_answer,
    is_correct: Boolean(row.is_correct),
    correct_answer: row.correct_answer,
    explanation: row.explanation
  };
}

function sanitizeQuestion(question) {
  return {
    id: question.id,
    question: question.question,
    type: question.type,
    choice_a: question.choice_a,
    choice_b: question.choice_b,
    choice_c: question.choice_c,
    choice_d: question.choice_d,
    category: question.category,
    difficulty: question.difficulty
  };
}

function gradeAnswer(selectedAnswer, correctAnswer, type) {
  const expected = String(correctAnswer || "").trim();
  if (type === "identification") {
    return selectedAnswer.toLowerCase() === expected.toLowerCase();
  }
  return selectedAnswer === normalizeSelectedAnswer(expected, type);
}

function normalizeSelectedAnswer(answer, type) {
  const trimmed = String(answer || "").trim();
  if (type === "multiple_choice") return trimmed.toUpperCase();
  if (type === "true_false") return trimmed.toLowerCase() === "true" ? "True" : trimmed.toLowerCase() === "false" ? "False" : trimmed;
  return trimmed;
}

function normalizeCategory(category) {
  const text = String(category || "").trim();
  return text || null;
}

function normalizeTimer(timer) {
  const value = Number(timer);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.floor(number), min), max);
}
