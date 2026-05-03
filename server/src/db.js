import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;
const staticQuestionsUrl = new URL("./staticQuestions.json", import.meta.url);

let sqliteDb;
let pgPool;
let initPromise;
let forceSqliteMemory = false;
let staticQuestions;

function shouldUsePostgres() {
  return Boolean(config.databaseUrl) && process.env.NODE_ENV !== "test" && !forceSqliteMemory;
}

export function getDatabaseMode() {
  return shouldUsePostgres() ? "postgres" : "sqlite";
}

export async function initializeDb() {
  if (!initPromise) {
    initPromise = shouldUsePostgres() ? initializePostgres() : initializeSqlite();
  }
  return initPromise;
}

export async function resetDbForTests() {
  forceSqliteMemory = true;
  initPromise = null;
  if (sqliteDb) sqliteDb.close();
  sqliteDb = new DatabaseSync(":memory:");
  sqliteDb.exec("PRAGMA foreign_keys = ON");
  migrateSqlite(sqliteDb);
  seedUsersSqlite(sqliteDb);
  initPromise = Promise.resolve();
  return sqliteDb;
}

export async function findUserByUsername(username) {
  await initializeDb();
  if (shouldUsePostgres()) {
    const { rows } = await pgPool.query(
      "SELECT id, username, password_hash, role FROM users WHERE username = $1",
      [username]
    );
    return rows[0] || null;
  }

  return sqliteDb
    .prepare("SELECT id, username, password_hash, role FROM users WHERE username = ?")
    .get(username);
}

