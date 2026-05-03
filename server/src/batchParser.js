import { validateQuestion } from "./validation.js";

export function parseBatch(text = "") {
  const blocks = String(text)
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block, index) => {
    const parsed = {};
    for (const rawLine of block.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      const field = line.match(/^([A-Za-z_ ]+):\s*(.*)$/);
      const choice = line.match(/^([A-D])\.\s*(.*)$/i);

      if (choice) {
        parsed[`choice_${choice[1].toLowerCase()}`] = choice[2].trim();
      } else if (field) {
        const key = field[1].trim().toLowerCase().replace(/\s+/g, "_");
        const value = field[2].trim();
        if (key === "question") parsed.question = value;
        if (key === "type") parsed.type = value;
        if (key === "answer") parsed.correct_answer = value;
        if (key === "category") parsed.category = value;
        if (key === "difficulty") parsed.difficulty = value;
        if (key === "explanation") parsed.explanation = value;
      }
    }

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
