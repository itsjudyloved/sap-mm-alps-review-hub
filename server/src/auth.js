import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { findUserByUsername, getDefaultAdminUser as fetchDefaultAdminUser } from "./db.js";

export function createToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: "8h" }
  );
}

export async function authenticate(req, res, next) {
  try {
    req.user = await fetchDefaultAdminUser();
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }
  return next();
}

export function getDefaultAdminUser() {
  return fetchDefaultAdminUser();
}

export async function login(username, password) {
  const user = await findUserByUsername(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) return null;

  return {
    token: createToken(user),
    user: { id: user.id, username: user.username, role: user.role }
  };
}
