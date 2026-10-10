# Deploy Machia on a VPS

Production layout used on the current host: nginx terminates TLS on **port 3000** and reverse-proxies `/api` to the Bun server on loopback **3001**. Ports **80** and **443** are not used (they may be blocked).

Public URL: `https://agrippa.ainaive.com:3000`

The API process must be Bun (`bun:sqlite`). Bot subprocesses are Node. On a mainland VPS, install Bun from npmmirror and packages from `registry.npmmirror.com`; Node can come from the Ubuntu/Huawei apt mirror.

Auth is **Better Auth** (email + username, httpOnly cookies). Signup is **invite-only**. This release rewrites `users` / session tables: **back up `data/machia.db` before upgrading**. Old username-only passwords will not work; seed a new admin and re-invite users.

## Requirements

- Bun ≥ 1.4 (binary: `https://cdn.npmmirror.com/binaries/bun/bun-v1.4.2/bun-linux-x64.zip`)
- Node.js (bot subprocesses; Ubuntu `nodejs` 18+ is enough)
- nginx with a TLS certificate for the public hostname

## Layout

| Path | Role |
|------|------|
| `/opt/machia` | App checkout |
| `/opt/machia/apps/web/dist` | Built SPA |
| `/opt/machia/data/` | SQLite, uploads, replays — the only path the service can write; owned by `machia` |
| `/etc/machia.env` | Secrets (`HOST`, `PORT`, admin) |
| `/etc/nginx/sites-available/machia` | nginx vhost (`deploy/nginx-machia.conf`) |
| `/etc/systemd/system/machia.service` | systemd unit (`deploy/machia.service`) |

## Install

```bash
# sync the repo to /opt/machia (exclude node_modules, dist, .git, data)
cd /opt/machia
bun install --frozen-lockfile --registry https://registry.npmmirror.com
bun run build:web
# nginx (www-data) must be able to read the SPA
chmod -R a+rX /opt/machia/apps/web/dist

# the service (and every bot it starts) runs as this unprivileged user
useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin machia
chmod -R a+rX /opt/machia        # checkout (incl. node_modules) readable by machia
mkdir -p /opt/machia/data
chown -R machia:machia /opt/machia/data
chmod -R go-rwx /opt/machia/data # DB holds session tokens: owner-only

install -m 600 /dev/null /etc/machia.env   # then set HOST/PORT/admin
cp deploy/machia.service /etc/systemd/system/machia.service
cp deploy/nginx-machia.conf /etc/nginx/sites-available/machia
ln -sfn /etc/nginx/sites-available/machia /etc/nginx/sites-enabled/machia

systemctl daemon-reload
systemctl enable --now machia
nginx -t && systemctl reload nginx
```

`/etc/machia.env` stays root-owned and `0600`: systemd reads it before dropping to the `machia` user.

### Upgrading an install that ran as root

Earlier versions of `deploy/machia.service` had no `User=`, so the service and all bots ran as root. To switch:

```bash
systemctl stop machia
cp -a /opt/machia/data /root/machia-data.bak-$(date +%F)   # backup first, outside the checkout
useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin machia
chmod -R a+rX /opt/machia
chown -R machia:machia /opt/machia/data
chmod -R go-rwx /opt/machia/data
cp deploy/machia.service /etc/systemd/system/machia.service
systemctl daemon-reload && systemctl start machia
# verify: the API and bot processes run as machia, not root
ps -o user=,pid=,cmd= -u machia
journalctl -u machia -n 50   # look for EACCES / read-only filesystem errors
```

The unit makes the system and the checkout read-only (`ProtectSystem=strict`); only `/opt/machia/data` is writable. If you move data elsewhere with `MACHIA_DB` / `MACHIA_UPLOADS_DIR` / `MACHIA_REPLAYS_DIR`, add those paths to `ReadWritePaths=`.

`/etc/machia.env` example (do not commit):

```
HOST=127.0.0.1
PORT=3001
MACHIA_PUBLIC_URL=https://agrippa.ainaive.com:3000
MACHIA_AUTH_SECRET=generate-a-long-random-string-at-least-32-chars
MACHIA_ADMIN_EMAIL=admin@example.com
MACHIA_ADMIN_USERNAME=admin
MACHIA_ADMIN_PASSWORD=change-me
# optional password-reset mail
# MACHIA_SMTP_HOST=smtp.example.com
# MACHIA_SMTP_PORT=587
# MACHIA_SMTP_USER=
# MACHIA_SMTP_PASS=
# MACHIA_SMTP_FROM=Machia <noreply@example.com>
```

`MACHIA_AUTH_SECRET` is required (≥ 32 chars) whenever `MACHIA_PUBLIC_URL` is not a localhost URL — the API refuses to start without it. Generate one with `openssl rand -base64 48`. Only local setups trust the Vite dev origins (`localhost:5173`).

Admin is created from those three `MACHIA_ADMIN_*` variables on startup. There is no public signup: after login, open `/admin/invites`, generate a code, and send it (or `/register?code=…`) to players.

Password reset uses SMTP when `MACHIA_SMTP_HOST` and `MACHIA_SMTP_FROM` are set; otherwise the API logs the reset URL. `MACHIA_PUBLIC_URL` must be the public origin so reset links in email (and Better Auth cookies) are correct.

## Bot sandbox

