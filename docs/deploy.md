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
| `/opt/machia/data/` | SQLite, uploads, replays |
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

install -m 600 /dev/null /etc/machia.env   # then set HOST/PORT/admin
cp deploy/machia.service /etc/systemd/system/machia.service
cp deploy/nginx-machia.conf /etc/nginx/sites-available/machia
ln -sfn /etc/nginx/sites-available/machia /etc/nginx/sites-enabled/machia

systemctl daemon-reload
systemctl enable --now machia
nginx -t && systemctl reload nginx
```

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

Admin is created from those three `MACHIA_ADMIN_*` variables on startup. There is no public signup: after login, open `/admin/invites`, generate a code, and send it (or `/register?code=…`) to players.

Password reset uses SMTP when `MACHIA_SMTP_HOST` and `MACHIA_SMTP_FROM` are set; otherwise the API logs the reset URL. `MACHIA_PUBLIC_URL` must be the public origin so reset links in email (and Better Auth cookies) are correct.

## Notes

- Bind the API to loopback (`HOST=127.0.0.1`) so only nginx is public on `:3000`.
- SPA routes need History API fallback (`try_files $uri /index.html`).
- nginx gzip for `application/json` keeps match replays small (hundreds of KB uncompressed).
- This host previously ran Agrippa on `:3000` / `127.0.0.1:3001`. Its Docker stack is stopped and `/etc/nginx/sites-enabled/agrippa` removed; configs remain under `/opt/agrippa` and `sites-available/agrippa`.
