# Deploy Machia on a VPS

Production layout used on the current host: nginx terminates TLS on **port 3000** and reverse-proxies `/api` to the Bun server on loopback **3001**. Ports **80** and **443** are not used (they may be blocked).

Public URL: `https://agrippa.ainaive.com:3000`

The API process must be Bun (`bun:sqlite`, `Bun.password`). Bot subprocesses are Node. On a mainland VPS, install Bun from npmmirror and packages from `registry.npmmirror.com`; Node can come from the Ubuntu/Huawei apt mirror.

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
MACHIA_ADMIN_USERNAME=admin
MACHIA_ADMIN_PASSWORD=change-me
```

The first registered user becomes admin if those two variables are unset.

## Notes

- Bind the API to loopback (`HOST=127.0.0.1`) so only nginx is public on `:3000`.
- SPA routes need History API fallback (`try_files $uri /index.html`).
- nginx gzip for `application/json` keeps match replays small (hundreds of KB uncompressed).
- This host previously ran Agrippa on `:3000` / `127.0.0.1:3001`. Its Docker stack is stopped and `/etc/nginx/sites-enabled/agrippa` removed; configs remain under `/opt/agrippa` and `sites-available/agrippa`.
