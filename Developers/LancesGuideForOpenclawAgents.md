# Server Deployment Guide for AI Agents

> Part of [Linux-Secure-VPS-Bootstrapper-March-2026](https://github.com/LanceTreyark/Linux-Secure-VPS-Bootstrapper-March-2026)

This document describes how websites and Node.js applications should be deployed on this server. Follow these conventions exactly to ensure every deployment is safe, consistent, and compatible with the existing infrastructure.

## Full Project Architecture

For a complete understanding of the project — component architecture, data flow diagrams, code style rules, and contributing guidelines — fetch the contributor guide:

```bash
curl -fsSL https://raw.githubusercontent.com/LanceTreyark/Linux-Secure-VPS-Bootstrapper-March-2026/main/Developers/NotesForContributors.md
```

---

## Server Environment

| Component       | Detail                                      |
|-----------------|---------------------------------------------|
| **OS**          | Debian 13                                   |
| **Web Server**  | Nginx (reverse proxy)                       |
| **Database**    | PostgreSQL                                  |
| **Runtime**     | Node.js 22 LTS (installed via NodeSource)   |
| **SSL**         | Certbot with the `python3-certbot-nginx` plugin |
| **Firewall**    | UFW — only ports 22, 80, and 443 are open   |
| **Process Mgmt**| PM2 or nohup (see "Starting Your App" below)|

---

## Web Directory Structure

Every site lives under `/var/www/<domain>/`. The web root is a **subdirectory** inside it — never the domain folder itself.

```
/var/www/example.com/
├── public_html/      ← Nginx serves from here (web root)
│   ├── index.html
│   ├── css/
│   └── js/
├── .env              ← Environment variables (OUTSIDE web root)
├── server.mjs        ← Your Node app entry point (OUTSIDE web root)
├── package.json
└── node_modules/
```

### Key Rules

1. **`.env` lives at `/var/www/<domain>/.env`** — one directory above `public_html/`. It is never inside the web root.
2. **Nginx blocks all dotfiles** from being served (see config below), but keeping `.env` outside `public_html/` is the primary line of defense.
3. **Permissions**: `.env` must be `chmod 600`. The site directory should be owned by the deploy user, not root.
4. **Never store secrets in code or `public_html/`** — always use `.env` and load with `dotenv` or `process.env`.

### Creating the Directory

```bash
mkdir -p /var/www/example.com/public_html
touch /var/www/example.com/.env
chmod 600 /var/www/example.com/.env
chown -R <user>:<user> /var/www/example.com
```

---

## .env File Format

The `.env` file stores all secrets and configuration for the application. Use `dotenv` (`import 'dotenv/config'`) at the top of your Node entry file to load it.

```env
# /var/www/example.com/.env

PORT=3001
NODE_ENV=production
DATABASE_URL=postgresql://myapp:strongpassword@localhost:5432/myapp_db
SESSION_SECRET=<random-hex-string>
API_KEY=sk-...
```

Generate a secure session secret with:

```bash
openssl rand -hex 32
```

---

## How Nginx Reverse Proxy Works

Nginx listens on ports 80 and 443 (after Certbot adds SSL) and proxies requests to your Node.js app running on a **localhost port**. The Node app is never exposed to the internet directly.

```
Internet → Nginx (:443 HTTPS) → Node.js app (127.0.0.1:<port>)
```

### Finding Ports Already in Use

Before choosing a port for your app, **check which ports are already proxied** to avoid conflicts:

```bash
# List all proxy_pass targets in Nginx configs
grep -r "proxy_pass" /etc/nginx/sites-enabled/

# List all listening ports
ss -tlnp

# Check if a specific port is in use
ss -tlnp | grep :<port>
```

**Reserved ports on this server:**

| Port  | Used By                      |
|-------|------------------------------|
| 22    | SSH                          |
| 80    | Nginx (HTTP)                 |
| 443   | Nginx (HTTPS)                |
| 3000  | OpenClaw Portal (if installed) |
| 5432  | PostgreSQL                   |
| 18789 | OpenClaw Gateway (internal)  |

**Pick a unique port in the 3001–9999 range.** Always verify it's free with `ss -tlnp | grep :<port>` before committing to it. Store your chosen port in `.env` as `PORT=<number>`.

---

## Nginx Configuration

Each site gets its own config file. Create it at `/etc/nginx/sites-available/<domain>` and symlink it to `sites-enabled/`.

### Template

```nginx
server {
    listen 80;
    server_name example.com www.example.com;

    root /var/www/example.com/public_html;
    index index.html;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # CRITICAL: Block all dotfiles (.env, .git, etc.)
    location ~ /\. {
        deny all;
    }
}
```

### Deployment Steps

```bash
# 1. Write the config
sudo nano /etc/nginx/sites-available/example.com

# 2. Enable it
sudo ln -sf /etc/nginx/sites-available/example.com /etc/nginx/sites-enabled/example.com

# 3. Test the config
sudo nginx -t

# 4. Reload Nginx
sudo systemctl reload nginx
```

---

## SSL with Certbot

Certbot is installed with the Nginx plugin. After your DNS A records point to this server and Nginx is configured:

```bash
sudo certbot --nginx -d example.com -d www.example.com
```

This will:
- Obtain a Let's Encrypt certificate
- Modify the Nginx config to listen on 443 with SSL
- Add an automatic HTTP → HTTPS redirect
- Set up auto-renewal via systemd timer

**Do not manually edit the SSL lines Certbot adds to your Nginx config.**

To test renewal:

```bash
sudo certbot renew --dry-run
```

---

## PostgreSQL

PostgreSQL is the primary database. It is accessed locally on port 5432.

### Creating a Database and User for Your App

```bash
sudo -u postgres psql
```

```sql
CREATE USER myapp WITH PASSWORD 'strongpassword';
CREATE DATABASE myapp_db OWNER myapp;
\q
```

Then set in `.env`:

```env
DATABASE_URL=postgresql://myapp:strongpassword@localhost:5432/myapp_db
```

### Connection from Node.js

```javascript
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
```

---

## Node.js Application Setup

Node.js 22 LTS and npm are pre-installed. All apps should use ES modules (`"type": "module"` in `package.json`).

### Standard package.json

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.mjs"
  },
  "dependencies": {
    "dotenv": "^16.0.0",
    "express": "^4.21.0",
    "pg": "^8.13.0"
  }
}
```

### Minimal server.mjs

```javascript
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Serve static files from public_html
app.use(express.static(path.join(__dirname, 'public_html')));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`App running on http://127.0.0.1:${PORT}`);
});
```

> **Important**: Bind to `127.0.0.1`, not `0.0.0.0`. Nginx handles external traffic — your app should only accept connections from localhost.

### Installing Dependencies

```bash
cd /var/www/example.com
npm install --omit=dev
```

---

## Starting Your App

### Option A: PM2 (recommended for production)

```bash
# Start
pm2 start server.mjs --name "example-app"