export async function getDefaultAdminUser() {
  await initializeDb();
  if (shouldUsePostgres()) {
    const { rows } = await pgPool.query(
      "SELECT id, username, role FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"
    );
    return rows[0] || { id: 1, username: "admin", role: "admin" };
  }

  return sqliteDb
    .prepare("SELECT id, username, role FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
    .get() || { id: 1, username: "admin", role: "admin" };
}

export async function listCategories() {
  await initializeDb();
  if (shouldUsePostgres()) {
    const { rows } = await pgPool.query("SELECT DISTINCT category FROM questions ORDER BY category");
    return rows.map((row) => row.category);
  }

  return sqliteDb
    .prepare("SELECT DISTINCT category FROM questions ORDER BY category")
    .all()
    .map((row) => row.category);
}

export async function listQuestions(filters = {}, userId) {
  await initializeDb();
  return shouldUsePostgres()
    ? listQuestionsPostgres(filters, userId)
    : listQuestionsSqlite(filters, userId);
}

export async function createQuestion(question, userId) {
  await initializeDb();
  if (shouldUsePostgres()) {
    const id = await insertQuestionPostgres(pgPool, question, userId);
    return getQuestion(id, userId);
  }

  const result = sqliteDb
    .prepare(`
      INSERT INTO questions (
        question, type, choice_a, choice_b, choice_c, choice_d, correct_answer,
        explanation, category, difficulty, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      question.question,
      question.type,
      question.choice_a,
      question.choice_b,
      question.choice_c,
      question.choice_d,
      question.correct_answer,
      question.explanation,
      question.category,
      question.difficulty,
      userId
    );

  return getQuestion(result.lastInsertRowid, userId);
}

export async function updateQuestion(id, question, userId) {
  await initializeDb();
  if (shouldUsePostgres()) {
    const existing = await getQuestion(id, userId);
    if (!existing) return null;

    await pgPool.query(
      `
        UPDATE questions
        SET question = $1, type = $2, choice_a = $3, choice_b = $4,
          choice_c = $5, choice_d = $6, correct_answer = $7,
          explanation = $8, category = $9, difficulty = $10,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $11
      `,
      [
        question.question,
        question.type,
        question.choice_a,
        question.choice_b,
        question.choice_c,
        question.choice_d,
        question.correct_answer,
        question.explanation,
        question.category,
        question.difficulty,
        id
      ]
    );
    return getQuestion(id, userId);
  }

  const existing = await getQuestion(id, userId);
  if (!existing) return null;

  sqliteDb
    .prepare(`
      UPDATE questions
      SET question = ?, type = ?, choice_a = ?, choice_b = ?,
        choice_c = ?, choice_d = ?, correct_answer = ?,
        explanation = ?, category = ?, difficulty = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .run(
      question.question,
      question.type,
      question.choice_a,
      question.choice_b,
      question.choice_c,
      question.choice_d,
      question.correct_answer,
      question.explanation,
      question.category,
      question.difficulty,
      id
    );

  return getQuestion(id, userId);
}

export async function deleteQuestion(id) {
  await initializeDb();
  if (shouldUsePostgres()) {
    await pgPool.query("DELETE FROM questions WHERE id = $1", [id]);
    return;
  }

  sqliteDb.prepare("DELETE FROM questions WHERE id = ?").run(id);
}

export async function saveBatchQuestions(questions, userId) {
  await initializeDb();
  if (shouldUsePostgres()) {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      const ids = [];
      for (const question of questions) {
        ids.push(await insertQuestionPostgres(client, question, userId));
      }
      await client.query("COMMIT");
      return Promise.all(ids.map((id) => getQuestion(id, userId)));
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  const saved = [];
  try {
    sqliteDb.exec("BEGIN");
    for (const question of questions) {
      const result = sqliteDb
        .prepare(`
          INSERT INTO questions (
            question, type, choice_a, choice_b, choice_c, choice_d, correct_answer,
            explanation, category, difficulty, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          question.question,
          question.type,
          question.choice_a,
          question.choice_b,
          question.choice_c,
          question.choice_d,
          question.correct_answer,
          question.explanation,
          question.category,
          question.difficulty,
          userId
        );
      saved.push(result.lastInsertRowid);
    }
    sqliteDb.exec("COMMIT");
  } catch (err) {
    sqliteDb.exec("ROLLBACK");
    throw err;
  }

  return Promise.all(saved.map((id) => getQuestion(id, userId)));
}

export async function getQuestion(id, userId) {
  await initializeDb();
  if (shouldUsePostgres()) {
    const { rows } = await pgPool.query(
      `
        SELECT q.*, CASE WHEN rm.id IS NULL THEN 0 ELSE 1 END AS marked
        FROM questions q
        LEFT JOIN review_marks rm ON rm.question_id = q.id AND rm.user_id = $1
        WHERE q.id = $2
      `,
      [userId, id]
    );
    return rows[0] || null;
  }

  return sqliteDb
    .prepare(`
      SELECT q.*, CASE WHEN rm.id IS NULL THEN 0 ELSE 1 END AS marked
      FROM questions q
      LEFT JOIN review_marks rm ON rm.question_id = q.id AND rm.user_id = ?
      WHERE q.id = ?
    `)
    .get(userId, id);
}

export async function markQuestion(questionId, userId) {
  await initializeDb();
  const question = await getQuestion(questionId, userId);
  if (!question) return false;

  if (shouldUsePostgres()) {
    await pgPool.query(
      "INSERT INTO review_marks (user_id, question_id) VALUES ($1, $2) ON CONFLICT (user_id, question_id) DO NOTHING",
      [userId, questionId]
    );
    return true;
  }

  sqliteDb
    .prepare("INSERT OR IGNORE INTO review_marks (user_id, question_id) VALUES (?, ?)")
    .run(userId, questionId);
  return true;
}

export async function unmarkQuestion(questionId, userId) {
  await initializeDb();
  if (shouldUsePostgres()) {
    await pgPool.query("DELETE FROM review_marks WHERE user_id = $1 AND question_id = $2", [userId, questionId]);
    return;
  }

  sqliteDb.prepare("DELETE FROM review_marks WHERE user_id = ? AND question_id = ?").run(userId, questionId);
}

export async function listPracticeAttempts(userId, limit) {
  await initializeDb();
  if (shouldUsePostgres()) {
    const { rows } = await pgPool.query(
      `
        SELECT *
        FROM exam_attempts
        WHERE user_id = $1 AND mode = 'practice' AND completed_at IS NOT NULL
        ORDER BY completed_at DESC, id DESC
        LIMIT $2
      `,
      [userId, limit]
    );
    return rows;
  }

  return sqliteDb
    .prepare(`
      SELECT *
      FROM exam_attempts
      WHERE user_id = ? AND mode = 'practice' AND completed_at IS NOT NULL
      ORDER BY completed_at DESC, id DESC
      LIMIT ?
    `)
    .all(userId, limit);
}

export async function selectRandomQuestions(count, category) {
  await initializeDb();
  if (shouldUsePostgres()) {
    const values = category ? [category, count] : [count];
    const where = category ? "WHERE category = $1" : "";
    const limit = category ? "$2" : "$1";
    const { rows } = await pgPool.query(
      `
        SELECT id, question, type, choice_a, choice_b, choice_c, choice_d, category, difficulty
        FROM questions
        ${where}
        ORDER BY RANDOM()
        LIMIT ${limit}
      `,
      values
    );
    return rows;
  }

  if (category) {
    return sqliteDb
      .prepare(`
        SELECT id, question, type, choice_a, choice_b, choice_c, choice_d, category, difficulty
        FROM questions
        WHERE category = ?
        ORDER BY RANDOM()
        LIMIT ?
      `)
      .all(category, count);
  }

  return sqliteDb
    .prepare(`
      SELECT id, question, type, choice_a, choice_b, choice_c, choice_d, category, difficulty
      FROM questions
      ORDER BY RANDOM()
      LIMIT ?
    `)
    .all(count);
}

export async function createPracticeAttempt(userId, questionRows, category, timerMinutes) {
  await initializeDb();
  if (shouldUsePostgres()) {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `
          INSERT INTO exam_attempts (user_id, mode, score, total_items, category, timer_minutes)
          VALUES ($1, 'practice', 0, $2, $3, $4)
          RETURNING id
        `,
        [userId, questionRows.length, category, timerMinutes]
      );
      const attemptId = rows[0].id;
      for (const [index, question] of questionRows.entries()) {
        await client.query(
          "INSERT INTO exam_answers (attempt_id, question_id, position) VALUES ($1, $2, $3)",
          [attemptId, question.id, index + 1]
        );
      }
      await client.query("COMMIT");
      return getPracticeAttempt(attemptId, userId);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  let attemptId;
  try {
    sqliteDb.exec("BEGIN");
    const result = sqliteDb
      .prepare(`
        INSERT INTO exam_attempts (user_id, mode, score, total_items, category, timer_minutes)
        VALUES (?, 'practice', 0, ?, ?, ?)
      `)
      .run(userId, questionRows.length, category, timerMinutes);
    attemptId = result.lastInsertRowid;

    const insertAnswer = sqliteDb.prepare(`
      INSERT INTO exam_answers (attempt_id, question_id, position)
      VALUES (?, ?, ?)
    `);
    questionRows.forEach((question, index) => insertAnswer.run(attemptId, question.id, index + 1));
    sqliteDb.exec("COMMIT");
  } catch (err) {
    sqliteDb.exec("ROLLBACK");
    throw err;
  }

  return getPracticeAttempt(attemptId, userId);
}

export async function getPracticeAttempt(id, userId) {
  await initializeDb();
  if (shouldUsePostgres()) {
    const { rows } = await pgPool.query(
      "SELECT * FROM exam_attempts WHERE id = $1 AND user_id = $2 AND mode = 'practice'",
      [id, userId]
    );
    return rows[0] || null;
  }

  return sqliteDb
    .prepare("SELECT * FROM exam_attempts WHERE id = ? AND user_id = ? AND mode = 'practice'")
    .get(id, userId);
}

export async function getPracticeAnswerWithQuestion(attemptId, questionId) {
  await initializeDb();
  if (shouldUsePostgres()) {
    const { rows } = await pgPool.query(
      `
        SELECT ea.id AS answer_id, ea.attempt_id, ea.question_id, ea.position, ea.selected_answer,
          ea.is_correct, ea.answered_at, q.question, q.type, q.choice_a, q.choice_b,
          q.choice_c, q.choice_d, q.correct_answer, q.explanation, q.category, q.difficulty
        FROM exam_answers ea
        JOIN questions q ON q.id = ea.question_id
        WHERE ea.attempt_id = $1 AND ea.question_id = $2
      `,
      [attemptId, questionId]
    );
    return rows[0] || null;
  }

  return sqliteDb
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

export async function savePracticeAnswer(answerId, selectedAnswer, isCorrect) {
  await initializeDb();
  if (shouldUsePostgres()) {
    await pgPool.query(
      `
        UPDATE exam_answers
        SET selected_answer = $1, is_correct = $2, answered_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `,
      [selectedAnswer, Boolean(isCorrect), answerId]
    );
    return;
  }

  sqliteDb
    .prepare(`
      UPDATE exam_answers
      SET selected_answer = ?, is_correct = ?, answered_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .run(selectedAnswer, isCorrect ? 1 : 0, answerId);
}

export async function completePracticeAttempt(attemptId, timedOut) {
  await initializeDb();
  if (shouldUsePostgres()) {
    await pgPool.query(
      "UPDATE exam_answers SET is_correct = FALSE WHERE attempt_id = $1 AND is_correct IS NULL",
      [attemptId]
    );
    const { rows } = await pgPool.query(
      "SELECT COUNT(*)::int AS score FROM exam_answers WHERE attempt_id = $1 AND is_correct = TRUE",
      [attemptId]
    );
    await pgPool.query(
      `
        UPDATE exam_attempts
        SET score = $1,
          timed_out = $2,
          duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))::integer,
          completed_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `,
      [rows[0].score, Boolean(timedOut), attemptId]
    );
    return;
  }

  sqliteDb
    .prepare("UPDATE exam_answers SET is_correct = 0 WHERE attempt_id = ? AND is_correct IS NULL")
    .run(attemptId);

  const score = sqliteDb
    .prepare("SELECT COUNT(*) AS score FROM exam_answers WHERE attempt_id = ? AND is_correct = 1")
    .get(attemptId).score;

  sqliteDb
    .prepare(`
      UPDATE exam_attempts
      SET score = ?,
        timed_out = ?,
        duration_seconds = CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER),
        completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .run(score, timedOut ? 1 : 0, attemptId);
}

export async function getPracticeAttemptReview(attemptId, userId) {
  await initializeDb();
  const attempt = await getPracticeAttempt(attemptId, userId);
  if (!attempt) return null;

  const answers = shouldUsePostgres()
    ? await getPracticeAnswersPostgres(attemptId)
    : getPracticeAnswersSqlite(attemptId);

  return { attempt, answers };
}

async function initializePostgres() {
  pgPool = new Pool({
    connectionString: config.databaseUrl,
    max: 1,
    ssl: config.databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false }
  });
  await migratePostgres(pgPool);
  await seedUsersPostgres(pgPool);
  await seedStaticQuestionsPostgres(pgPool);
}

async function initializeSqlite() {
  if (!sqliteDb) sqliteDb = new DatabaseSync(config.dbPath);
  sqliteDb.exec("PRAGMA foreign_keys = ON");
  migrateSqlite(sqliteDb);
  seedUsersSqlite(sqliteDb);
  seedStaticQuestionsSqlite(sqliteDb);
}

function listQuestionsSqlite(filters, userId) {
  const clauses = [];
  const params = [userId];

  if (filters.search) {
    clauses.push("(q.question LIKE ? OR q.explanation LIKE ?)");
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.category) {
    clauses.push("q.category = ?");
    params.push(filters.category);
  }
  if (filters.type) {
    clauses.push("q.type = ?");
    params.push(filters.type);
  }
  if (filters.difficulty) {
    clauses.push("q.difficulty = ?");
    params.push(filters.difficulty);
  }
  if (filters.marked === "true") clauses.push("rm.id IS NOT NULL");

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return sqliteDb
    .prepare(`
      SELECT q.*, CASE WHEN rm.id IS NULL THEN 0 ELSE 1 END AS marked
      FROM questions q
      LEFT JOIN review_marks rm ON rm.question_id = q.id AND rm.user_id = ?
      ${where}
      ORDER BY q.updated_at DESC, q.id DESC
    `)
    .all(...params);
}

async function listQuestionsPostgres(filters, userId) {
  const clauses = [];
  const values = [userId];

  function add(value) {
    values.push(value);
    return `$${values.length}`;
  }

  if (filters.search) {
    const search = add(`%${filters.search}%`);
    clauses.push(`(q.question ILIKE ${search} OR q.explanation ILIKE ${search})`);
  }
  if (filters.category) clauses.push(`q.category = ${add(filters.category)}`);
  if (filters.type) clauses.push(`q.type = ${add(filters.type)}`);
  if (filters.difficulty) clauses.push(`q.difficulty = ${add(filters.difficulty)}`);
  if (filters.marked === "true") clauses.push("rm.id IS NOT NULL");

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pgPool.query(
    `
      SELECT q.*, CASE WHEN rm.id IS NULL THEN 0 ELSE 1 END AS marked
      FROM questions q
      LEFT JOIN review_marks rm ON rm.question_id = q.id AND rm.user_id = $1
      ${where}
      ORDER BY q.updated_at DESC, q.id DESC
    `,
    values
  );
  return rows;
}

async function insertQuestionPostgres(client, question, userId) {
  const { rows } = await client.query(
    `
      INSERT INTO questions (
        question, type, choice_a, choice_b, choice_c, choice_d, correct_answer,
        explanation, category, difficulty, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `,
    [
      question.question,
      question.type,
      question.choice_a,
      question.choice_b,
      question.choice_c,
      question.choice_d,
      question.correct_answer,
      question.explanation,
      question.category,
      question.difficulty,
      userId
    ]
  );
  return rows[0].id;
}

async function getPracticeAnswersPostgres(attemptId) {
  const { rows } = await pgPool.query(
    `
      SELECT ea.question_id, ea.position, ea.selected_answer, ea.is_correct, ea.answered_at,
        q.question, q.type, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
        q.correct_answer, q.explanation, q.category, q.difficulty
      FROM exam_answers ea
      JOIN questions q ON q.id = ea.question_id
      WHERE ea.attempt_id = $1
      ORDER BY ea.position ASC
    `,
    [attemptId]
  );
  return rows;
}

function getPracticeAnswersSqlite(attemptId) {
  return sqliteDb
    .prepare(`
      SELECT ea.question_id, ea.position, ea.selected_answer, ea.is_correct, ea.answered_at,
        q.question, q.type, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
        q.correct_answer, q.explanation, q.category, q.difficulty
      FROM exam_answers ea
      JOIN questions q ON q.id = ea.question_id
      WHERE ea.attempt_id = ?
      ORDER BY ea.position ASC
    `)
    .all(attemptId);
}

function migrateSqlite(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'student')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('multiple_choice', 'true_false', 'identification')),
      choice_a TEXT,
      choice_b TEXT,
      choice_c TEXT,
      choice_d TEXT,
      correct_answer TEXT NOT NULL,
      explanation TEXT,
      category TEXT NOT NULL DEFAULT 'Uncategorized',
      difficulty TEXT NOT NULL DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard')),
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS review_marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, question_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exam_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      mode TEXT NOT NULL DEFAULT 'practice',
      score INTEGER NOT NULL DEFAULT 0,
      total_items INTEGER NOT NULL,
      category TEXT,
      timer_minutes INTEGER,
      duration_seconds INTEGER,
      timed_out INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exam_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      selected_answer TEXT,
      is_correct INTEGER,
      answered_at TEXT,
      UNIQUE(attempt_id, question_id),
      FOREIGN KEY(attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE,
      FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
    );
  `);
}

async function migratePostgres(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'student')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      question TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('multiple_choice', 'true_false', 'identification')),
      choice_a TEXT,
      choice_b TEXT,
      choice_c TEXT,
      choice_d TEXT,
      correct_answer TEXT NOT NULL,
      explanation TEXT,
      category TEXT NOT NULL DEFAULT 'Uncategorized',
      difficulty TEXT NOT NULL DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard')),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS review_marks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      marked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS exam_attempts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL DEFAULT 'practice',
      score INTEGER NOT NULL DEFAULT 0,
      total_items INTEGER NOT NULL,
      category TEXT,
      timer_minutes INTEGER,
      duration_seconds INTEGER,
      timed_out BOOLEAN NOT NULL DEFAULT FALSE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS exam_answers (
      id SERIAL PRIMARY KEY,
      attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      selected_answer TEXT,
      is_correct BOOLEAN,
      answered_at TIMESTAMPTZ,
      UNIQUE(attempt_id, question_id)
    );
  `);
}

function seedUsersSqlite(database) {
  const count = database.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (count > 0) return;

  const insert = database.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)");
  insert.run("admin", bcrypt.hashSync("admin123", 10), "admin");
  insert.run("student", bcrypt.hashSync("student123", 10), "student");
}

async function seedUsersPostgres(pool) {
  await pool.query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING", [
    "admin",
    bcrypt.hashSync("admin123", 10),
    "admin"
  ]);
  await pool.query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING", [
    "student",
    bcrypt.hashSync("student123", 10),
    "student"
  ]);
}

function getStaticQuestions() {
  if (!staticQuestions) {
    staticQuestions = JSON.parse(readFileSync(staticQuestionsUrl, "utf8"));
  }
  return staticQuestions;
}

function seedStaticQuestionsSqlite(database) {
  const questions = getStaticQuestions();
  if (!questions.length) return;

  const admin = database
    .prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
    .get();
  const adminId = admin?.id || null;
  const exists = database.prepare("SELECT id FROM questions WHERE question = ? LIMIT 1");
  const insert = database.prepare(`
    INSERT INTO questions (
      question, type, choice_a, choice_b, choice_c, choice_d, correct_answer,
      explanation, category, difficulty, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    database.exec("BEGIN");
    for (const question of questions) {
      if (exists.get(question.question)) continue;
      insert.run(
        question.question,
        question.type,
        question.choice_a,
        question.choice_b,
        question.choice_c,
        question.choice_d,
        question.correct_answer,
        question.explanation,
        question.category,
        question.difficulty,
        adminId
      );
    }
    database.exec("COMMIT");
  } catch (err) {
    database.exec("ROLLBACK");
    throw err;
  }
}

async function seedStaticQuestionsPostgres(pool) {
  const questions = getStaticQuestions();
  if (!questions.length) return;

  const { rows } = await pool.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  const adminId = rows[0]?.id || null;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    for (const question of questions) {
      const existing = await client.query("SELECT id FROM questions WHERE question = $1 LIMIT 1", [question.question]);
      if (existing.rows.length) continue;
      await insertQuestionPostgres(client, question, adminId);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