The unit sets `MACHIA_SANDBOX=bwrap`: every bot (practice and contest) runs in [bubblewrap](https://github.com/containers/bubblewrap) with no network, its own process tree, read-only system directories, a private `/tmp`, and only its own folder visible (sample bots see `bots/`, for their shared helpers) — not `data/`, other uploads, or the rest of the host. Each bot also gets its own cgroup: 256MB memory (no swap), 32 tasks (processes + threads), 1 CPU. A bot over its memory limit is killed and shows as crashed in the replay.

Host requirements:

1. **bubblewrap**: `apt install bubblewrap` (preinstalled on Ubuntu 24.04).
2. **AppArmor profile** (Ubuntu 24.04+ blocks unprivileged user namespaces by default):
   ```bash
   cp deploy/apparmor-bwrap /etc/apparmor.d/bwrap
   apparmor_parser -r /etc/apparmor.d/bwrap
   ```
3. **Node under `/usr`** (e.g. Ubuntu's `nodejs` at `/usr/bin/node`): the sandbox only exposes `/usr` and the bot's folder.
4. **systemd ≥ 254** for `Delegate=yes` + `DelegateSubgroup=server` in the unit, which let the API create per-bot cgroups.

At boot the API enables the cgroup controllers and runs a sandbox self-test. If either fails it **refuses to start** (check `journalctl -u machia`), so install the profile *before* deploying this unit. On success the log says `Bots run sandboxed (bwrap; 256MB, 32 tasks, 1 CPU each)`.

| Variable | Default | |
|----------|---------|-|
| `MACHIA_SANDBOX` | `off` (unit: `bwrap`) | `bwrap` or `off` |
| `MACHIA_SANDBOX_CGROUP` | `auto` | the service's delegated cgroup; a path; or `off` for no resource limits |
| `MACHIA_BOT_MEMORY_MB` / `MACHIA_BOT_PIDS` / `MACHIA_BOT_CPUS` | `256` / `32` / `1` | per-bot limits; tasks must be a whole number, CPUs ≥ 0.01. Node needs about a dozen tasks to start — the boot self-test runs Node under these exact limits and refuses to start if it can't |

To run the sandbox tests on the host, as the service user with the unit's hardening (from a checkout readable by `machia`):

```bash
systemd-run --wait --pipe --collect -p User=machia -p NoNewPrivileges=yes -p PrivateTmp=yes \
  -p ProtectSystem=strict -p ProtectHome=yes -p Delegate=yes -p DelegateSubgroup=server \
  -p WorkingDirectory=/opt/machia -E PATH=/usr/local/bin:/usr/bin:/bin \
  -E BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 --unit machia-sandbox-tests \
  -E MACHIA_TEST_CGROUP_ROOT=/sys/fs/cgroup/system.slice/machia-sandbox-tests.service \
  /usr/local/bin/bun test packages/runner/src/sandbox.test.ts
```

## Backups and cleanup

`deploy/machia-maintenance.timer` runs `bun run --filter @machia/server maintenance` daily (04:00 plus up to 15 minutes, catching up after downtime), as `machia` with the same hardening as the API:

- **Database:** a consistent snapshot via SQLite `VACUUM INTO` (safe while the API runs) → `data/backups/machia-<UTC stamp>-<4 hex>.db`.
- **Uploaded bots:** `data/uploads` → `data/backups/uploads-<UTC stamp>-<4 hex>.tar.gz`. (The random suffix keeps two runs in the same second apart.)
- **Retention:** keeps the newest 14 of each kind.
- **Replays:** deletes practice replays older than 30 days. Replays referenced by a contest are never deleted.

```bash
cp deploy/machia-maintenance.service deploy/machia-maintenance.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now machia-maintenance.timer
systemctl start machia-maintenance.service      # run once now
journalctl -u machia-maintenance -n 20          # what it did
```

| Variable | Default | |
|----------|---------|-|
| `MACHIA_BACKUP_DIR` | `data/backups` | where backups go (must be in the unit's `ReadWritePaths=`) |
| `MACHIA_BACKUP_KEEP` | `14` | backups kept per kind |
| `MACHIA_REPLAY_DAYS` | `30` | practice replay retention; `0` keeps them forever |

Backups stay on the same disk: they protect against mistakes and corruption, not disk loss. Copy `data/backups` off the host for that. To restore: stop `machia`, copy a `machia-*.db` over `data/machia.db` (and extract an `uploads-*.tar.gz` into `data/uploads`), `chown -R machia: /opt/machia/data`, start `machia`. The two are taken seconds apart, so a bot changed in between can disagree with its approval; such a bot's contest games fail with "changed since they were approved" (visible to admins) rather than running unreviewed code. Restore the matching uploads, or open the bot's code on the contest page and **重新批准此版本** (re-approve; allowed even after the contest started), then **重跑失败对局**.

## Notes

- Bind the API to loopback (`HOST=127.0.0.1`) so only nginx is public on `:3000`.
- Without the sandbox (`MACHIA_SANDBOX` unset or `off`), bots share the `machia` user with the API and can read `data/` (DB, other uploads) and use the network — only approve bots you trust in that mode.
- SPA routes need History API fallback (`try_files $uri /index.html`).
- nginx gzip for `application/json` keeps match replays small (hundreds of KB uncompressed).
- This host previously ran Agrippa on `:3000` / `127.0.0.1:3001`. Its Docker stack is stopped and `/etc/nginx/sites-enabled/agrippa` removed; configs remain under `/opt/agrippa` and `sites-available/agrippa`.
