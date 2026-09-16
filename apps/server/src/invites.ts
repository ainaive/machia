import { getDb } from "./db";
import { HttpError } from "./errors";
import { newId } from "./ids";

export interface InviteRow {
  id: string;
  code: string;
  created_by: string;
  note: string | null;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  created_at: string;
}

export interface PublicInvite {
  id: string;
  code: string;
  note: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "";
  for (const byte of bytes) {
    out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return out;
}

function publicInvite(row: InviteRow): PublicInvite {
  return {
    id: row.id,
    code: row.code,
    note: row.note,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export async function createInvite(input: {
  createdBy: string;
  note?: string;
  maxUses?: number;
  expiresAt?: string | null;
}): Promise<PublicInvite> {
  const db = await getDb();
  const maxUses = input.maxUses ?? 1;
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) {
    throw new HttpError(400, "maxUses must be an integer from 1 to 1000");
  }
  let expiresAt: string | null = null;
  if (input.expiresAt) {
    const parsed = new Date(input.expiresAt);
    if (Number.isNaN(parsed.getTime())) throw new HttpError(400, "Invalid expiresAt");
    expiresAt = parsed.toISOString();
  }
  const note = input.note?.trim() || null;
  const createdAt = new Date().toISOString();
  for (let i = 0; i < 8; i++) {
    const id = newId("inv");
    const code = randomCode();
    try {
      db.run(
        `INSERT INTO invite_codes (id, code, created_by, note, max_uses, used_count, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        [id, code, input.createdBy, note, maxUses, expiresAt, createdAt],
      );
      return {
        id,
        code,
        note,
        maxUses,
        usedCount: 0,
        expiresAt,
        createdAt,
        createdBy: input.createdBy,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("UNIQUE")) throw err;
    }
  }
  throw new HttpError(500, "Could not allocate invite code");
}

export async function listInvites(): Promise<PublicInvite[]> {
  const db = await getDb();
  const rows = db
    .query<InviteRow, []>(
      `SELECT id, code, created_by, note, max_uses, used_count, expires_at, created_at
       FROM invite_codes
       ORDER BY created_at DESC`,
    )
    .all();
  return rows.map(publicInvite);
}

export async function deleteInvite(id: string): Promise<void> {
  const db = await getDb();
  const result = db.run(`DELETE FROM invite_codes WHERE id = ?`, [id]);
  if (result.changes === 0) throw new HttpError(404, "Invite not found");
}
