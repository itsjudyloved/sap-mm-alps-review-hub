import { Router } from "express";
import { authenticate } from "./auth.js";
import {
  completePracticeAttempt,
  createPracticeAttempt,
  getPracticeAnswerWithQuestion,
  getPracticeAttempt,
  getPracticeAttemptReview,
  listPracticeAttempts,
  savePracticeAnswer,
  selectRandomQuestions
} from "./db.js";

export const practiceRouter = Router();

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

practiceRouter.use(authenticate);

practiceRouter.get("/practice/attempts", asyncRoute(async (req, res) => {
  const limit = clampNumber(req.query.limit, 5, 1, 20);
  const attempts = (await listPracticeAttempts(req.user.id, limit)).map(formatAttempt);
  res.json({ attempts });
}));

practiceRouter.post("/practice/start", asyncRoute(async (req, res) => {
  const count = clampNumber(req.body.count, 10, 1, 100);
  const category = normalizeCategory(req.body.category);
  const timerMinutes = normalizeTimer(req.body.timer_minutes);

  const questionRows = await selectRandomQuestions(count, category);
  if (questionRows.length === 0) {
    return res.status(400).json({ message: "No questions match this practice setup." });
  }

  const attempt = await createPracticeAttempt(req.user.id, questionRows, category, timerMinutes);

  res.status(201).json({
    attempt: formatAttempt(attempt),
    questions: questionRows.map(sanitizeQuestion)
  });
}));

practiceRouter.post("/practice/:attemptId/answer", asyncRoute(async (req, res) => {
  const attempt = await requireAttempt(req.params.attemptId, req.user.id, res);
  if (!attempt) return;
  if (attempt.completed_at) return res.status(400).json({ message: "This practice attempt is already complete." });

  const questionId = Number(req.body.question_id);
  const selectedAnswer = String(req.body.selected_answer || "").trim();
  if (!questionId || !selectedAnswer) {
    return res.status(400).json({ message: "Question and selected answer are required." });
  }

  const row = await getPracticeAnswerWithQuestion(attempt.id, questionId);
  if (!row) return res.status(404).json({ message: "Question is not part of this attempt." });

  if (row.answered_at) {
    return res.json({ feedback: formatFeedback(row) });
  }

  const normalizedAnswer = normalizeSelectedAnswer(selectedAnswer, row.type);
  const isCorrect = gradeAnswer(normalizedAnswer, row.correct_answer, row.type);

  await savePracticeAnswer(row.answer_id, normalizedAnswer, isCorrect);

  const updated = await getPracticeAnswerWithQuestion(attempt.id, questionId);
  res.json({ feedback: formatFeedback(updated) });
}));

practiceRouter.post("/practice/:attemptId/complete", asyncRoute(async (req, res) => {
  const attempt = await requireAttempt(req.params.attemptId, req.user.id, res);
  if (!attempt) return;

  if (!attempt.completed_at) {
    await completePracticeAttempt(attempt.id, req.body.timed_out);
  }

  res.json(await getAttemptReview(attempt.id, req.user.id));
}));

practiceRouter.get("/practice/:attemptId", asyncRoute(async (req, res) => {
  const attempt = await requireAttempt(req.params.attemptId, req.user.id, res);
  if (!attempt) return;
  res.json(await getAttemptReview(attempt.id, req.user.id));
}));

async function requireAttempt(attemptId, userId, res) {
  const attempt = await getPracticeAttempt(attemptId, userId);
  if (!attempt) {
    res.status(404).json({ message: "Practice attempt not found." });
    return null;
  }
  return attempt;
}

async function getAttemptReview(attemptId, userId) {
  const review = await getPracticeAttemptReview(attemptId, userId);
  if (!review) return null;
  const attempt = formatAttempt(review.attempt);
  const answers = review.answers.map((row) => ({
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
