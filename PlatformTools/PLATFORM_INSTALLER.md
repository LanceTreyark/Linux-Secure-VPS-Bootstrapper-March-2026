# Platform Installer Documentation

> Part of [Linux-Secure-VPS-Bootstrapper-March-2026](https://github.com/LanceTreyark/Linux-Secure-VPS-Bootstrapper-March-2026)

Interactive Node.js package manager for Linux VPS. Provides a color-coded terminal menu to install, remove, and manage server packages with preset stack bundles.

## Usage

```bash
platforms
```

> This alias is set up automatically by `start.sh`. It runs `sudo node installer.mjs` from the PlatformTools directory.

The installer requires **root privileges** and will update `apt` package lists on launch.

---

## Preset Stacks

Stacks install multiple related packages in a single selection. If some packages are already installed, only the missing ones are added.

### ⭐ Lance's Stack

| Package    | Purpose                          |
|------------|----------------------------------|
| Nginx      | Web server & reverse proxy       |
| PostgreSQL | Relational database              |
| Git        | Version control                  |
| Node.js    | JavaScript runtime               |
| Certbot    | SSL certificate management       |

**Post-install:** Prompts for Git username/email configuration and generates an Ed25519 SSH key for GitHub with step-by-step instructions on how to add it.

### 🌐 Web Dev Stack

| Package    | Purpose                          |
|------------|----------------------------------|
| Nginx      | Web server & reverse proxy       |
| PostgreSQL | Relational database              |
| Node.js    | JavaScript runtime               |
| Git        | Version control                  |
| Certbot    | SSL certificate management       |
| PM2        | Node.js process manager          |

### 🪔 LAMP Stack

| Package    | Purpose                          |
|------------|----------------------------------|
| Apache2    | HTTP server                      |
| MariaDB    | MySQL-compatible database        |
| Python 3   | Programming language             |
| pip3       | Python package manager           |

### 🐳 Docker Stack

| Package        | Purpose                      |
|----------------|------------------------------|
| Docker         | Container platform           |
| Docker Compose | Multi-container orchestration|
| Git            | Version control              |

### 🤖 AI Stack

| Package    | Purpose                          |
|------------|----------------------------------|
| OpenClaw   | AI gateway (port 18789)          |
| Node.js    | JavaScript runtime               |
| Git        | Version control                  |

**Post-install:** Runs the full OpenClaw setup flow (see below).

### 🔒 Security Stack

| Package            | Purpose                      |
|--------------------|------------------------------|
| Fail2ban           | Brute-force protection       |
| Auto Updates       | Automatic security patches   |
| Certbot            | SSL certificate management   |

---

## Individual Packages

Browse and install packages by category:

### Web Servers
| Package | Description                              |
|---------|------------------------------------------|
| Nginx   | High-performance web server & reverse proxy |
| Apache2 | Popular open-source HTTP server          |
| Caddy   | Automatic HTTPS web server               |

### Databases
| Package    | Description                           |
|------------|---------------------------------------|
| PostgreSQL | Advanced open-source relational DB    |
| MariaDB    | MySQL-compatible community database   |
| MySQL      | Widely-used relational database       |
| MongoDB    | NoSQL document database               |
| Redis      | In-memory data store & cache          |
| SQLite3    | Lightweight file-based database       |

### Runtimes & Languages
| Package  | Description                            |
|----------|----------------------------------------|
| Node.js  | JavaScript runtime (includes npm)      |
| Python 3 | Python programming language            |
| pip3     | Python package manager                 |
| Go       | Go programming language                |

### Dev Tools
| Package         | Description                         |
|-----------------|-------------------------------------|
| Git             | Version control system              |
| Docker          | Container platform                  |
| Docker Compose  | Multi-container orchestration       |
| Certbot         | Let's Encrypt SSL certificate tool  |
| PM2             | Node.js process manager             |
| Build Essential | GCC, make & compilation tools       |
| tmux            | Terminal multiplexer                |

### AI & Platforms
| Package  | Description                            |
|----------|----------------------------------------|
| OpenClaw | OpenClaw AI gateway (port 18789)       |

### Security
| Package      | Description                          |
|--------------|--------------------------------------|
| Fail2ban     | Intrusion prevention                 |
| Auto Updates | Automatic security updates           |

### Monitoring
| Package   | Description                           |
|-----------|---------------------------------------|
| btop      | Modern system resource monitor        |
| htop      | Interactive process viewer            |
| Neofetch  | System info display tool              |
| Net Tools | ifconfig, netstat & network utilities |

---

## Special Flows

### Git SSH Key Setup (Lance's Stack)

When Lance's Stack completes installation, the installer:

1. **Prompts for Git name and email** — configures `git config --global` for both root and the sudo user
2. **Generates an Ed25519 SSH key** — saves to `~/.ssh/id_ed25519`
3. **Displays the public key** — in a highlighted box for easy copying
4. **Shows GitHub instructions:**
   - Go to https://github.com/settings/keys
   - Click "New SSH key"
   - Paste the key
   - Test with `ssh -T git@github.com`

If a key already exists, you're given the option to reuse it or generate a new one.

### Add SSH Key (TOOLS)

Always available in the TOOLS section. Lets you authorize additional SSH public keys so other developers, agents, or servers can SSH into this machine.

**Flow:**

1. **Shows existing keys** — lists all currently authorized keys with their type and comment
2. **Paste a public key** — validates format (must start with `ssh-` or `ecdsa-`)
3. **Duplicate check** — skips keys that are already authorized
4. **Appends to `~/.ssh/authorized_keys`** — with correct ownership and `chmod 600`
5. **Loop** — prompts to add more keys until you're done
6. **Syncs to root** — copies the updated `authorized_keys` to root's `.ssh/` so keys work for both accounts

### Generate Server SSH Key (TOOLS)

Always available in the TOOLS section. Generates an Ed25519 SSH key pair **on this server** so it can SSH out to other servers — useful for manager agents that need to connect to multiple VPS instances.

**Flow:**

1. **Checks for existing key** — shows the current key if one exists; offers to keep or overwrite
2. **Key comment** — defaults to `user@hostname`; customizable
3. **Generates Ed25519 key** — saved to `~/.ssh/id_ed25519` with `chmod 600`
4. **Displays public key** — in a highlighted box for copying
5. **Shows instructions** — how to add this key to the target server's `authorized_keys` (or use the "Add SSH Key" tool on the target)

### Health Check & Repair (TOOLS)

Visible when OpenClaw is installed. Runs a 10-point diagnostic scan and auto-fixes what it can without reinstalling anything. Also handles domain setup/change (replaces the old separate "Configure OpenClaw Domain" tool):

| # | Check | Auto-fix |
|---|-------|----------|
| 1 | PostgreSQL running | `systemctl start postgresql` |
| 2 | OpenClaw gateway service | Restart or create systemd unit |
| 3 | Portal on port 3000 | `portal-ctl start` |
| 4 | OpenClaw config (allowedOrigins + cleanup) | Add allowed origins, remove invalid keys, restart gateway |
| 5 | Portal .env (OPENCLAW_TOKEN, SESSION_SECRET, DATABASE_URL) | Pull token from gateway config, generate secret |
| 6 | Domain setup / change | Detect current domain; offer to set up or change via `setupOpenClawDomain()`, close port 3000, update origins, restart services |
| 7 | Web server config (proxy_pass + SSL) | Reports status; suggests re-running health check if missing |
| 8 | SSL certificate | Checks expiry, auto-renews if < 7 days; retries certbot if missing and DNS resolves |
| 9 | portal-ctl + cron job | Install script + hourly health cron |
| 10 | Shell aliases (portal-start/stop/status) | Append to .bashrc |

Ends with a summary: all passed, all fixed, or N issues need manual attention.

### OpenClaw Setup

When OpenClaw is installed (individually or via AI Stack), the installer runs a guided setup:

1. **Domain prompt** — optionally tie a domain name to the gateway
2. If a domain is provided:
   - **Web server check** — detects if Nginx, Apache2, or Caddy is installed
   - If none is installed, **prompts to choose and install one** (Nginx, Apache2, or Caddy)
   - **Creates a reverse proxy config** — routes `domain → 127.0.0.1:18789`
   - **Installs Certbot** + the correct web server plugin if not present
   - **Displays required DNS records** — shows A records with auto-detected server IP:
     ```
     Type   Name              Value
     ─────  ────────────────  ─────────────────
     A      example.com       203.0.113.10
     A      www.example.com   203.0.113.10
     ```
   - **Runs Certbot** for SSL if DNS is ready, or provides the manual command
3. **Starts the gateway** — `openclaw gateway --port 18789` (runs in background)
4. **Firewall handling:**
   - **With domain** — port 18789 stays internal; traffic routes through 443 (HTTPS) via the reverse proxy
   - **Without domain** — opens port 18789/tcp in UFW for direct access

If no domain is provided, it skips straight to starting the gateway.

### Two-Factor Authentication (Portal)

After logging into the OpenClaw portal, users can enable TOTP-based two-factor authentication at `/2fa/setup`:

1. **Scan QR code** — use any authenticator app (Google Authenticator, Authy, 1Password)
2. **Enter verification code** — type the 6-digit code to confirm setup
3. **2FA is now active** — every future login will require password + authenticator code

To disable 2FA, visit `/2fa/setup` again and enter your password to confirm.

### Add a Website (TOOLS)

When a web server is installed, the TOOLS section of the main menu shows an **"Add a Website"** option. This creates a complete static website with a landing page for any domain you own.

**Flow:**

1. **Domain prompt** — enter the domain name (e.g., `myblog.com`)
2. **Web server detection** — uses installed Nginx, Apache2, or Caddy; if none installed, prompts to choose and install one
3. **Web directory** — creates `/var/www/<domain>/public_html/` with the standard directory structure (see below)
4. **Landing page** — deploys a dark-themed landing page (`index.html`) with the domain name, instructions, and a gradient design; skips if `index.html` already exists
5. **Static config** — generates a file-serving web server configuration (no reverse proxy — just serves files from `public_html/`)
6. **SSL** — installs Certbot + the correct plugin, shows required DNS records with auto-detected server IP, and runs Certbot when DNS is ready
   - Caddy handles SSL automatically (no Certbot needed)

After setup, edit the files at `/var/www/<domain>/public_html/` to build your site.

> **Difference from OpenClaw configs:** The OpenClaw setup uses *reverse proxy* configs that route traffic to `127.0.0.1:3000` (the portal). The "Add a Website" feature uses *static file* configs that serve files directly from the web root with no proxy. Both use the same web directory structure.

---

### Reverse Proxy Configs

The installer creates a standard web directory structure and generates web server configs automatically:

#### Web Directory Structure

```
/var/www/example.com/
├── public_html/      ← web root (publicly served files)
└── .env              ← environment variables (NOT web-accessible)
```

- `public_html/` is set as the document root for the web server
- `.env` sits **outside** `public_html/` so it is never served to the web
- All dotfiles are blocked by the web server config (deny rules)
- Store API keys, database credentials, and secrets in `.env` — your app reads from `../. env` relative to the web root

#### Web Server Configs

**Nginx** → `/etc/nginx/sites-available/{domain}`
- Root: `/var/www/{domain}/public_html`
- Proxies to `127.0.0.1:18789` with WebSocket support
- Blocks all dotfiles (`location ~ /\.`)
- Auto-symlinked to `sites-enabled/` and reloaded

**Apache2** → `/etc/apache2/sites-available/{domain}.conf`
- DocumentRoot: `/var/www/{domain}/public_html`
- Enables `proxy`, `proxy_http`, `headers` modules
- Blocks dotfiles via `<FilesMatch>`
- Auto-enabled with `a2ensite` and reloaded

**Caddy** → appended to `/etc/caddy/Caddyfile`
- Root: `/var/www/{domain}/public_html`
- Blocks dotfile access with `respond @dotfiles 403`
- Caddy handles SSL automatically (no certbot needed)

### Static File Configs (Add a Website)

The static configs serve files directly with no reverse proxy — used by the "Add a Website" tool.

**Nginx** → `/etc/nginx/sites-available/{domain}`
- Root: `/var/www/{domain}/public_html`
- Serves `index.html` by default, falls back to `404`
- Blocks all dotfiles (`location ~ /\.`)
- Auto-symlinked to `sites-enabled/` and reloaded

**Apache2** → `/etc/apache2/sites-available/{domain}.conf`
- DocumentRoot: `/var/www/{domain}/public_html`
- `AllowOverride All` for `.htaccess` support
- Blocks dotfiles via `<FilesMatch>`
- Auto-enabled with `a2ensite` and reloaded

**Caddy** → appended to `/etc/caddy/Caddyfile`
- Root: `/var/www/{domain}/public_html`
- Serves files with `file_server`
- Blocks dotfiles, auto-SSL

---

## Menu Features

- **Color-coded status** — green `● INSTALLED` vs dim `○ not installed`
- **Install counts** — shows `X of Y packages installed` and per-category counts
- **Stack status** — shows `ALL INSTALLED` or `partial` for each stack
- **Remove packages** — selecting an installed package offers removal
- **Port warnings** — packages that open firewall ports show a ⚡ warning before install

---

## Files

| File                   | Purpose                                    |
|------------------------|--------------------------------------------|
| `platformInstaller.sh` | Shell wrapper — launches the Node installer |
| `installer.mjs`        | Main interactive installer (Node.js ES module) |
| `package.json`         | Node module configuration                  |
| `PLATFORM_INSTALLER.md`| This documentation file                    |
