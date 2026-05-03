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

describe("auth", () => {
  it("logs in seeded users and rejects bad credentials", async () => {
    const ok = await request(app).post("/api/auth/login").send({ username: "admin", password: "admin123" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe("admin");

    const bad = await request(app).post("/api/auth/login").send({ username: "admin", password: "wrong" });
    expect(bad.status).toBe(401);
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
