const TYPES = ["multiple_choice", "true_false", "identification"];
const DIFFICULTIES = ["easy", "medium", "hard"];

export function normalizeQuestion(input = {}) {
  return {
    question: String(input.question || "").trim(),
    type: String(input.type || "").trim(),
    choice_a: nullable(input.choice_a),
    choice_b: nullable(input.choice_b),
    choice_c: nullable(input.choice_c),
    choice_d: nullable(input.choice_d),
    correct_answer: normalizeAnswer(input.correct_answer || input.answer),
    explanation: nullable(input.explanation),
    category: String(input.category || "Uncategorized").trim() || "Uncategorized",
    difficulty: String(input.difficulty || "medium").trim().toLowerCase()
  };
}

export function validateQuestion(input = {}) {
  const question = normalizeQuestion(input);
  const errors = [];

  if (!question.question) errors.push("Question is required.");
  if (!question.type) errors.push("Type is required.");
  if (!TYPES.includes(question.type)) errors.push("Type must be multiple_choice, true_false, or identification.");
  if (!question.correct_answer) errors.push("Correct answer is required.");
  if (!DIFFICULTIES.includes(question.difficulty)) errors.push("Difficulty must be easy, medium, or hard.");

  if (question.type === "multiple_choice") {
    ["choice_a", "choice_b", "choice_c", "choice_d"].forEach((key) => {
      if (!question[key]) errors.push(`${key.replace("choice_", "Choice ").toUpperCase()} is required.`);
    });
    if (!["A", "B", "C", "D"].includes(question.correct_answer.toUpperCase())) {
      errors.push("Multiple choice answer must be A, B, C, or D.");
    }
    question.correct_answer = question.correct_answer.toUpperCase();
  }

  if (question.type === "true_false") {
    const normalized = question.correct_answer.toLowerCase();
    if (!["true", "false"].includes(normalized)) {
      errors.push("True/false answer must be True or False.");
    } else {
      question.correct_answer = normalized === "true" ? "True" : "False";
    }
  }

  return { valid: errors.length === 0, errors, question };
}

function nullable(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeAnswer(value) {
  return String(value || "").trim();
}
