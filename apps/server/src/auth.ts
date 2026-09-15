import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { getDb } from "./db";
import { HttpError } from "./errors";
import { newId } from "./ids";

export const SESSION_COOKIE = "machia_session";
const SESSION_DAYS = 7;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

export type UserRole = "user" | "admin";

export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
}

function publicUser(row: Pick<UserRow, "id" | "username" | "role">): PublicUser {
  return { id: row.id, username: row.username, role: row.role };
}

function sessionMaxAgeSec(): number {
  return SESSION_DAYS * 24 * 60 * 60;
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    maxAge: sessionMaxAgeSec(),
  });
}

export function clearSessionCookie(c: Context): void {
  setCookie(c, SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    maxAge: 0,
  });
}

export async function registerUser(
  username: string,
  password: string,
): Promise<PublicUser> {
  const name = username.trim();
  if (!USERNAME_RE.test(name)) {
    throw new HttpError(
      400,
      "Username must be 3–32 characters (letters, numbers, underscore)",
    );
  }
  if (password.length < 8 || password.length > 128) {
    throw new HttpError(400, "Password must be 8–128 characters");
  }

  const db = await getDb();
  const taken = db
    .query(`SELECT id FROM users WHERE username = ?`)
    .get(name);
  if (taken) throw new HttpError(409, "Username already taken");

  const admins = db.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`).get();
  const role: UserRole = admins ? "user" : "admin";
  const id = newId("u");
  const hash = await Bun.password.hash(password);
  db.run(
    `INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, name, hash, role, new Date().toISOString()],
  );
  return { id, username: name, role };
}

export async function loginUser(
  username: string,
  password: string,
): Promise<PublicUser> {
  const db = await getDb();
  const row = db
    .query<UserRow, [string]>(
      `SELECT id, username, password_hash, role FROM users WHERE username = ?`,
    )
    .get(username.trim());
  if (!row) throw new HttpError(401, "Invalid username or password");
  const ok = await Bun.password.verify(password, row.password_hash);
  if (!ok) throw new HttpError(401, "Invalid username or password");
  return publicUser(row);
}

export async function createSession(userId: string): Promise<string> {
  const db = await getDb();
  const token = newId("s");
  const expires = new Date(Date.now() + sessionMaxAgeSec() * 1000).toISOString();
  db.run(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`, [
    token,
    userId,
    expires,
  ]);
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  const db = await getDb();
  db.run(`DELETE FROM sessions WHERE token = ?`, [token]);
}

export async function userFromToken(token: string): Promise<PublicUser | null> {
  const db = await getDb();
  const now = new Date().toISOString();
  const row = db
    .query<UserRow, [string, string]>(
      `SELECT u.id, u.username, u.password_hash, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, now);
  return row ? publicUser(row) : null;
}

export async function userFromRequest(c: Context): Promise<PublicUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return userFromToken(token);
}

export async function requireUser(c: Context): Promise<PublicUser> {
  const user = await userFromRequest(c);
  if (!user) throw new HttpError(401, "Login required");
  return user;
}

export async function requireAdmin(c: Context): Promise<PublicUser> {
  const user = await requireUser(c);
  if (user.role !== "admin") throw new HttpError(403, "Admin only");
  return user;
}

export async function issueSession(c: Context, user: PublicUser): Promise<void> {
  const token = await createSession(user.id);
  setSessionCookie(c, token);
}
