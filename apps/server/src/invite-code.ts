export const INVITE_HEADER = "x-invite-code";

export function readInviteCode(ctx: {
  body?: Record<string, unknown> | null;
  headers?: Headers | null;
}): string {
  const header = ctx.headers?.get(INVITE_HEADER)?.trim() ?? "";
  const fromBody = ctx.body?.inviteCode;
  const body = typeof fromBody === "string" ? fromBody.trim() : "";
  return header || body;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function consumeInvite(
  db: { run: (sql: string, args: string[]) => { changes: number } },
  code: string,
): boolean {
  const normalized = normalizeCode(code);
  if (!normalized) return false;
  const now = new Date().toISOString();
  const result = db.run(
    `UPDATE invite_codes
     SET used_count = used_count + 1
     WHERE code = ?
       AND used_count < max_uses
       AND (expires_at IS NULL OR expires_at > ?)`,
    [normalized, now],
  );
  return result.changes === 1;
}

export function restoreInvite(
  db: { run: (sql: string, args: string[]) => { changes: number } },
  code: string,
): void {
  const normalized = normalizeCode(code);
  if (!normalized) return;
  db.run(
    `UPDATE invite_codes
     SET used_count = used_count - 1
     WHERE code = ? AND used_count > 0`,
    [normalized],
  );
}
