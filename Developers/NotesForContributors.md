# Contributor Guide — Project Architecture

> Part of [Linux-Secure-VPS-Bootstrapper-March-2026](https://github.com/LanceTreyark/Linux-Secure-VPS-Bootstrapper-March-2026)

This document gives contributors a complete picture of the project's structure, architecture, and component relationships so you can understand the codebase and submit informed pull requests.

---

## Project Purpose

This is a **Linux VPS initialization toolkit** for Debian 13 that:

1. Bootstraps a fresh VPS with secure defaults (SSH keys, firewall, sudo user)
2. Installs Node.js 22 LTS as the primary runtime
3. Provides an interactive terminal-based package manager ("Platform Installer")
4. Optionally deploys an authenticated OpenClaw AI portal with PostgreSQL-backed sessions

The target user runs `start.sh` once on a brand-new Debian 13 VPS, then uses the `platforms` command for all subsequent software management.

---

## Repository Structure

```
Linux-Secure-VPS-Bootstrapper-March-2026/
│
├── start.sh                        # Entry point — run once on fresh VPS
├── Q_Com.sh                        # Git quick-commit helper (dev tool)
├── README.md                       # User-facing install guide
│
├── Developers/
│   ├── NotesForContributors.md     # ← You are here (architecture overview)
│   └── LancesGuideForOpenclawAgents.md  # AI agent deployment conventions
│
└── PlatformTools/
    ├── platformInstaller.sh        # Bash wrapper (root check → launches Node)
    ├── installer.mjs               # Main interactive installer (~1000 lines)
    ├── package.json                # Manifest for installer (no dependencies)
    ├── PLATFORM_INSTALLER.md       # User docs for the platform installer
    │
    └── openclaw-portal/            # OpenClaw authenticated portal app
        ├── server.mjs              # Express + Passport.js + proxy server
        ├── package.json            # Portal dependencies
        ├── .env.example            # Environment variable template
        ├── portal-ctl.sh           # Start/stop/health management script
        ├── db/
        │   └── setup.mjs           # PostgreSQL schema + admin user creation
        ├── views/
        │   └── login.ejs           # Login page template
        └── public/
            └── css/
                └── login.css       # Login page styles
```

---

## Component Architecture

### 1. `start.sh` — VPS Bootstrap

**Runs once as root on a fresh Debian 13 server.** This is the only entry point for initial setup.

**Delivery method — single-command installer:**

The user never clones the repo. A one-liner in the README downloads the tarball from GitHub, extracts it to `/tmp`, and runs `start.sh`:

```
apt update && apt install -y curl && curl -fsSL https://github.com/LanceTreyark/Linux-Secure-VPS-Bootstrapper-March-2026/archive/refs/heads/main.tar.gz | tar -xz -C /tmp && bash /tmp/Linux-Secure-VPS-Bootstrapper-March-2026-main/start.sh
```

This means:
- **No `git` required** — `git` is not installed on a stock Debian 13 VPS, so we use `curl` + `tar` instead of `git clone`
- **Extracted path is predictable** — GitHub tarballs always extract to `<repo-name>-<branch>/`, so the path is `/tmp/Linux-Secure-VPS-Bootstrapper-March-2026-main/`
- **`start.sh` locates `PlatformTools/` relative to itself** — it uses `$(dirname "$0")` to find sibling directories in the extracted tarball, then copies `PlatformTools/` to the new user's home directory
- **Everything in `/tmp` is disposable** — after `start.sh` copies what it needs, the tarball extraction can be cleaned up

If the repo is renamed, the one-liner URL, the extracted folder name in `start.sh`, and the README must all be updated to match.

**Execution flow:**

```
root check
    → fresh VPS check (no existing sudo users)
    → apt update && upgrade
    → install core packages (sudo, ufw, btop, curl, ca-certificates, gnupg)
    → install Node.js 22 LTS via NodeSource
    → create sudo user (interactive prompt)
    → configure UFW (allow OpenSSH)
    → set up SSH key auth (supports multiple keys)
    → disable password authentication
    → write alias commands to user + root .bashrc
    → copy PlatformTools/ to /home/<user>/PlatformTools/
    → copy SSH authorized_keys to root
    → open ports 80, 443
    → ufw --force enable
    → print summary
```

**Aliases created:**

| Alias       | Command                                           |
|-------------|---------------------------------------------------|
| `update`    | `sudo apt update && sudo apt upgrade -y`          |
| `bb`        | `btop`                                            |
| `monitor`   | `btop`                                            |
| `platforms` | `sudo bash ~/PlatformTools/platformInstaller.sh`  |

**Key design decisions:**
- Aliases are appended to `.bashrc` (never overwritten)
- SSH keys are copied to both the new user and root
- Node.js is installed via NodeSource, not the Debian repo (ensures LTS version)
- UFW rules are batched and enabled once at the end

---

### 2. `PlatformTools/installer.mjs` — Interactive Package Manager

**The core of the project.** A single-file Node.js application with zero npm dependencies that provides a colored terminal menu for installing, removing, and managing server packages.

**Architecture:**

```
installer.mjs
│
├── Color helpers (ANSI escape codes)
├── Package definitions (object map: key → {name, apt, category, desc, ...})
├── Custom install commands (OpenClaw, PM2, MongoDB)
├── Stack definitions (preset bundles: Lance's, WebDev, LAMP, Docker, AI, Security)
│
├── Utility functions
│   ├── isInstalled(key)      — checks via `which` or `dpkg -l`
│   ├── runApt(action, pkg)   — wraps `apt install/remove -y`
│   ├── runCustomInstall(key) — runs non-apt install commands
│   ├── openPorts(ports[])    — wraps `ufw allow`
│   └── installPackage(key)   — orchestrates install + port opening
│
├── Post-install flows
│   ├── setupGitSSH(rl)              — Git config + Ed25519 key generation
│   ├── setupOpenClawDomain(rl)      — Domain/webserver/certbot setup (reusable)
│   ├── repairOpenClaw(rl)           — 10-check health + domain setup/change
│   ├── setupOpenClaw(rl)            — Full OpenClaw + portal deployment
│   ├── addWebsite(rl)               — Static site creation with landing page
│   ├── addSSHKey(rl)                — Add public keys to authorized_keys
│   └── generateServerSSHKey(rl)     — Create key pair for outbound SSH
│
├── Web directory & config generators
│   ├── createWebDirectory(domain)        — /var/www/<domain>/public_html + .env
│   ├── createNginxConfig(domain)         — Reverse proxy + dotfile block (OpenClaw)
│   ├── createApacheConfig(domain)        — ProxyPass + dotfile block (OpenClaw)
│   ├── createCaddyConfig(domain)         — Auto-SSL reverse proxy (OpenClaw)
│   ├── createStaticNginxConfig(domain)   — Static file serving + dotfile block
│   ├── createStaticApacheConfig(domain)  — Static file serving + .htaccess support
│   └── createStaticCaddyConfig(domain)   — Static file serving + auto-SSL
│
└── Menu system
    ├── showCategoryMenu(rl)    — Main menu (stacks, categories, tools)
    ├── showPackageMenu(rl)     — Category detail (install/remove)
    ├── showStackMenu(rl)       — Bulk stack install/remove
    └── main()                  — Entry point + main loop
```

**Package categories (7):**
- Web Servers: Nginx, Apache2, Caddy
- Databases: PostgreSQL, MariaDB, MySQL, MongoDB, Redis, SQLite3
- Runtimes: Node.js, Python 3, pip3, Go
- Dev Tools: Git, Docker, Compose, Certbot, PM2, Build Essential, tmux
- AI & Platforms: OpenClaw
- Security: Fail2ban, Auto Updates
- Monitoring: btop, htop, Neofetch, Net Tools

**Stacks (6 presets):**
- ⭐ Lance's Stack: Nginx + PostgreSQL + Git + Node.js + Certbot (+ Git SSH setup)
- 🌐 Web Dev: Nginx + PostgreSQL + Node.js + Git + Certbot + PM2
- 🪔 LAMP: Apache2 + MariaDB + Python 3 + pip3
- 🐳 Docker: Docker + Compose + Git
- 🤖 AI: OpenClaw + Node.js + Git
- 🔒 Security: Fail2ban + Auto Updates + Certbot

**Contextual tools menu (TOOLS section):** The main menu always shows a TOOLS section. Some options appear based on installed software, while SSH tools are always available:
- **Add a Website** — visible when any web server is installed. Creates a static site: domain prompt → web dir → landing page → static file config → Certbot SSL. Uses `createStaticNginxConfig()` / `createStaticApacheConfig()` / `createStaticCaddyConfig()` (not the OpenClaw reverse proxy configs).
- **Git & SSH Key Setup** — visible when Git is installed. Configures Git globals and generates an Ed25519 SSH key for GitHub.
- **Add SSH Key** — always visible. Adds public keys to `~/.ssh/authorized_keys` so other developers or agents can SSH into this server. Shows existing keys, validates format, deduplicates, and syncs keys to root.
- **Generate Server SSH Key** — always visible. Generates an Ed25519 key pair on the server itself so it can SSH *out* to other servers (agent-to-agent access, automated deployments). Displays the public key with instructions for adding it to target servers.
- **Health Check & Repair** — visible when OpenClaw is installed. Runs 10 diagnostic checks (`repairOpenClaw(rl)`) and auto-fixes what it can: PostgreSQL, gateway service, portal (port 3000), OpenClaw config (`controlUi.allowedOrigins` + invalid key cleanup), portal `.env` (token, secrets), domain setup/change (calls `setupOpenClawDomain`, closes port 3000, updates origins, restarts services), web server config, SSL certificate (retry certbot if DNS resolves), portal-ctl + cron, and shell aliases. Reports a summary of issues found/fixed. Replaces the old separate "Configure OpenClaw Domain" tool.

**Key design decisions:**
- Zero dependencies — uses only Node.js built-ins (`child_process`, `readline`)
- All UI is raw ANSI escape codes — no framework, no library
- Everything runs synchronously via `execSync` except menu prompts
- **`NO_STDIN` constant** — all `execSync` calls use `{ stdio: ['ignore', 'inherit', 'inherit'] }` instead of `{ stdio: 'inherit' }` to prevent child processes from stealing stdin, which would corrupt the `readline` interface and cause `ERR_USE_AFTER_CLOSE` crashes
- Package detection uses `which` first, falls back to `dpkg -l`
- Post-install hooks are async functions that receive the readline interface
- The `setupOpenClaw()` function is **fully idempotent** — every step checks its current state before acting, so re-running after a partial failure (e.g., OOM kill) only completes what's missing

---

### 3. `openclaw-portal/` — Authenticated OpenClaw Portal

An Express.js app that sits between the user and the OpenClaw gateway, adding authentication via Passport.js.

**Traffic flow:**

```
User → Nginx (:443) → Portal (:3000) → OpenClaw Gateway (:18789)
       (reverse proxy)  (auth + proxy)   (AI service)
```

**Components:**

| File             | Purpose                                                    |
|------------------|------------------------------------------------------------|
| `server.mjs`     | Express server, Passport local strategy, TOTP 2FA, session config, proxy middleware |
| `db/setup.mjs`   | Creates PostgreSQL role, database, `users` table (with `totp_secret`), `user_sessions` table, admin user |
| `views/login.ejs` | EJS login page with dark theme, animated background, SVG icons |
| `views/totp-verify.ejs` | 2FA code entry page (shown after password login when TOTP is enabled) |
| `views/totp-setup.ejs` | 2FA setup/disable page with QR code, manual secret, and verification |
| `public/css/login.css` | CSS with custom properties, animations, responsive design |
| `portal-ctl.sh`  | Management script for start/stop/status/health             |
| `.env.example`   | Environment variable template                              |

**Technology stack:**
- Express.js 4 with EJS templates
- Passport.js with local strategy
- PostgreSQL via `pg` + `connect-pg-simple` for sessions
- `bcryptjs` (pure JS, 12 rounds) for password hashing — chosen over native `bcrypt` to avoid node-gyp/native compilation issues
- `http-proxy-middleware` v3 for proxying to OpenClaw with WebSocket support (uses `on: { error }` event syntax, not the v2 `onError` property)
- `otpauth` + `qrcode` for TOTP two-factor authentication (pure JS, no native deps)
- `dotenv` for environment configuration
- On startup, reads the OpenClaw gateway token from `OPENCLAW_TOKEN` env var or `~/.openclaw/openclaw.json` and injects it into the login redirect URL (`/#token=xxx`) so the OpenClaw dashboard auto-authenticates after portal login

**Two-factor authentication (TOTP):**

The portal supports optional TOTP-based 2FA using any authenticator app (Google Authenticator, Authy, 1Password, etc.).

```
Login flow with 2FA:
  POST /login (username + password)
    │
    ├── TOTP not enabled → redirect to dashboard (/#token=xxx)
    │
    └── TOTP enabled → redirect to /2fa/verify
          │
          POST /2fa/verify (6-digit code + optional disable_2fa checkbox)
            │
            ├── Valid + disable_2fa checked → remove totp_secret → redirect to dashboard
            ├── Valid → session.totp_verified = true → redirect to dashboard
            └── Invalid → retry

Setup flow:
  GET /2fa/setup → generates secret, shows QR code + manual key
  POST /2fa/enable (6-digit code) → verifies code, saves secret to DB

Disable flow (two options):
  1. On /2fa/verify: check "Disable 2FA" checkbox + enter correct code → removes totp_secret
  2. On /2fa/setup: POST /2fa/disable (current password) → removes totp_secret from DB
```

- The `requireAuth` middleware checks both `req.isAuthenticated()` and `req.session.totp_verified` — if TOTP is enabled but not yet verified this session, the user is redirected to `/2fa/verify`
- Secrets are stored as Base32 strings in the `totp_secret` column (NULL = TOTP disabled)
- QR codes are generated server-side via the `qrcode` library (Data URL) so no external API calls are made
- Disabling 2FA can be done two ways: (1) on the verify page by checking "Disable 2FA after verification" and entering a valid code, or (2) on the setup page by entering the current password — both require proof of identity
- Users access the setup page at `/2fa/setup` after logging in

**Database schema:**
```sql
-- Users table
users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    totp_secret VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Sessions table (managed by connect-pg-simple)
user_sessions (
    sid VARCHAR NOT NULL PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMPTZ NOT NULL
)
```

**Portal management (`portal-ctl.sh`):**
- `portal-ctl start` — starts the Node app, removes `.disabled` flag, enables auto-restart
- `portal-ctl stop` — kills the process, creates `.disabled` flag, prevents cron from restarting
- `portal-ctl status` — shows running state and auto-restart status
- `portal-ctl health` — called by hourly cron job; restarts only if process died and `.disabled` flag is absent

**Auto-restart logic:**
- A cron job runs `portal-ctl health` every hour
- If the user runs `portal-stop`, a `.disabled` sentinel file is created at `/opt/openclaw-portal/.disabled`
- The health check exits immediately if `.disabled` exists — the cron never fights the user
- Running `portal-start` removes the `.disabled` file and re-enables auto-restart

**Shell aliases (added during OpenClaw install):**

| Alias              | Command                      |
|--------------------|------------------------------|
| `portal-start`     | `sudo portal-ctl start`     |
| `portal-stop`      | `sudo portal-ctl stop`      |
| `portal-status`    | `sudo portal-ctl status`    |
| `openclaw-stop`    | Stop gateway + kill portal   |
| `openclaw-restart` | Restart gateway + portal together |

**OpenClaw gateway token flow:**

The OpenClaw gateway generates its own auth token on first run. The portal needs this token so it can redirect users to `/#token=xxx` after login, which auto-authenticates them with the OpenClaw dashboard UI.

```
OpenClaw install → generates token → stored in ~/.openclaw/openclaw.json
                                          │
    setupOpenClaw step 12 ────────────────┘
        │
        ├── Try: read token from openclaw.json (gateway.auth.token)
        ├── Fallback: prompt user to paste token or URL
        │       └── Extracts token from URL like /#token=abc123
        ├── Save to /opt/openclaw-portal/.env as OPENCLAW_TOKEN=xxx
        │
    Portal startup (server.mjs)
        │
        ├── Reads OPENCLAW_TOKEN from .env (preferred)
        ├── Fallback: parses ~/.openclaw/openclaw.json
        └── On login success → redirect to /#token=xxx
```

**Idempotent recovery design:**

The `setupOpenClaw()` function is designed for 1GB VPS servers that may OOM-kill during `npm install`. Every step checks its current state before acting:
- File/directory existence via `test -f` / `test -d` helpers
- PostgreSQL database existence via `psql` query
- Swap presence via `swapon --show`
- Systemd service existence via file check

On re-run, a recovery checklist shows ✅/❌ for each step, then only the incomplete steps execute. This means a user can safely re-run the OpenClaw option after a crash without re-prompting for credentials or re-deploying files.

**PostgreSQL authentication:**

The portal uses `sudo -u postgres psql` (Unix socket peer auth) for database setup in `db/setup.mjs`, not TCP connections via `pg.Client`. This avoids SASL/password authentication issues since the installer runs as root.

---

### 4. `Q_Com.sh` — Git Quick Commit

A small helper script for the project maintainer. Stages all files, commits with a timestamp message, and is typically aliased to `commit` in `.bash_aliases` paired with `git push -u origin main`.

Not part of the deployed server — this is a development convenience tool.

---

## Web Directory Convention

All sites deployed on this server follow a strict directory pattern:

```
/var/www/<domain>/
├── public_html/      ← Web root (Nginx root directive)
├── .env              ← Secrets (chmod 600, OUTSIDE web root)
├── server.mjs        ← App entry point (OUTSIDE web root)
├── package.json
└── node_modules/
```

- `.env` is always one level above `public_html/` and is never web-accessible
- Nginx configs include `location ~ /\. { deny all; }` as an additional safeguard
- All dotfiles (`.git`, `.env`, etc.) are blocked from HTTP access
- The `createWebDirectory()` function in `installer.mjs` enforces this structure

---

## Port Allocation

| Port  | Service                 | Exposed to Internet? |
|-------|-------------------------|----------------------|
| 22    | SSH                     | Yes (UFW)            |
| 80    | Nginx HTTP              | Yes (UFW)            |
| 443   | Nginx HTTPS             | Yes (UFW)            |
| 3000  | OpenClaw Portal         | Only without domain  |
| 5432  | PostgreSQL              | No (localhost only)  |
| 18789 | OpenClaw Gateway        | No (localhost only)  |

**Service management:**

| Service                        | Manager  | Unit/Script                          |
|--------------------------------|----------|--------------------------------------|
| OpenClaw Gateway               | systemd  | `openclaw-gateway.service`           |
| OpenClaw Portal                | cron + portal-ctl | `/usr/local/bin/portal-ctl`  |
| PostgreSQL                     | systemd  | `postgresql.service`                 |
| Nginx                          | systemd  | `nginx.service`                      |

New apps should pick ports in the 3001–9999 range and verify availability with `ss -tlnp` and `grep -r proxy_pass /etc/nginx/sites-enabled/`.

---

## Data Flow Diagrams

### Initial Setup Flow

```
User SSHs as root
        │
        ▼
    start.sh
        │
        ├── apt update/upgrade
        ├── Install core packages + Node.js 22
        ├── Create sudo user
        ├── Configure SSH + UFW
        ├── Copy PlatformTools/ to ~user/
        └── Enable firewall
              │
              ▼
    User logs in as sudo user
              │
              ▼
    $ platforms  (alias)
              │
              ▼
    platformInstaller.sh  (root check)
              │
              ▼
    node installer.mjs  (interactive menu)
```

### OpenClaw Deployment Flow

```
User selects OpenClaw (AI Stack or individual)
        │
        ▼
    setupOpenClaw(rl)  — fully idempotent, safe to re-run
        │
        ├── Recovery status check (shows ✅/❌ for each step if re-running)
        │
        ├── 1. setupOpenClawDomain(rl)
        │       ├── Detect existing domain from nginx config (skip prompt)
        │       ├── Prompt for domain (or skip for IP-only access)
        │       ├── Detect/install web server
        │       ├── Generate reverse proxy config
        │       ├── Install Certbot + nginx/apache plugin + get SSL
        │       └── return domain
        │
        ├── 2. Install PostgreSQL if missing, enable + start
        │
        ├── 3. Deploy portal files to /opt/openclaw-portal/
        │
        ├── 4. npm install --omit=dev
        │
        ├── 5. Generate .env (random session secret, DB URL, ports)
        │
        ├── 6. Database & admin account
        │       ├── Check if openclaw_portal DB already exists
        │       ├── If not: prompt admin username/password
        │       └── Run db/setup.mjs (uses sudo -u postgres psql peer auth)
        │
        ├── 7. Install portal-ctl to /usr/local/bin/
        │
        ├── 8. Set up hourly cron job (portal-ctl health)
        │
        ├── 9. Add aliases to .bashrc (portal-start/stop/status, openclaw-stop/restart)
        │
        ├── 10. Start portal (portal-ctl start)
        │
        ├── 11. Install OpenClaw binary
        │       ├── Install psmisc + lsof (needed for openclaw --force)
        │       ├── Create 1GB swap if none exists (prevents OOM on small VPS)
        │       └── curl -fsSL https://openclaw.ai/install.sh | bash
        │
        ├── 11b. Generate OpenClaw gateway config
        │       ├── Create ~/.openclaw dir + workspace + sessions
        │       ├── Generate auth token with openssl rand -hex 24
        │       ├── Write openclaw.json (port 18789, loopback, token auth)
        │       └── Add domain allowedOrigins if domain was configured
        │
        ├── 12. Capture gateway token
        │       ├── Auto-read from ~/.openclaw/openclaw.json
        │       ├── If not found: prompt user to paste URL or raw token
        │       ├── Extract token from URL (#token=xxx) or use raw input
        │       ├── Add domain origins to gateway.controlUi.allowedOrigins
        │       └── Save OPENCLAW_TOKEN to portal .env
        │
        ├── 13. Create systemd service (openclaw-gateway.service)
        │       ├── ExecStart=openclaw gateway --port 18789
        │       ├── Restart=on-failure, runs as deploy user
        │       ├── systemctl enable + start
        │       └── Wait 3s and verify gateway stays active
        │
        └── 14. Final portal restart (after gateway is confirmed running)
                └── Kill old portal, sleep 1, portal-ctl start
```

---

## Contributing Guidelines

### Before You Start

1. Read through `start.sh` to understand the baseline server state
2. Read the relevant section of `installer.mjs` for whatever you're modifying
3. Check the `Developers/LancesGuideForOpenclawAgents.md` for deployment conventions

### Adding a New Package

In `installer.mjs`, add an entry to the `packages` object:

```javascript
mypackage: {
    name: 'My Package',
    apt: 'mypackage',           // apt package name
    category: 'Dev Tools',      // existing category or create new
    desc: 'Short description',
    // Optional:
    customCheck: 'mybin',       // binary name if different from apt name
    customInstall: true,        // if it needs a custom install command
    ports: ['8080/tcp'],        // ports to auto-open in UFW
},
```

If `customInstall: true`, also add an entry to `customInstalls`:

```javascript
mypackage: {
    install: 'curl -fsSL https://example.com/install.sh | bash',
    postInstall: (rl) => myPostInstallFunction(rl),  // optional
},
```

### Adding a New Stack

Add to the `stacks` object:

```javascript
mystack: {
    name: '🎯 My Stack',
    desc: 'Package A + Package B + Package C',
    packages: ['packagea', 'packageb', 'packagec'],  // keys from packages{}
    postInstall: (rl) => mySetupFunction(rl),         // optional
},
```

### Code Style

- **No npm dependencies in `installer.mjs`** — it must run with only Node.js built-ins
- **ES modules** — use `import`, not `require`
- **ANSI colors** — use the `c` object, never hardcode escape sequences
- **`execSync`** — all system commands are synchronous; async is only for user prompts. **Always use the `NO_STDIN` constant** (`{ stdio: ['ignore', 'inherit', 'inherit'] }`) instead of `{ stdio: 'inherit' }` — the latter lets child processes steal stdin, which kills the readline interface
- **Error handling** — wrap `execSync` in try/catch; never let the installer crash
- **User prompts** — use the `ask(rl, question)` helper; return trimmed strings

### Testing

This project is designed to run on a live Debian 13 VPS. There is no test suite — changes should be validated by:

1. Running `start.sh` on a fresh Debian 13 VPS (or container)
2. Running `platforms` and verifying the menu renders correctly
3. Testing install/remove for any modified packages
4. Testing the full OpenClaw flow if portal changes are made

### Pull Request Checklist

- [ ] Changes tested on Debian 13 (or Debian 13 Docker container)
- [ ] No new npm dependencies added to `installer.mjs`
- [ ] Package definitions include correct `apt` name and `category`
- [ ] Custom installs have proper error handling (try/catch)
- [ ] Any new ports documented in this file's Port Allocation table
- [ ] New stacks/packages appear correctly in the menu
- [ ] `PLATFORM_INSTALLER.md` updated if user-facing features changed
- [ ] No secrets or credentials committed

---

## File Size Reference

| File                  | Approx. Lines | Purpose              |
|-----------------------|---------------|----------------------|
| `start.sh`           | ~200          | VPS bootstrap        |
| `installer.mjs`      | ~1539         | Package manager      |
| `server.mjs`         | ~170          | Portal server        |
| `db/setup.mjs`       | ~140          | DB schema setup      |
| `portal-ctl.sh`      | ~85           | Process management   |
| `login.ejs`          | ~100          | Login page template  |
| `login.css`          | ~250          | Login page styles    |
