import type { Database } from "bun:sqlite";
import { getDb } from "./db";
import { newId } from "./ids";

export type NotificationKind =
  | "entry_approved"
  | "entry_rejected"
  | "entry_unapproved"
  | "contest_started"
  | "contest_finished";

export interface NotificationRow {
  id: string;
  user_id: string;
  contest_id: string | null;
  entry_id: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  dedupe_key: string;
  read_at: string | null;
  created_at: string;
}

export interface PublicNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  contestId: string | null;
  entryId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NewNotification {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  contestId?: string | null;
  entryId?: string | null;
  /** Stable per event: a repeated notify with the same key is ignored. */
  dedupeKey: string;
}

function publicNotification(row: NotificationRow): PublicNotification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    contestId: row.contest_id,
    entryId: row.entry_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/** Inserts a notice once; returns whether this call created it. */
export function notify(
  db: Database,
  notice: NewNotification,
  now = new Date().toISOString(),
): boolean {
  try {
    const result = db.run(
      `INSERT OR IGNORE INTO notifications
         (id, user_id, contest_id, entry_id, kind, title, body, dedupe_key, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        newId("n"),
        notice.userId,
        notice.contestId ?? null,
        notice.entryId ?? null,
        notice.kind,
        notice.title,
        notice.body ?? null,
        notice.dedupeKey,
        now,
      ],
    );
    return result.changes === 1;
  } catch (err) {
    // A notice is secondary: never fail an approval, start or finish because
    // the inbox insert did. The cause still shows up in the service log.
    console.error(`notification ${notice.kind} failed:`, err);
    return false;
  }
}

export async function listNotifications(
  userId: string,
  limit = 30,
  offset = 0,
): Promise<{ notifications: PublicNotification[]; unread: number; total: number }> {
  const db = await getDb();
  const rows = db
    .query<NotificationRow, [string, number, number]>(
      `SELECT * FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC, rowid DESC
       LIMIT ? OFFSET ?`,
    )
    .all(userId, limit, offset);
  const counts = db
    .query<{ total: number; unread: number }, [string]>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END), 0) AS unread
       FROM notifications WHERE user_id = ?`,
    )
    .get(userId)!;
  return { notifications: rows.map(publicNotification), unread: counts.unread, total: counts.total };
}

/** Marks one of the user's notices, or all of them, as read. Returns the remaining unread. */
export async function markNotificationsRead(
  userId: string,
  id?: string,
): Promise<number> {
  const db = await getDb();
  const now = new Date().toISOString();
  if (id) {
    db.run(
      `UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL`,
      [now, id, userId],
    );
  } else {
    db.run(
      `UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`,
      [now, userId],
    );
  }
  return db
    .query<{ count: number }, [string]>(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL`,
    )
    .get(userId)!.count;
}
