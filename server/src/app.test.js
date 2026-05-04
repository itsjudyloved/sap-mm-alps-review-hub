import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { resetDbForTests } from "./db.js";

const app = createApp();

beforeEach(async () => {
  await resetDbForTests();
});

async function createQuestion(overrides = {}) {
  const body = {
    question: "What is ERP?",
    type: "multiple_choice",
    choice_a: "Inventory system",
    choice_b: "Integrated business system",
    choice_c: "Accounting tool",
    choice_d: "Warehouse system",
    correct_answer: "B",
    category: "SAP Basics",
    difficulty: "easy",
    ...overrides
  };

  const res = await request(app).post("/api/questions").send(body);
  expect(res.status).toBe(201);
  return res.body.question;
}

describe("auth compatibility", () => {
  it("keeps seeded login endpoint working but does not require it", async () => {
    const ok = await request(app).post("/api/auth/login").send({ username: "admin", password: "admin123" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe("admin");

    const publicList = await request(app).get("/api/questions");
    expect(publicList.status).toBe(200);

    const bad = await request(app).post("/api/auth/login").send({ username: "admin", password: "wrong" });
    expect(bad.status).toBe(401);
  });
});

describe("practice exams", () => {
  it("starts a randomized attempt with filtered questions and hides answers", async () => {
    await createQuestion({ question: "ERP?", category: "SAP Basics" });
    await createQuestion({ question: "PO?", category: "Procurement" });

    const res = await request(app)
      .post("/api/practice/start")
      .send({ count: 10, category: "SAP Basics", timer_minutes: 15 });

    expect(res.status).toBe(201);
    expect(res.body.attempt.total_items).toBe(1);
    expect(res.body.attempt.category).toBe("SAP Basics");
    expect(res.body.attempt.timer_minutes).toBe(15);
    expect(res.body.questions).toHaveLength(1);
    expect(res.body.questions[0]).not.toHaveProperty("correct_answer");
    expect(res.body.questions[0]).not.toHaveProperty("explanation");
  });

  it("supports the Newly Added category in practice setup", async () => {
    await createQuestion({ question: "What is the purpose of ME21N?", category: "Transaction Codes" });

    const categories = await request(app).get("/api/categories");
    expect(categories.status).toBe(200);
    expect(categories.body.categories).toContain("Newly Added");

    const res = await request(app)
      .post("/api/practice/start")
      .send({ count: 5, category: "Newly Added" });

    expect(res.status).toBe(201);
    expect(res.body.attempt.category).toBe("Newly Added");
    expect(res.body.questions).toHaveLength(1);
    expect(res.body.questions[0].question).toBe("What is the purpose of ME21N?");
  });

  it("fails cleanly when no questions match the setup", async () => {
    const res = await request(app).post("/api/practice/start").send({ count: 10, category: "SAP Basics" });

    expect(res.status).toBe(400);
  });

  it("scores answers by type and locks the first answer", async () => {
    const mc = await createQuestion();
    const tf = await createQuestion({
      question: "SAP MM manages materials.",
      type: "true_false",
      correct_answer: "True",
      choice_a: "",
      choice_b: "",
      choice_c: "",
      choice_d: ""
    });
    const identification = await createQuestion({
      question: "What does PO mean?",
      type: "identification",
      correct_answer: "Purchase Order",
      choice_a: "",
      choice_b: "",
      choice_c: "",
      choice_d: ""
    });

    const start = await request(app).post("/api/practice/start").send({ count: 3 });

    const attemptId = start.body.attempt.id;
    const mcAnswer = await request(app)
      .post(`/api/practice/${attemptId}/answer`)
      .send({ question_id: mc.id, selected_answer: "B" });
    expect(mcAnswer.body.feedback.is_correct).toBe(true);

    const locked = await request(app)
      .post(`/api/practice/${attemptId}/answer`)
      .send({ question_id: mc.id, selected_answer: "A" });
    expect(locked.body.feedback.is_correct).toBe(true);
    expect(locked.body.feedback.selected_answer).toBe("B");

    const tfAnswer = await request(app)
      .post(`/api/practice/${attemptId}/answer`)
      .send({ question_id: tf.id, selected_answer: "true" });
    expect(tfAnswer.body.feedback.selected_answer).toBe("True");
    expect(tfAnswer.body.feedback.is_correct).toBe(true);

    const idAnswer = await request(app)
      .post(`/api/practice/${attemptId}/answer`)
      .send({ question_id: identification.id, selected_answer: " purchase order " });
    expect(idAnswer.body.feedback.is_correct).toBe(true);
  });

  it("completes attempts with unanswered questions wrong and timeout recorded", async () => {
    const first = await createQuestion({ question: "Question 1" });
    await createQuestion({ question: "Question 2" });
    await createQuestion({ question: "Question 3" });

    const start = await request(app).post("/api/practice/start").send({ count: 3 });

    await request(app)
      .post(`/api/practice/${start.body.attempt.id}/answer`)
      .send({ question_id: first.id, selected_answer: "B" });

    const completed = await request(app)
      .post(`/api/practice/${start.body.attempt.id}/complete`)
      .send({ timed_out: true });

    expect(completed.status).toBe(200);
    expect(completed.body.summary.score).toBe(1);
    expect(completed.body.summary.wrong_answers).toBe(2);
    expect(completed.body.attempt.timed_out).toBe(true);
    expect(completed.body.answers.filter((answer) => answer.is_correct === false)).toHaveLength(2);

    const attempts = await request(app).get("/api/practice/attempts");
    expect(attempts.body.attempts).toHaveLength(1);
    expect(attempts.body.attempts[0].score).toBe(1);
  });

  it("returns default admin attempt reviews without login", async () => {
    await createQuestion();

    const start = await request(app).post("/api/practice/start").send({ count: 1 });
    const res = await request(app).get(`/api/practice/${start.body.attempt.id}`);

    expect(res.status).toBe(200);
    expect(res.body.attempt.id).toBe(start.body.attempt.id);
  });
});

describe("questions", () => {
  it("allows public admin question creation", async () => {
    const res = await request(app)
      .post("/api/questions")
      .send({ question: "What is ERP?", type: "identification", correct_answer: "Enterprise Resource Planning" });

    expect(res.status).toBe(201);
    expect(res.body.question.created_by).toBe(1);
  });

  it("validates and creates questions", async () => {
    const invalid = await request(app)
      .post("/api/questions")
      .send({ question: "What is ERP?", type: "multiple_choice", correct_answer: "E" });
    expect(invalid.status).toBe(400);

    const valid = await request(app).post("/api/questions").send({
      question: "What is ERP?",
      type: "multiple_choice",
      choice_a: "Inventory system",
      choice_b: "Integrated business system",
      choice_c: "Accounting tool",
      choice_d: "Warehouse system",
      correct_answer: "B",
      category: "SAP Basics",
      difficulty: "easy"
    });
    expect(valid.status).toBe(201);
    expect(valid.body.question.category).toBe("SAP Basics");
  });

  it("previews batch valid and invalid rows with defaults", async () => {
    const text = `Question: What is ERP?
Type: multiple_choice
A. Inventory system
B. Integrated business system
C. Accounting tool
D. Warehouse system
Answer: B

Question: Bad sample
Type: true_false
Answer: Maybe`;

    const res = await request(app).post("/api/questions/batch-preview").send({ text });

    expect(res.status).toBe(200);
    expect(res.body.validCount).toBe(1);
    expect(res.body.rows[0].question.category).toBe("Uncategorized");
    expect(res.body.rows[1].valid).toBe(false);
  });

  it("parses pasted questions without explicit type or blank separators", async () => {
    const text = `Question: What is ERP?
A. Inventory system
B. Integrated business system
C. Accounting tool
D. Warehouse system
Correct Answer: B
Category: SAP Basics
Question: What does PO mean?
Answer: Purchase Order
Category: Procurement`;

    const res = await request(app).post("/api/questions/batch-preview").send({ text });

    expect(res.status).toBe(200);
    expect(res.body.validCount).toBe(2);
    expect(res.body.rows[0].question.type).toBe("multiple_choice");
    expect(res.body.rows[1].question.type).toBe("identification");
  });

  it("persists marks for the default admin user", async () => {
    const created = await request(app)
      .post("/api/questions")
      .send({ question: "Define SAP MM.", type: "identification", correct_answer: "Materials Management" });

    await request(app).post(`/api/questions/${created.body.question.id}/mark`).send();

    const list = await request(app).get("/api/questions");
    expect(list.body.questions[0].marked).toBe(1);
  });
});
