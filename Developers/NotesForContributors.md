# Contributor Guide — Project Architecture

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
│   ├── configureOpenClawDomain(rl)  — After-the-fact domain addition
│   └── setupOpenClaw(rl)            — Full OpenClaw + portal deployment
│
├── Web directory & config generators
│   ├── createWebDirectory(domain)   — /var/www/<domain>/public_html + .env
│   ├── createNginxConfig(domain)    — Reverse proxy + dotfile block
│   ├── createApacheConfig(domain)   — ProxyPass + dotfile block
│   └── createCaddyConfig(domain)    — Auto-SSL reverse proxy
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

**Contextual tools menu:** When OpenClaw is installed, a "Configure OpenClaw Domain" option appears in the main menu, allowing users to add a domain after initial setup using the same webserver/certbot/DNS flow.

**Key design decisions:**
- Zero dependencies — uses only Node.js built-ins (`child_process`, `readline`)
- All UI is raw ANSI escape codes — no framework, no library
- Everything runs synchronously via `execSync` except menu prompts
- Package detection uses `which` first, falls back to `dpkg -l`
- Post-install hooks are async functions that receive the readline interface

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
| `server.mjs`     | Express server, Passport local strategy, session config, proxy middleware |
| `db/setup.mjs`   | Creates PostgreSQL role, database, `users` table, `user_sessions` table, admin user |
| `views/login.ejs` | EJS login page with dark theme, animated background, SVG icons |
| `public/css/login.css` | CSS with custom properties, animations, responsive design |
| `portal-ctl.sh`  | Management script for start/stop/status/health             |
| `.env.example`   | Environment variable template                              |

**Technology stack:**
- Express.js 4 with EJS templates
- Passport.js with local strategy
- PostgreSQL via `pg` + `connect-pg-simple` for sessions
- `bcrypt` (12 rounds) for password hashing
- `http-proxy-middleware` for proxying to OpenClaw with WebSocket support
- `dotenv` for environment configuration

**Database schema:**
```sql
-- Users table
users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
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

| Alias            | Command                      |
|------------------|------------------------------|
| `portal-start`   | `sudo portal-ctl start`     |
| `portal-stop`    | `sudo portal-ctl stop`      |
| `portal-status`  | `sudo portal-ctl status`    |

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
    curl install OpenClaw binary
        │
        ▼
    setupOpenClaw(rl)
        │
        ├── setupOpenClawDomain(rl)
        │       ├── Prompt for domain (or skip)
        │       ├── Detect/install web server
        │       ├── Generate reverse proxy config
        │       ├── Install Certbot + get SSL
        │       └── return domain
        │
        ├── Deploy Portal
        │       ├── Install PostgreSQL if missing
        │       ├── Copy openclaw-portal/ → /opt/openclaw-portal/
        │       ├── npm install --omit=dev
        │       ├── Generate .env (random session secret)
        │       ├── Prompt admin username/password
        │       ├── Run db/setup.mjs
        │       ├── Install portal-ctl to /usr/local/bin/
        │       ├── Set up hourly cron job
        │       └── Add aliases to .bashrc
        │
        └── Start services
                ├── openclaw gateway --port 18789
                └── portal-ctl start
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
- **`execSync`** — all system commands are synchronous; async is only for user prompts
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
| `start.sh`           | ~140          | VPS bootstrap        |
| `installer.mjs`      | ~1000         | Package manager      |
| `server.mjs`         | ~140          | Portal server        |
| `db/setup.mjs`       | ~80           | DB schema setup      |
| `portal-ctl.sh`      | ~85           | Process management   |
| `login.ejs`          | ~100          | Login page template  |
| `login.css`          | ~250          | Login page styles    |
