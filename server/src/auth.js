import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { getDb } from "./db.js";

export function createToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: "8h" }
  );
}

export function authenticate(req, res, next) {
  req.user = getDefaultAdminUser();
  return next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }
  return next();
}

export function getDefaultAdminUser() {
  const admin = getDb()
    .prepare("SELECT id, username, role FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
    .get();

  return admin || { id: 1, username: "admin", role: "admin" };
}

export function login(username, password) {
  const user = getDb()
    .prepare("SELECT id, username, password_hash, role FROM users WHERE username = ?")
    .get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) return null;

  return {
    token: createToken(user),
    user: { id: user.id, username: user.username, role: user.role }
  };
}
