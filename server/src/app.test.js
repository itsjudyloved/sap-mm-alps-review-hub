import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { resetDbForTests } from "./db.js";

const app = createApp();

beforeEach(() => {
  resetDbForTests();
});

async function loginAs(username, password) {
  const res = await request(app).post("/api/auth/login").send({ username, password });
  return res.body.token;
}

async function createQuestion(token, overrides = {}) {
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

  const res = await request(app).post("/api/questions").set("Authorization", `Bearer ${token}`).send(body);
  expect(res.status).toBe(201);
  return res.body.question;
}

describe("auth", () => {
  it("logs in seeded users and rejects bad credentials", async () => {
    const ok = await request(app).post("/api/auth/login").send({ username: "admin", password: "admin123" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe("admin");

    const bad = await request(app).post("/api/auth/login").send({ username: "admin", password: "wrong" });
    expect(bad.status).toBe(401);
  });
});

describe("practice exams", () => {
  it("starts a randomized attempt with filtered questions and hides answers", async () => {
    const admin = await loginAs("admin", "admin123");
    const student = await loginAs("student", "student123");
    await createQuestion(admin, { question: "ERP?", category: "SAP Basics" });
    await createQuestion(admin, { question: "PO?", category: "Procurement" });

    const res = await request(app)
      .post("/api/practice/start")
      .set("Authorization", `Bearer ${student}`)
      .send({ count: 10, category: "SAP Basics", timer_minutes: 15 });

    expect(res.status).toBe(201);
    expect(res.body.attempt.total_items).toBe(1);
    expect(res.body.attempt.category).toBe("SAP Basics");
    expect(res.body.attempt.timer_minutes).toBe(15);
    expect(res.body.questions).toHaveLength(1);
    expect(res.body.questions[0]).not.toHaveProperty("correct_answer");
    expect(res.body.questions[0]).not.toHaveProperty("explanation");
  });

  it("fails cleanly when no questions match the setup", async () => {
    const student = await loginAs("student", "student123");
    const res = await request(app)
      .post("/api/practice/start")
      .set("Authorization", `Bearer ${student}`)
      .send({ count: 10, category: "SAP Basics" });

    expect(res.status).toBe(400);
  });

  it("scores answers by type and locks the first answer", async () => {
    const admin = await loginAs("admin", "admin123");
    const student = await loginAs("student", "student123");
    const mc = await createQuestion(admin);
    const tf = await createQuestion(admin, {
      question: "SAP MM manages materials.",
      type: "true_false",
      correct_answer: "True",
      choice_a: "",
      choice_b: "",
      choice_c: "",
      choice_d: ""
    });
    const identification = await createQuestion(admin, {
      question: "What does PO mean?",
      type: "identification",
      correct_answer: "Purchase Order",
      choice_a: "",
      choice_b: "",
      choice_c: "",
      choice_d: ""
    });

    const start = await request(app)
      .post("/api/practice/start")
      .set("Authorization", `Bearer ${student}`)
      .send({ count: 3 });

    const attemptId = start.body.attempt.id;
    const mcAnswer = await request(app)
      .post(`/api/practice/${attemptId}/answer`)
      .set("Authorization", `Bearer ${student}`)
      .send({ question_id: mc.id, selected_answer: "B" });
    expect(mcAnswer.body.feedback.is_correct).toBe(true);

    const locked = await request(app)
      .post(`/api/practice/${attemptId}/answer`)
      .set("Authorization", `Bearer ${student}`)
      .send({ question_id: mc.id, selected_answer: "A" });
    expect(locked.body.feedback.is_correct).toBe(true);
    expect(locked.body.feedback.selected_answer).toBe("B");

    const tfAnswer = await request(app)
      .post(`/api/practice/${attemptId}/answer`)
      .set("Authorization", `Bearer ${student}`)
      .send({ question_id: tf.id, selected_answer: "true" });
    expect(tfAnswer.body.feedback.selected_answer).toBe("True");
    expect(tfAnswer.body.feedback.is_correct).toBe(true);

    const idAnswer = await request(app)
      .post(`/api/practice/${attemptId}/answer`)
      .set("Authorization", `Bearer ${student}`)
      .send({ question_id: identification.id, selected_answer: " purchase order " });
    expect(idAnswer.body.feedback.is_correct).toBe(true);
  });

  it("completes attempts with unanswered questions wrong and timeout recorded", async () => {
    const admin = await loginAs("admin", "admin123");
    const student = await loginAs("student", "student123");
    const first = await createQuestion(admin, { question: "Question 1" });
    await createQuestion(admin, { question: "Question 2" });
    await createQuestion(admin, { question: "Question 3" });

    const start = await request(app)
      .post("/api/practice/start")
      .set("Authorization", `Bearer ${student}`)
      .send({ count: 3 });

    await request(app)
      .post(`/api/practice/${start.body.attempt.id}/answer`)
      .set("Authorization", `Bearer ${student}`)
      .send({ question_id: first.id, selected_answer: "B" });

    const completed = await request(app)
      .post(`/api/practice/${start.body.attempt.id}/complete`)
      .set("Authorization", `Bearer ${student}`)
      .send({ timed_out: true });

    expect(completed.status).toBe(200);
    expect(completed.body.summary.score).toBe(1);
    expect(completed.body.summary.wrong_answers).toBe(2);
    expect(completed.body.attempt.timed_out).toBe(true);
    expect(completed.body.answers.filter((answer) => answer.is_correct === false)).toHaveLength(2);

    const attempts = await request(app)
      .get("/api/practice/attempts")
      .set("Authorization", `Bearer ${student}`);
    expect(attempts.body.attempts).toHaveLength(1);
    expect(attempts.body.attempts[0].score).toBe(1);
  });

  it("prevents users from viewing attempts they do not own", async () => {
    const admin = await loginAs("admin", "admin123");
    const student = await loginAs("student", "student123");
    await createQuestion(admin);

    const start = await request(app)
      .post("/api/practice/start")
      .set("Authorization", `Bearer ${student}`)
      .send({ count: 1 });

    const res = await request(app)
      .get(`/api/practice/${start.body.attempt.id}`)
      .set("Authorization", `Bearer ${admin}`);

    expect(res.status).toBe(404);
  });
});

describe("questions", () => {
  it("protects admin mutation routes", async () => {
    const token = await loginAs("student", "student123");
    const res = await request(app)
      .post("/api/questions")
      .set("Authorization", `Bearer ${token}`)
      .send({ question: "What is ERP?", type: "identification", correct_answer: "Enterprise Resource Planning" });

    expect(res.status).toBe(403);
  });

  it("validates and creates questions", async () => {
    const token = await loginAs("admin", "admin123");
    const invalid = await request(app)
      .post("/api/questions")
      .set("Authorization", `Bearer ${token}`)
      .send({ question: "What is ERP?", type: "multiple_choice", correct_answer: "E" });
    expect(invalid.status).toBe(400);

    const valid = await request(app)
      .post("/api/questions")
      .set("Authorization", `Bearer ${token}`)
      .send({
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
    const token = await loginAs("admin", "admin123");
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

    const res = await request(app)
      .post("/api/questions/batch-preview")
      .set("Authorization", `Bearer ${token}`)
      .send({ text });

    expect(res.status).toBe(200);
    expect(res.body.validCount).toBe(1);
    expect(res.body.rows[0].question.category).toBe("Uncategorized");
    expect(res.body.rows[1].valid).toBe(false);
  });

  it("persists marks per user", async () => {
    const admin = await loginAs("admin", "admin123");
    const student = await loginAs("student", "student123");

    const created = await request(app)
      .post("/api/questions")
      .set("Authorization", `Bearer ${admin}`)
      .send({ question: "Define SAP MM.", type: "identification", correct_answer: "Materials Management" });

    await request(app)
      .post(`/api/questions/${created.body.question.id}/mark`)
      .set("Authorization", `Bearer ${student}`)
      .send();

    const studentList = await request(app).get("/api/questions").set("Authorization", `Bearer ${student}`);
    const adminList = await request(app).get("/api/questions").set("Authorization", `Bearer ${admin}`);
    expect(studentList.body.questions[0].marked).toBe(1);
    expect(adminList.body.questions[0].marked).toBe(0);
  });
});
