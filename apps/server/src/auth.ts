import type { Context } from "hono";
import type { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { username } from "better-auth/plugins";
import { HttpError } from "./errors";
import { consumeInvite, readInviteCode, restoreInvite } from "./invite-code";
import { sendPasswordResetEmail } from "./mail";

export type UserRole = "user" | "admin";

export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
}

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

let authInstance: ReturnType<typeof createMachiaAuth> | null = null;
let inviteBypass = false;

export function setAuth(auth: ReturnType<typeof createMachiaAuth> | null): void {
  authInstance = auth;
}

export function getAuth(): ReturnType<typeof createMachiaAuth> {
  if (!authInstance) throw new Error("Auth is not initialized");
  return authInstance;
}

export async function withInviteBypass<T>(fn: () => Promise<T>): Promise<T> {
  inviteBypass = true;
  try {
    return await fn();
  } finally {
    inviteBypass = false;
  }
}

export function publicOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.MACHIA_PUBLIC_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "http://localhost:3001";
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLocalOrigin(origin: string): boolean {
  try {
    return LOCAL_HOSTNAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/** Dev-server origins are trusted only when the deployment itself is local. */
export function corsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const origin = publicOrigin(env);
  if (!isLocalOrigin(origin)) return [origin];
  const origins = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3001",
    "http://localhost",
    origin,
  ]);
  return [...origins];
}

/** Only local setups may fall back to the built-in development secret. */
export function authSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.MACHIA_AUTH_SECRET ?? env.BETTER_AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (!isLocalOrigin(publicOrigin(env))) {
    throw new Error(
      "MACHIA_AUTH_SECRET must be at least 32 characters when MACHIA_PUBLIC_URL is not a localhost URL",
    );
  }
  return "machia-dev-secret-please-change-32ch";
}

export function createMachiaAuth(db: Database) {
  const origin = publicOrigin();
  return betterAuth({
    database: db,
    secret: authSecret(),
    baseURL: origin,
    basePath: "/api/auth",
    trustedOrigins: corsOrigins(),
    user: {
      modelName: "users",
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
        },
      },
    },
    session: { modelName: "sessions" },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications" },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail({ to: user.email, url });
      },
    },
    rateLimit: {
      enabled: process.env.MACHIA_AUTH_RATE_LIMIT !== "0",
    },
    advanced: {
      useSecureCookies: origin.startsWith("https://"),
      database: {
        // Migrations run in openDatabase; skip the boot-time check.
        validateSchema: false,
      },
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 32,
        displayUsername: false,
        usernameValidator: (value) => USERNAME_RE.test(value),
      }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email" || inviteBypass) return;
        const code = readInviteCode(ctx);
        if (!code) {
          throw new APIError("BAD_REQUEST", { message: "Invite code required" });
        }
        if (!consumeInvite(db, code)) {
          throw new APIError("BAD_REQUEST", { message: "Invalid or expired invite code" });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email" || inviteBypass) return;
        if (ctx.context.newSession) return;
        const code = readInviteCode(ctx);
        if (code) restoreInvite(db, code);
      }),
    },
  });
}

function roleOf(value: unknown): UserRole {
  return value === "admin" ? "admin" : "user";
}

function publicUserFrom(user: {
  id: string;
  username?: string | null;
  role?: string | null;
}): PublicUser | null {
  const username = user.username?.trim();
  if (!username) return null;
  return { id: user.id, username, role: roleOf(user.role) };
}

export async function userFromRequest(c: Context): Promise<PublicUser | null> {
  const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return null;
  return publicUserFrom(session.user);
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