# Save the process list so it survives reboots
pm2 save
pm2 startup

# Other commands
pm2 list                  # See running apps
pm2 logs example-app      # View logs
pm2 restart example-app   # Restart
pm2 stop example-app      # Stop
```

### Option B: nohup (simple)

```bash
cd /var/www/example.com
nohup node server.mjs >> /var/log/example-app.log 2>&1 &
echo $! > .pid
```

---

## Firewall

UFW is enabled with a default-deny policy. Only these ports are open:

- **22** — SSH
- **80** — HTTP (Nginx)
- **443** — HTTPS (Nginx)

**Do not open your app's port in the firewall.** Nginx proxies traffic from 443 to your app's localhost port. Opening the app port directly would bypass Nginx and SSL.

If your app truly needs a public port (rare), add it with:

```bash
sudo ufw allow <port>/tcp
```

---

## Deployment Checklist

Use this checklist every time you deploy a new site or app:

- [ ] **Directory**: Created `/var/www/<domain>/public_html/`
- [ ] **`.env`**: Created at `/var/www/<domain>/.env` with `chmod 600`
- [ ] **Port**: Checked `grep -r proxy_pass /etc/nginx/sites-enabled/` and `ss -tlnp` — no conflict
- [ ] **Port in .env**: Set `PORT=<chosen-port>` in `.env`
- [ ] **App binds to 127.0.0.1**: Not `0.0.0.0`
- [ ] **Nginx config**: Created at `/etc/nginx/sites-available/<domain>` with correct `proxy_pass` port
- [ ] **Nginx symlink**: `ln -sf` to `sites-enabled/`
- [ ] **Nginx test**: `nginx -t` passes
- [ ] **Nginx reload**: `systemctl reload nginx`
- [ ] **Dotfile block**: `location ~ /\. { deny all; }` is in the Nginx config
- [ ] **SSL**: `certbot --nginx -d <domain>` run after DNS propagates
- [ ] **Database**: Created dedicated PostgreSQL user and database
- [ ] **Dependencies**: `npm install --omit=dev`
- [ ] **Process manager**: App started with PM2 or nohup
- [ ] **No firewall port opened**: App is only accessible through Nginx

---

## Quick Reference Commands

```bash
# Nginx
sudo nginx -t                        # Test config
sudo systemctl reload nginx          # Reload
sudo systemctl status nginx          # Status

# Certbot
sudo certbot --nginx -d <domain>     # Get SSL cert
sudo certbot renew --dry-run         # Test renewal

# PostgreSQL
sudo -u postgres psql                # Open psql
sudo systemctl status postgresql     # Status

# PM2
pm2 list                             # Running apps
pm2 start server.mjs --name "app"    # Start
pm2 logs app                         # View logs
pm2 restart app                      # Restart

# Ports
ss -tlnp                             # All listening ports
grep -r proxy_pass /etc/nginx/sites-enabled/   # Proxied ports

# UFW
sudo ufw status                      # Firewall rules
```
