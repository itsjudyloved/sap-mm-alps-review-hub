export const NEWLY_ADDED_CATEGORY = "Newly Added";

export const NEWLY_ADDED_QUESTIONS = [
  "What is a Purchase Requisition (PR)?",
  "What is the purpose of a Purchase Order (PO)?",
  "Which transaction code is used to create a Purchase Order?",
  "What is Goods Receipt (GR)?",
  "Which transaction code is used for Goods Receipt?",
  "What happens during Goods Receipt?",
  "What document is created after Goods Receipt?",
  "What is Invoice Verification?",
  "Which transaction code is used for Invoice Verification?",
  "What is the 3-way match?",
  "Which step affects stock?",
  "Which step affects financial accounting?",
  "What is a vendor?",
  "What is a purchasing organization?",
  "What is a purchasing group?",
  "What is a source list?",
  "What is a contract in SAP MM?",
  "What is a scheduling agreement?",
  "What is the purpose of Goods Issue?",
  "What is unrestricted stock?",
  "What is the purpose of ME21N?",
  "What is the purpose of MIGO?",
  "What is the purpose of MIRO?",
  "What is the purpose of MM01?",
  "What is the purpose of MB52?",
  "What is the purpose of MB51?",
  "What is the purpose of MMBE?",
  "What is the purpose of MI01?",
  "What is the purpose of ME22N?",
  "What is the purpose of ME23N?",
  "What does movement type 561 mean?",
  "What does movement type 562 mean?",
  "What is the purpose of movement type 101?",
  "What is the purpose of movement type 102?",
  "What is the purpose of movement type 201?",
  "What is the purpose of movement type 301?",
  "What is the purpose of movement type 311?",
  "What is the purpose of movement type 122?",
  "Which movement type increases stock?",
  "Which movement type decreases stock?"
];

export function isSpecialCategory(category) {
  return normalizeCategory(category) === normalizeCategory(NEWLY_ADDED_CATEGORY);
}

export function getSpecialCategoryQuestions(category) {
  if (!isSpecialCategory(category)) return [];
  return NEWLY_ADDED_QUESTIONS;
}

export function appendSpecialCategories(categories) {
  return [...new Set([...categories, NEWLY_ADDED_CATEGORY])].sort();
}

export function normalizeQuestionText(question) {
  return String(question || "").trim().toLowerCase();
}

function normalizeCategory(category) {
  return String(category || "").trim().toLowerCase();
}
