# Linux VPS Initialization Script

Base server configuration script for **Debian 13** that automates initial VPS setup, installs Node.js, and deploys an interactive package manager.

> **New to SSH keys?** Read the [SSH Key Guide](SSH_Key_Guide.md) for step-by-step instructions on generating keys for Linux, macOS, and Windows.

## What This Script Does

1. **Creates a sudo user** — prompts for username and password
2. **Installs core packages** — sudo, ufw, btop, curl, ca-certificates, gnupg
3. **Installs Node.js 22 LTS** — via NodeSource repository
4. **Configures UFW firewall** — opens SSH (22), HTTP (80), HTTPS (443)
5. **Sets up SSH key-based authentication** — supports multiple keys
6. **Disables password login** — hardens SSH access
7. **Deploys the Platform Installer** — copies to user's home directory
8. **Configures alias commands** — shortcuts for both the sudo user and root

## Quick Start

### 1. SSH into your VPS as root

```bash
ssh root@your_vps_ip
```

### 2. Run the installer

One command — downloads the repo, extracts it, and runs the setup script:

```bash
apt update && apt install -y curl && curl -fsSL https://github.com/LanceTreyark/Linux-Secure-VPS-Bootstrapper-March-2026/archive/refs/heads/main.tar.gz | tar -xz -C /tmp && bash /tmp/Linux-Secure-VPS-Bootstrapper-March-2026-main/start.sh
```

### 3. Follow the prompts

The script will ask you to:

1. Enter a username for the new sudo user
2. Set a password for the new user
3. Provide your SSH public key (or reuse the key(s) already on the server)
4. Optionally add additional SSH keys

## After Installation

Log in with your new sudo user:

```bash
ssh your_username@your_vps_ip
```

### Available Alias Commands

| Command     | Action                                        |
|-------------|-----------------------------------------------|
| `update`    | `sudo apt update && sudo apt upgrade -y`      |
| `bb`        | Launches `btop` system monitor                |
| `monitor`   | Launches `btop` system monitor                |
| `platforms` | Opens the interactive Platform Installer menu |

### Installed by Default

| Package       | Version        | Purpose                    |
|---------------|----------------|----------------------------|
| Node.js       | 22.x LTS       | JavaScript runtime + npm   |
| btop          | latest         | System resource monitor    |
| curl          | latest         | HTTP client                |
| UFW           | latest         | Firewall manager           |

## Platform Installer

After setup, type `platforms` to launch the interactive package manager. See [PlatformTools/PLATFORM_INSTALLER.md](PlatformTools/PLATFORM_INSTALLER.md) for full documentation.

Features include:

- **Preset stacks** — one-click bundles (Lance's Stack, Web Dev, LAMP, Docker, AI, Security)
- **Individual packages** — browse by category (Web Servers, Databases, Runtimes, Dev Tools, AI, Security, Monitoring)
- **TOOLS menu** — utilities for managing your server:
  - **Add a Website** — creates a static site with a landing page, web server config, and SSL (requires a web server)
  - **Git & SSH Key Setup** — configures Git and generates an Ed25519 SSH key for GitHub (requires Git)
  - **Add SSH Key** — authorize other developers or agents to SSH into this server
  - **Generate Server SSH Key** — create a key so this server can SSH into other servers
  - **Health Check & Repair** — all-in-one OpenClaw diagnostics: domain setup/change, SSL, config, services, and auto-fix (requires OpenClaw)

## Firewall Ports

The following ports are opened by default:

| Port    | Service |
|---------|---------|
| 22/tcp  | SSH     |
| 80/tcp  | HTTP    |
| 443/tcp | HTTPS   |

Additional ports are opened automatically when installing packages that require them (e.g., OpenClaw opens 18789/tcp).

## Project Structure

```
├── start.sh                      # Main initialization script
├── README.md                     # This file
├── Q_Com.sh                      # Quick git commit helper
├── Developers/
│   ├── NotesForContributors.md   # Architecture overview & contributing guide
│   └── LancesGuideForOpenclawAgents.md  # AI agent deployment conventions
└── PlatformTools/
    ├── platformInstaller.sh      # Shell wrapper (launches Node installer)
    ├── installer.mjs             # Interactive Node.js package manager
    ├── package.json              # Node module config
    ├── PLATFORM_INSTALLER.md     # Platform Installer documentation
    └── openclaw-portal/          # Authenticated OpenClaw portal app
```

## Developer Guides

Detailed documentation for contributors and AI agents lives in the `Developers/` directory:

| Guide | Purpose |
|-------|---------|
| [NotesForContributors.md](Developers/NotesForContributors.md) | Full architecture overview, component breakdowns, data flow diagrams, code style rules, and a pull request checklist — start here if you want to understand the codebase or submit a PR |
| [LancesGuideForOpenclawAgents.md](Developers/LancesGuideForOpenclawAgents.md) | Deployment conventions for AI agents building websites on this server — covers the directory structure, Nginx reverse proxy setup, port allocation, PostgreSQL usage, SSL, and a step-by-step deployment checklist |

Additional technical docs:

| Guide | Purpose |
|-------|---------|
| [PLATFORM_INSTALLER.md](PlatformTools/PLATFORM_INSTALLER.md) | User-facing documentation for the interactive package manager (stacks, categories, special flows) |
