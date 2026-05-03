import { validateQuestion } from "./validation.js";

export function parseBatch(text = "") {
  const blocks = splitQuestionBlocks(text);

  return blocks.map((block, index) => {
    const parsed = {};
    for (const rawLine of block.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      const field = line.match(/^([A-Za-z0-9_ ]+):\s*(.*)$/);
      const choice = line.match(/^([A-D])[\.\):]\s*(.*)$/i);

      if (choice) {
        parsed[`choice_${choice[1].toLowerCase()}`] = choice[2].trim();
      } else if (field) {
        const key = field[1].trim().toLowerCase().replace(/\s+/g, "_");
        const value = field[2].trim();
        if (key === "question" || key === "question_text" || /^question_\d+$/.test(key)) parsed.question = value;
        if (key === "type") parsed.type = value;
        if (["answer", "correct_answer", "correct"].includes(key)) parsed.correct_answer = value;
        if (key === "category") parsed.category = value;
        if (key === "difficulty") parsed.difficulty = value;
        if (key === "explanation") parsed.explanation = value;
      }
    }

    parsed.type ||= inferType(parsed);

    const result = validateQuestion(parsed);
    return {
      row: index + 1,
      raw: block,
      valid: result.valid,
      errors: result.errors,
      question: result.question
    };
  });
}

function splitQuestionBlocks(text) {
  const blocks = [];
  let current = [];

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    const startsQuestion = /^question(?:\s+\d+)?:/i.test(line) || /^question_text:/i.test(line);
    if (startsQuestion && current.some((item) => item.trim())) {
      blocks.push(current.join("\n").trim());
      current = [];
    }
    if (line || current.length) current.push(rawLine);
  }

  if (current.some((item) => item.trim())) blocks.push(current.join("\n").trim());

  return blocks
    .flatMap((block) => block.split(/\n\s*\n/g))
    .map((block) => block.trim())
    .filter(Boolean);
}

function inferType(parsed) {
  const hasChoices = ["choice_a", "choice_b", "choice_c", "choice_d"].every((key) => parsed[key]);
  if (hasChoices) return "multiple_choice";

  const answer = String(parsed.correct_answer || "").trim().toLowerCase();
  if (answer === "true" || answer === "false") return "true_false";

  return "identification";
}
