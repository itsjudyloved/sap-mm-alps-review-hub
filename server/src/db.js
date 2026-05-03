import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import { config } from "./config.js";

let db;

export function getDb() {
  if (!db) {
    db = new DatabaseSync(config.dbPath);
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db);
    seedUsers(db);
  }
  return db;
}

export function resetDbForTests() {
  if (db) db.close();
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  seedUsers(db);
  return db;
}

function migrate(database) {
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
  `);
}

function seedUsers(database) {
  const count = database.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (count > 0) return;

  const insert = database.prepare(
    "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
  );
  insert.run("admin", bcrypt.hashSync("admin123", 10), "admin");
  insert.run("student", bcrypt.hashSync("student123", 10), "student");
}
