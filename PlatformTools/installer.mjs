#!/usr/bin/env node

// ──────────────────────────────────────────────
//  Platform Installer — Interactive Node.js Menu
//  Run with: sudo node installer.mjs
// ──────────────────────────────────────────────

import { execSync } from 'child_process';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync, appendFileSync, writeFileSync, existsSync } from 'fs';

// Prevent child processes from stealing stdin (which kills readline).
// Show stdout + stderr but feed /dev/null into stdin.
const NO_STDIN = { stdio: ['ignore', 'inherit', 'inherit'] };

// ── Color helpers ───────────────────────────────
const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgRed:   '\x1b[41m',
  bgBlue:  '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgYellow: '\x1b[43m',
  bgCyan: '\x1b[46m',
  black:   '\x1b[30m',
};

const icon = {
  installed:   `${c.green}● `,
  notInstalled:`${c.dim}○ `,
  rocket:      '🚀',
  package:     '📦',
  trash:       '🗑️ ',
  check:       '✅',
  x:           '❌',
  star:        '⭐',
  gear:        '⚙️ ',
  back:        '↩ ',
};

// ── Package definitions ─────────────────────────
const packages = {
  // Web Servers
  nginx:       { name: 'Nginx',            apt: 'nginx',              category: 'Web Servers',   desc: 'High-performance web server & reverse proxy' },
  apache2:     { name: 'Apache2',          apt: 'apache2',            category: 'Web Servers',   desc: 'Popular open-source HTTP server' },
  caddy:       { name: 'Caddy',            apt: 'caddy',              category: 'Web Servers',   desc: 'Automatic HTTPS web server', customCheck: 'caddy' },

  // Databases
  postgresql:  { name: 'PostgreSQL',       apt: 'postgresql',         category: 'Databases',     desc: 'Advanced open-source relational database' },
  mariadb:     { name: 'MariaDB',          apt: 'mariadb-server',     category: 'Databases',     desc: 'MySQL-compatible community database', customCheck: 'mariadbd' },
  mysql:       { name: 'MySQL',            apt: 'mysql-server',       category: 'Databases',     desc: 'Widely-used relational database' },
  mongodb:     { name: 'MongoDB',          apt: 'mongod',             category: 'Databases',     desc: 'NoSQL document database', customCheck: 'mongod', customInstall: true },
  redis:       { name: 'Redis',            apt: 'redis-server',       category: 'Databases',     desc: 'In-memory data store & cache' },
  sqlite3:     { name: 'SQLite3',          apt: 'sqlite3',            category: 'Databases',     desc: 'Lightweight file-based database' },

  // Runtimes & Languages
  nodejs:      { name: 'Node.js',          apt: 'nodejs',             category: 'Runtimes',      desc: 'JavaScript runtime (includes npm)', customCheck: 'node' },
  python3:     { name: 'Python 3',         apt: 'python3',            category: 'Runtimes',      desc: 'Python programming language' },
  pip3:        { name: 'pip3',             apt: 'python3-pip',        category: 'Runtimes',      desc: 'Python package manager', customCheck: 'pip3' },
  golang:      { name: 'Go',               apt: 'golang',             category: 'Runtimes',      desc: 'Go programming language' },

  // Dev Tools
  git:         { name: 'Git',              apt: 'git',                category: 'Dev Tools',     desc: 'Version control system' },
  docker:      { name: 'Docker',           apt: 'docker.io',          category: 'Dev Tools',     desc: 'Container platform', customCheck: 'docker' },
  compose:     { name: 'Docker Compose',   apt: 'docker-compose',     category: 'Dev Tools',     desc: 'Multi-container orchestration', customCheck: 'docker-compose' },
  certbot:     { name: 'Certbot',          apt: 'certbot',            category: 'Dev Tools',     desc: "Let's Encrypt SSL certificate tool" },
  pm2:         { name: 'PM2',              apt: 'pm2',                category: 'Dev Tools',     desc: 'Node.js process manager', customCheck: 'pm2', customInstall: true },
  make:        { name: 'Build Essential',  apt: 'build-essential',    category: 'Dev Tools',     desc: 'GCC, make & compilation tools', customCheck: 'make' },
  tmux:        { name: 'tmux',             apt: 'tmux',               category: 'Dev Tools',     desc: 'Terminal multiplexer' },

  // AI & Platforms
  openclaw:    { name: 'OpenClaw',         apt: 'openclaw',           category: 'AI & Platforms', desc: 'OpenClaw AI gateway (port 18789)', customCheck: 'openclaw', customInstall: true },

  // Security
  fail2ban:    { name: 'Fail2ban',         apt: 'fail2ban',           category: 'Security',      desc: 'Intrusion prevention & brute-force protection' },
  unattended:  { name: 'Auto Updates',     apt: 'unattended-upgrades', category: 'Security',     desc: 'Automatic security updates', customCheck: 'unattended-upgrade' },

  // Monitoring
  btop:        { name: 'btop',             apt: 'btop',               category: 'Monitoring',    desc: 'Modern system resource monitor' },
  htop:        { name: 'htop',             apt: 'htop',               category: 'Monitoring',    desc: 'Interactive process viewer' },
  neofetch:    { name: 'Neofetch',         apt: 'neofetch',           category: 'Monitoring',    desc: 'System info display tool' },
  nettools:    { name: 'Net Tools',        apt: 'net-tools',          category: 'Monitoring',    desc: 'ifconfig, netstat & network utilities', customCheck: 'ifconfig' },
};

// ── Custom install commands for non-apt packages ─
const customInstalls = {
  openclaw: {
    install: 'echo "OpenClaw binary will be installed during the setup wizard..."',
    postInstall: (rl) => setupOpenClaw(rl),
  },
  pm2: {
    install: 'npm install -g pm2',
  },
  mongodb: {
    install: [
      'curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg',
      'echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" > /etc/apt/sources.list.d/mongodb-org-7.0.list',
      'apt update',
      'apt install -y mongodb-org',
    ].join(' && '),
  },
};

// ── Stacks (preset bundles) ─────────────────────
const stacks = {
  lance: {
    name: "⭐ Lance's Stack",
    desc: 'Nginx + PostgreSQL + Git + Node.js + Certbot',
    packages: ['nginx', 'postgresql', 'git', 'nodejs', 'certbot'],
    postInstall: async (rl) => {
      const doSSH = await ask(rl, `\n  ${c.cyan}Set up Git SSH keys for GitHub? (y/n): ${c.reset}`);
      if (doSSH.toLowerCase() === 'y') await setupGitSSH(rl);
    },
  },
  webdev: {
    name: '🌐 Web Dev Stack',
    desc: 'Nginx + PostgreSQL + Node.js + Git + Certbot + PM2',
    packages: ['nginx', 'postgresql', 'nodejs', 'git', 'certbot', 'pm2'],
  },
  lamp: {
    name: '🪔 LAMP Stack',
    desc: 'Apache2 + MariaDB + PHP + Python 3',
    packages: ['apache2', 'mariadb', 'python3', 'pip3'],
  },
  docker: {
    name: '🐳 Docker Stack',
    desc: 'Docker + Docker Compose + Git',
    packages: ['docker', 'compose', 'git'],
  },
  ai: {
    name: '🤖 AI Stack',
    desc: 'OpenClaw AI Gateway + Node.js + Git',
    packages: ['openclaw', 'nodejs', 'git'],
  },
  security: {
    name: '🔒 Security Stack',
    desc: 'Fail2ban + Auto Updates + Certbot',
    packages: ['fail2ban', 'unattended', 'certbot'],
  },
};

// ── Utility functions ───────────────────────────
function isInstalled(key) {
  const pkg = packages[key];
  const cmd = pkg.customCheck || pkg.apt;
  try {
    execSync(`which ${cmd} 2>/dev/null || dpkg -l ${pkg.apt} 2>/dev/null | grep -q "^ii"`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function runApt(action, aptName) {
  try {
    console.log(`\n${c.cyan}${c.bold}${action === 'install' ? icon.package : icon.trash} ${action === 'install' ? 'Installing' : 'Removing'} ${aptName}...${c.reset}\n`);
    execSync(`apt ${action} -y ${aptName}`, NO_STDIN);
    return true;
  } catch {
    return false;
  }
}

function runCustomInstall(key) {
  const custom = customInstalls[key];
  if (!custom) return false;
  try {
    console.log(`\n${c.cyan}${c.bold}${icon.package} Installing ${packages[key].name} (custom)...${c.reset}\n`);
    execSync(custom.install, NO_STDIN);
    return true;
  } catch {
    return false;
  }
}

function openPorts(ports) {
  for (const port of ports) {
    try {
      execSync(`ufw allow ${port}`, NO_STDIN);
      console.log(`  ${icon.check} ${c.green}Opened port ${port}${c.reset}`);
    } catch {
      console.log(`  ${icon.x} ${c.red}Failed to open port ${port}${c.reset}`);
    }
  }
}

function installPackage(key) {
  const pkg = packages[key];
  let ok;
  if (pkg.customInstall && customInstalls[key]) {
    ok = runCustomInstall(key);
  } else {
    ok = runApt('install', pkg.apt);
  }
  // Open any required ports
  if (ok && pkg.ports && pkg.ports.length > 0) {
    console.log(`\n${c.yellow}${c.bold}  Opening required firewall ports...${c.reset}`);
    openPorts(pkg.ports);
  }
  return ok;
}

// ── Git SSH Key Setup ───────────────────────────
async function setupGitSSH(rl) {
  console.log();
  console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}   🔑 Git & SSH Key Setup for GitHub             ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
  console.log();

  // Get the real user (not root)
  let realUser;
  try {
    realUser = execSync('logname 2>/dev/null || echo root', { encoding: 'utf-8' }).trim();
  } catch {
    realUser = 'root';
  }
  const homeDir = realUser === 'root' ? '/root' : `/home/${realUser}`;

  // Configure git user
  const gitName = await ask(rl, `  ${c.cyan}Enter your Git name (e.g., Lance): ${c.reset}`);
  const gitEmail = await ask(rl, `  ${c.cyan}Enter your Git email: ${c.reset}`);

  if (gitName) {
    execSync(`git config --global user.name "${gitName}"`);
    console.log(`  ${icon.check} ${c.green}Git user.name set to "${gitName}"${c.reset}`);
  }
  if (gitEmail) {
    execSync(`git config --global user.email "${gitEmail}"`);
    console.log(`  ${icon.check} ${c.green}Git user.email set to "${gitEmail}"${c.reset}`);
  }

  // Also set for the real user if running as root
  if (realUser !== 'root' && gitName && gitEmail) {
    try {
      execSync(`su - ${realUser} -c 'git config --global user.name "${gitName}"'`);
      execSync(`su - ${realUser} -c 'git config --global user.email "${gitEmail}"'`);
      console.log(`  ${icon.check} ${c.green}Git config also set for user ${realUser}${c.reset}`);
    } catch { /* non-critical */ }
  }

  // Generate SSH key
  const sshKeyPath = `${homeDir}/.ssh/id_ed25519`;
  let keyExists = false;
  try {
    execSync(`test -f ${sshKeyPath}`, { stdio: 'pipe' });
    keyExists = true;
  } catch { /* doesn't exist */ }

  if (keyExists) {
    console.log(`\n  ${c.yellow}SSH key already exists at ${sshKeyPath}${c.reset}`);
    const regen = await ask(rl, `  ${c.yellow}Generate a new key? This will overwrite the existing one. (y/n): ${c.reset}`);
    if (regen.toLowerCase() !== 'y') {
      // Just show the existing key
      const existingKey = execSync(`cat ${sshKeyPath}.pub`, { encoding: 'utf-8' }).trim();
      printGitHubInstructions(existingKey);
      return;
    }
  }

  console.log(`\n  ${c.cyan}Generating SSH key (Ed25519)...${c.reset}`);
  const emailForKey = gitEmail || 'server@vps';
  try {
    execSync(`ssh-keygen -t ed25519 -C "${emailForKey}" -f ${sshKeyPath} -N ""`, { stdio: 'pipe' });
    // Fix ownership if generated as root for another user
    if (realUser !== 'root') {
      execSync(`chown ${realUser}:${realUser} ${sshKeyPath} ${sshKeyPath}.pub`);
    }
    console.log(`  ${icon.check} ${c.green}SSH key generated at ${sshKeyPath}${c.reset}`);
    const pubKey = execSync(`cat ${sshKeyPath}.pub`, { encoding: 'utf-8' }).trim();
    printGitHubInstructions(pubKey);
  } catch (err) {
    console.log(`  ${icon.x} ${c.red}Failed to generate SSH key: ${err.message}${c.reset}`);
  }
}

function printGitHubInstructions(pubKey) {
  console.log();
  console.log(`${c.bgGreen}${c.white}${c.bold}  ╔══════════════════════════════════════════════╗  ${c.reset}`);
  console.log(`${c.bgGreen}${c.white}${c.bold}  ║  YOUR PUBLIC SSH KEY (copy this)             ║  ${c.reset}`);
  console.log(`${c.bgGreen}${c.white}${c.bold}  ╚══════════════════════════════════════════════╝  ${c.reset}`);
  console.log();
  console.log(`  ${c.cyan}${c.bold}${pubKey}${c.reset}`);
  console.log();
  console.log(`${c.yellow}${c.bold}  How to add this key to GitHub:${c.reset}`);
  console.log(`${c.white}  1. Go to ${c.cyan}https://github.com/settings/keys${c.reset}`);
  console.log(`${c.white}  2. Click ${c.green}"New SSH key"${c.reset}`);
  console.log(`${c.white}  3. Give it a title (e.g., "My VPS")${c.reset}`);
  console.log(`${c.white}  4. Paste the key above into the "Key" field${c.reset}`);
  console.log(`${c.white}  5. Click ${c.green}"Add SSH key"${c.reset}`);
  console.log();
  console.log(`${c.dim}  After adding the key, test with: ssh -T git@github.com${c.reset}`);
  console.log();
}

// ── OpenClaw domain setup (reusable) ────────────
async function setupOpenClawDomain(rl) {
  const domain = await ask(rl, `  ${c.cyan}Enter a domain name to tie to OpenClaw (or press Enter to skip): ${c.reset}`);
  if (!domain) return null;

  console.log(`\n  ${c.green}Domain: ${c.bold}${domain}${c.reset}`);

  // ── Check for an installed web server ────────
  const hasNginx = isInstalled('nginx');
  const hasApache = isInstalled('apache2');
  let webserver = null;

  if (hasNginx && hasApache) {
    console.log(`\n  ${c.yellow}Both Nginx and Apache2 are installed.${c.reset}`);
    const pick = await ask(rl, `  ${c.cyan}Which web server should proxy ${domain}? (1=Nginx, 2=Apache2): ${c.reset}`);
    webserver = pick === '2' ? 'apache2' : 'nginx';
  } else if (hasNginx) {
    webserver = 'nginx';
    console.log(`  ${icon.check} ${c.green}Nginx detected — will create config for it.${c.reset}`);
  } else if (hasApache) {
    webserver = 'apache2';
    console.log(`  ${icon.check} ${c.green}Apache2 detected — will create config for it.${c.reset}`);
  } else {
    console.log(`\n  ${c.yellow}No web server is installed. OpenClaw needs a reverse proxy for your domain.${c.reset}`);
    console.log(`  ${c.cyan}${c.bold}1)${c.reset} Nginx  ${c.dim}(recommended)${c.reset}`);
    console.log(`  ${c.cyan}${c.bold}2)${c.reset} Apache2`);
    console.log(`  ${c.cyan}${c.bold}3)${c.reset} Caddy`);
    const wsPick = await ask(rl, `\n  ${c.cyan}Select a web server to install (1-3): ${c.reset}`);
    if (wsPick === '2') {
      webserver = 'apache2';
      installPackage('apache2');
    } else if (wsPick === '3') {
      webserver = 'caddy';
      installPackage('caddy');
    } else {
      webserver = 'nginx';
      installPackage('nginx');
    }
  }

  // ── Create reverse proxy config ─────────────
  if (webserver === 'nginx') {
    createNginxConfig(domain);
  } else if (webserver === 'apache2') {
    createApacheConfig(domain);
  } else if (webserver === 'caddy') {
    createCaddyConfig(domain);
  }

  // ── Install certbot & webserver plugin ───────
  if (!isInstalled('certbot')) {
    console.log(`\n  ${c.cyan}Certbot is required for SSL. Installing...${c.reset}`);
    installPackage('certbot');
  }
  // Always ensure the correct webserver plugin is installed
  if (webserver === 'nginx') {
    runApt('install', 'python3-certbot-nginx');
  } else if (webserver === 'apache2') {
    runApt('install', 'python3-certbot-apache');
  }

  // ── DNS instructions ────────────────────────
  console.log();
  console.log(`${c.bgRed}${c.white}${c.bold}  ╔══════════════════════════════════════════════╗  ${c.reset}`);
  console.log(`${c.bgRed}${c.white}${c.bold}  ║  ⚠  REQUIRED: Add these DNS records first!   ║  ${c.reset}`);
  console.log(`${c.bgRed}${c.white}${c.bold}  ╚══════════════════════════════════════════════╝  ${c.reset}`);
  console.log();
  let serverIP = 'YOUR_SERVER_IP';
  try {
    serverIP = execSync("hostname -I | awk '{print $1}'", { encoding: 'utf-8' }).trim();
  } catch { /* use placeholder */ }
  console.log(`  ${c.white}Go to your DNS provider and add:${c.reset}`);
  console.log();
  console.log(`  ${c.cyan}${c.bold}  Type   Name              Value${c.reset}`);
  console.log(`  ${c.white}  ─────  ────────────────  ─────────────────${c.reset}`);
  console.log(`  ${c.green}  A      ${domain.padEnd(16)}  ${serverIP}${c.reset}`);
  console.log(`  ${c.green}  A      www.${domain.length > 12 ? domain.substring(0, 12) + '…' : domain.padEnd(12)}  ${serverIP}${c.reset}`);
  console.log();
  console.log(`  ${c.yellow}DNS can take up to 24 hours to propagate, but usually works within minutes.${c.reset}`);
  console.log();

  // ── SSL certificate loop (retry-friendly) ───
  let sslDone = false;
  let currentDomain = domain;

  while (!sslDone) {
    const dnsReady = await ask(rl, `  ${c.cyan}${c.bold}Have you added the DNS records and are they propagated? (y/n): ${c.reset}`);

    if (dnsReady.toLowerCase() !== 'y') {
      console.log(`\n  ${c.yellow}No problem — you can come back later.${c.reset}`);
      console.log(`  ${c.yellow}Use ${c.bold}"Health Check & Repair"${c.reset}${c.yellow} from the TOOLS menu to retry SSL at any time.${c.reset}`);
      break;
    }

    // Verify DNS actually resolves before wasting a certbot attempt
    console.log(`\n  ${c.cyan}Verifying DNS for ${c.bold}${currentDomain}${c.reset}${c.cyan}...${c.reset}`);
    let resolvedIP = '';
    try {
      resolvedIP = execSync(`dig +short ${currentDomain} 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
    } catch { /* */ }
    if (!resolvedIP) {
      try { resolvedIP = execSync(`host ${currentDomain} 2>/dev/null | grep 'has address' | head -1 | awk '{print $NF}'`, { encoding: 'utf-8' }).trim(); } catch { /* */ }
    }
    if (!resolvedIP) {
      try { resolvedIP = execSync(`getent hosts ${currentDomain} 2>/dev/null | awk '{print $1}'`, { encoding: 'utf-8' }).trim(); } catch { /* */ }
    }
    if (!resolvedIP) {
      try { resolvedIP = execSync(`ping -c1 -W2 ${currentDomain} 2>/dev/null | head -1 | grep -oP '\\(\\K[0-9.]+'`, { encoding: 'utf-8' }).trim(); } catch { /* */ }
    }

    if (!resolvedIP) {
      console.log(`\n  ${icon.x} ${c.red}${c.bold}DNS is NOT resolving for ${currentDomain}${c.reset}`);
      console.log(`  ${c.red}Certbot will fail if DNS isn't set up. Let's fix this first.${c.reset}`);
      console.log();
      console.log(`  ${c.white}Your DNS records should look like this:${c.reset}`);
      console.log();
      console.log(`  ${c.cyan}${c.bold}  Type   Name              Value${c.reset}`);
      console.log(`  ${c.white}  ─────  ────────────────  ─────────────────${c.reset}`);
      console.log(`  ${c.green}  A      ${currentDomain.padEnd(16)}  ${serverIP}${c.reset}`);
      console.log(`  ${c.green}  A      www.${(currentDomain.length > 12 ? currentDomain.substring(0, 12) + '…' : currentDomain).padEnd(12)}  ${serverIP}${c.reset}`);
      console.log();
      console.log(`  ${c.yellow}${c.bold}Common issues:${c.reset}`);
      console.log(`  ${c.white}  • Domain not registered or expired${c.reset}`);
      console.log(`  ${c.white}  • A records point to the wrong IP (must be ${c.bold}${serverIP}${c.reset}${c.white})${c.reset}`);
      console.log(`  ${c.white}  • DNS hasn't propagated yet (wait a few minutes, then retry)${c.reset}`);
      console.log(`  ${c.white}  • Typo in the domain name${c.reset}`);
      console.log();
      console.log(`  ${c.cyan}${c.bold}1)${c.reset} Retry with same domain (${currentDomain})`);
      console.log(`  ${c.cyan}${c.bold}2)${c.reset} Enter a different domain`);
      console.log(`  ${c.cyan}${c.bold}3)${c.reset} Skip SSL for now (set up later)`);
      const dnsChoice = await ask(rl, `\n  ${c.cyan}Choose (1-3): ${c.reset}`);
      if (dnsChoice === '2') {
        const newDomain = await ask(rl, `  ${c.cyan}Enter the correct domain: ${c.reset}`);
        if (newDomain && newDomain.includes('.') && newDomain.length >= 3) {
          currentDomain = newDomain.trim();
          // Recreate web server config for new domain
          if (webserver === 'nginx') { createNginxConfig(currentDomain); }
          else if (webserver === 'apache2') { createApacheConfig(currentDomain); }
          else if (webserver === 'caddy') { createCaddyConfig(currentDomain); }
          console.log(`\n  ${icon.check} ${c.green}Domain changed to ${c.bold}${currentDomain}${c.reset}`);
          console.log();
          console.log(`  ${c.white}Make sure these DNS records exist:${c.reset}`);
          console.log(`  ${c.cyan}${c.bold}  Type   Name              Value${c.reset}`);
          console.log(`  ${c.white}  ─────  ────────────────  ─────────────────${c.reset}`);
          console.log(`  ${c.green}  A      ${currentDomain.padEnd(16)}  ${serverIP}${c.reset}`);
          console.log(`  ${c.green}  A      www.${(currentDomain.length > 12 ? currentDomain.substring(0, 12) + '…' : currentDomain).padEnd(12)}  ${serverIP}${c.reset}`);
          console.log();
        } else {
          console.log(`  ${c.yellow}Invalid domain — keeping ${currentDomain}${c.reset}`);
        }
        continue; // loop back to DNS check
      } else if (dnsChoice === '3') {
        console.log(`\n  ${c.yellow}SSL skipped. Use ${c.bold}"Health Check & Repair"${c.reset}${c.yellow} from the TOOLS menu when ready.${c.reset}`);
        break;
      }
      // dnsChoice === '1' or anything else → loop retries
      continue;
    }

    // DNS resolves — check it points to this server
    if (resolvedIP !== serverIP) {
      console.log(`\n  ${c.yellow}${c.bold}⚠  DNS resolves, but to a different IP:${c.reset}`);
      console.log(`  ${c.white}  ${currentDomain} → ${c.red}${c.bold}${resolvedIP}${c.reset}`);
      console.log(`  ${c.white}  Expected:       → ${c.green}${c.bold}${serverIP}${c.reset}`);
      console.log();
      console.log(`  ${c.yellow}Certbot will fail unless the domain points to this server.${c.reset}`);
      console.log();
      console.log(`  ${c.cyan}${c.bold}1)${c.reset} Try anyway (maybe the IP is correct and detection is wrong)`);
      console.log(`  ${c.cyan}${c.bold}2)${c.reset} Enter a different domain`);
      console.log(`  ${c.cyan}${c.bold}3)${c.reset} Skip SSL for now`);
      const ipChoice = await ask(rl, `\n  ${c.cyan}Choose (1-3): ${c.reset}`);
      if (ipChoice === '2') {
        const newDomain = await ask(rl, `  ${c.cyan}Enter the correct domain: ${c.reset}`);
        if (newDomain && newDomain.includes('.') && newDomain.length >= 3) {
          currentDomain = newDomain.trim();
          if (webserver === 'nginx') { createNginxConfig(currentDomain); }
          else if (webserver === 'apache2') { createApacheConfig(currentDomain); }
          else if (webserver === 'caddy') { createCaddyConfig(currentDomain); }
          console.log(`\n  ${icon.check} ${c.green}Domain changed to ${c.bold}${currentDomain}${c.reset}`);
        } else {
          console.log(`  ${c.yellow}Invalid domain — keeping ${currentDomain}${c.reset}`);
        }
        continue;
      } else if (ipChoice === '3') {
        console.log(`\n  ${c.yellow}SSL skipped. Use ${c.bold}"Health Check & Repair"${c.reset}${c.yellow} from the TOOLS menu when ready.${c.reset}`);
        break;
      }
      // ipChoice === '1' → fall through to certbot attempt
    } else {
      console.log(`  ${icon.check} ${c.green}DNS resolves to ${serverIP} — correct!${c.reset}`);
    }

    // Attempt certbot
    console.log(`\n  ${c.cyan}Running Certbot to obtain SSL certificate...${c.reset}\n`);
    try {
      if (webserver === 'nginx') {
        execSync(`certbot --nginx -d ${currentDomain} -d www.${currentDomain} --non-interactive --agree-tos --redirect --register-unsafely-without-email`, NO_STDIN);
      } else if (webserver === 'apache2') {
        execSync(`certbot --apache -d ${currentDomain} -d www.${currentDomain} --non-interactive --agree-tos --redirect --register-unsafely-without-email`, NO_STDIN);
      } else {
        console.log(`  ${c.dim}Caddy handles SSL automatically.${c.reset}`);
      }
      console.log(`\n  ${icon.check} ${c.green}${c.bold}SSL certificate obtained! ${currentDomain} is now secured with HTTPS.${c.reset}`);
      sslDone = true;
    } catch {
      console.log(`\n  ${icon.x} ${c.red}${c.bold}Certbot failed to obtain SSL certificate.${c.reset}`);
      console.log();
      console.log(`  ${c.yellow}${c.bold}This usually means:${c.reset}`);
      console.log(`  ${c.white}  • DNS hasn't fully propagated yet (wait a few minutes)${c.reset}`);
      console.log(`  ${c.white}  • The domain points to the wrong server${c.reset}`);
      console.log(`  ${c.white}  • Port 80 is blocked by a firewall${c.reset}`);
      console.log(`  ${c.white}  • Rate limit hit (too many requests to Let's Encrypt for this domain)${c.reset}`);
      console.log();
      console.log(`  ${c.cyan}${c.bold}1)${c.reset} Retry SSL with same domain (${currentDomain})`);
      console.log(`  ${c.cyan}${c.bold}2)${c.reset} Enter a different domain`);
      console.log(`  ${c.cyan}${c.bold}3)${c.reset} Skip SSL for now (fix later with Health Check & Repair)`);
      const failChoice = await ask(rl, `\n  ${c.cyan}Choose (1-3): ${c.reset}`);
      if (failChoice === '2') {
        const newDomain = await ask(rl, `  ${c.cyan}Enter the correct domain: ${c.reset}`);
        if (newDomain && newDomain.includes('.') && newDomain.length >= 3) {
          currentDomain = newDomain.trim();
          if (webserver === 'nginx') { createNginxConfig(currentDomain); }
          else if (webserver === 'apache2') { createApacheConfig(currentDomain); }
          else if (webserver === 'caddy') { createCaddyConfig(currentDomain); }
          console.log(`\n  ${icon.check} ${c.green}Domain changed to ${c.bold}${currentDomain}${c.reset}`);
        } else {
          console.log(`  ${c.yellow}Invalid domain — keeping ${currentDomain}${c.reset}`);
        }
        continue;
      } else if (failChoice === '3') {
        console.log(`\n  ${c.yellow}SSL skipped. Use ${c.bold}"Health Check & Repair"${c.reset}${c.yellow} from the TOOLS menu to retry.${c.reset}`);
        break;
      }
      // failChoice === '1' or anything else → loop retries
      continue;
    }
  }

  return currentDomain;
}

// ── OpenClaw Health Check & Repair ──────────────
async function repairOpenClaw(rl) {
  clearScreen();
  printHeader();
  console.log(`${c.bgYellow}${c.black}${c.bold}                                                ${c.reset}`);
  console.log(`${c.bgYellow}${c.black}${c.bold}   🩺 OpenClaw Health Check & Repair             ${c.reset}`);
  console.log(`${c.bgYellow}${c.black}${c.bold}                                                ${c.reset}`);
  console.log();

  let realUser;
  try { realUser = execSync('logname 2>/dev/null || echo root', { encoding: 'utf-8' }).trim(); } catch { realUser = 'root'; }
  const homeDir = realUser === 'root' ? '/root' : `/home/${realUser}`;
  const portalDest = '/opt/openclaw-portal';
  const clawCfg = `${homeDir}/.openclaw/openclaw.json`;

  function fileExists(p) { try { execSync(`test -f ${p}`, { stdio: 'pipe' }); return true; } catch { return false; } }
  function dirExists(p) { try { execSync(`test -d ${p}`, { stdio: 'pipe' }); return true; } catch { return false; } }

  let issuesFound = 0;
  let issuesFixed = 0;

  // ── Detect domain from nginx sites ────────────
  let domain = null;
  try {
    const sites = execSync('ls /etc/nginx/sites-available/ 2>/dev/null', { encoding: 'utf-8' }).trim();
    const candidates = sites.split('\n').filter(s => s !== 'default' && s.length > 0);
    if (candidates.length > 0) domain = candidates[0];
  } catch { /* no nginx */ }

  let webserver = null;
  if (isInstalled('nginx')) webserver = 'nginx';
  else if (isInstalled('apache2')) webserver = 'apache2';
  else if (isInstalled('caddy')) webserver = 'caddy';

  console.log(`  ${c.cyan}${c.bold}Running health checks...${c.reset}\n`);

  // ── 1. PostgreSQL running ─────────────────────
  process.stdout.write(`  ${c.dim}[1/10]${c.reset} PostgreSQL ... `);
  try {
    const pgStatus = execSync('systemctl is-active postgresql 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (pgStatus === 'active') {
      console.log(`${icon.check} ${c.green}running${c.reset}`);
    } else {
      throw new Error('not active');
    }
  } catch {
    issuesFound++;
    console.log(`${icon.x} ${c.red}not running — restarting...${c.reset}`);
    try {
      execSync('systemctl enable postgresql && systemctl start postgresql', { stdio: 'pipe' });
      console.log(`       ${icon.check} ${c.green}PostgreSQL started${c.reset}`);
      issuesFixed++;
    } catch {
      console.log(`       ${icon.x} ${c.red}Failed to start PostgreSQL. Check: systemctl status postgresql${c.reset}`);
    }
  }

  // ── 2. OpenClaw gateway service ───────────────
  process.stdout.write(`  ${c.dim}[2/10]${c.reset} OpenClaw gateway service ... `);
  const gatewayServiceExists = fileExists('/etc/systemd/system/openclaw-gateway.service');
  if (gatewayServiceExists) {
    try {
      const gwStatus = execSync('systemctl is-active openclaw-gateway 2>/dev/null || echo stopped', { encoding: 'utf-8' }).trim();
      if (gwStatus === 'active') {
        console.log(`${icon.check} ${c.green}running${c.reset}`);
      } else {
        throw new Error('not active');
      }
    } catch {
      issuesFound++;
      console.log(`${icon.x} ${c.red}not running — restarting...${c.reset}`);
      try {
        // Auto-fix config issues before restart
        try { execSync(`sudo -u ${realUser} openclaw doctor --fix 2>/dev/null`, { stdio: 'pipe' }); } catch { /* ignore */ }
        execSync('systemctl restart openclaw-gateway', { stdio: 'pipe' });
        // Wait a moment and verify it actually stayed running
        execSync('sleep 2', { stdio: 'pipe' });
        const recheck = execSync('systemctl is-active openclaw-gateway 2>/dev/null || echo stopped', { encoding: 'utf-8' }).trim();
        if (recheck === 'active') {
          console.log(`       ${icon.check} ${c.green}Gateway restarted${c.reset}`);
          issuesFixed++;
        } else {
          throw new Error('crashed after restart');
        }
      } catch {
        console.log(`       ${icon.x} ${c.red}Gateway won't stay running.${c.reset}`);
        // Check if config exists
        if (!fileExists(clawCfg)) {
          console.log(`       ${c.yellow}Config missing: ${clawCfg}${c.reset}`);
          console.log(`       ${c.yellow}Run: ${c.bold}sudo -u ${realUser} openclaw configure${c.reset}${c.yellow} then restart${c.reset}`);
        } else {
          console.log(`       ${c.yellow}Check logs: ${c.bold}journalctl -u openclaw-gateway --no-pager -n 20${c.reset}`);
        }
      }
    }
  } else {
    issuesFound++;
    console.log(`${icon.x} ${c.yellow}no systemd service — creating one...${c.reset}`);
    try {
      const openclawBin = execSync('which openclaw', { encoding: 'utf-8' }).trim();
      if (openclawBin) {
        let systemPath = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
        try { systemPath = execSync('echo $PATH', { encoding: 'utf-8' }).trim(); } catch { /* use default */ }

        const serviceContent = [
          '[Unit]', 'Description=OpenClaw Gateway', 'After=network.target postgresql.service', 'Wants=network.target', '',
          '[Service]', 'Type=simple', `User=${realUser}`, `Group=${realUser}`, `WorkingDirectory=${homeDir}`,
          `ExecStart=${openclawBin} gateway --port 18789`,
          'Restart=on-failure', 'RestartSec=5',
          `Environment=HOME=${homeDir}`, 'Environment=NODE_ENV=production',
          `Environment=PATH=${systemPath}`, '',
          '[Install]', 'WantedBy=multi-user.target', '',
        ].join('\n');
        writeFileSync('/etc/systemd/system/openclaw-gateway.service', serviceContent);
        execSync('systemctl daemon-reload && systemctl enable openclaw-gateway && systemctl start openclaw-gateway', { stdio: 'pipe' });
        console.log(`       ${icon.check} ${c.green}Gateway service created & started${c.reset}`);
        issuesFixed++;
      }
    } catch {
      console.log(`       ${icon.x} ${c.red}Could not create service. Is OpenClaw installed?${c.reset}`);
    }
  }

  // ── 3. Portal running on port 3000 ────────────
  process.stdout.write(`  ${c.dim}[3/10]${c.reset} Portal (port 3000) ... `);
  try {
    const portalPid = execSync('lsof -ti:3000 2>/dev/null || echo ""', { encoding: 'utf-8' }).trim();
    if (portalPid) {
      console.log(`${icon.check} ${c.green}running (PID ${portalPid.split('\n')[0]})${c.reset}`);
    } else {
      throw new Error('not listening');
    }
  } catch {
    issuesFound++;
    console.log(`${icon.x} ${c.red}not running — starting...${c.reset}`);
    try {
      execSync('/usr/local/bin/portal-ctl start', { stdio: 'pipe' });
      console.log(`       ${icon.check} ${c.green}Portal started${c.reset}`);
      issuesFixed++;
    } catch {
      console.log(`       ${icon.x} ${c.red}Failed. Check: portal-ctl start${c.reset}`);
    }
  }

  // ── 4. OpenClaw config (gateway settings + controlUi) ──
  process.stdout.write(`  ${c.dim}[4/10]${c.reset} OpenClaw config ... `);
  if (fileExists(clawCfg)) {
    try {
      const raw = execSync(`cat ${clawCfg}`, { encoding: 'utf-8' });
      const cfg = JSON.parse(raw);
      let changed = false;

      if (!cfg.gateway) cfg.gateway = {};

      // Ensure critical gateway settings (may be lost if `openclaw configure` overwrites config)
      if (cfg.gateway.mode !== 'local') { cfg.gateway.mode = 'local'; changed = true; }
      if (cfg.gateway.port !== 18789) { cfg.gateway.port = 18789; changed = true; }
      if (cfg.gateway.bind !== 'loopback') { cfg.gateway.bind = 'loopback'; changed = true; }

      // Ensure auth token exists — recover from portal .env if missing
      if (!cfg.gateway.auth?.token) {
        try {
          const envContent = execSync(`cat ${portalDest}/.env 2>/dev/null || echo ""`, { encoding: 'utf-8' });
          const tokenMatch = envContent.match(/^OPENCLAW_TOKEN=(.+)$/m);
          if (tokenMatch && tokenMatch[1].trim()) {
            if (!cfg.gateway.auth) cfg.gateway.auth = {};
            cfg.gateway.auth.token = tokenMatch[1].trim();
            changed = true;
          }
        } catch { /* can't recover token — check 5 will flag it */ }
      }

      // Ensure trustedProxies includes 127.0.0.1 (portal proxies from localhost)
      if (!cfg.gateway.trustedProxies) { cfg.gateway.trustedProxies = ['127.0.0.1']; changed = true; }
      else if (!cfg.gateway.trustedProxies.includes('127.0.0.1')) { cfg.gateway.trustedProxies.push('127.0.0.1'); changed = true; }

      // Disable browser device-identity checks — our portal handles auth
      if (!cfg.gateway.controlUi) cfg.gateway.controlUi = {};
      if (!cfg.gateway.controlUi.dangerouslyDisableDeviceAuth) {
        cfg.gateway.controlUi.dangerouslyDisableDeviceAuth = true;
        changed = true;
      }

      // allowedOrigins — required for reverse-proxied Control UI
      if (domain) {
        if (!cfg.gateway.controlUi.allowedOrigins) cfg.gateway.controlUi.allowedOrigins = [];
        const origins = [`https://${domain}`, `https://www.${domain}`];
        for (const origin of origins) {
          if (!cfg.gateway.controlUi.allowedOrigins.includes(origin)) {
            cfg.gateway.controlUi.allowedOrigins.push(origin);
            changed = true;
          }
        }
      }

      if (changed) {
        issuesFound++;
        execSync(`echo '${JSON.stringify(cfg, null, 2).replace(/'/g, "'\\''")}' > ${clawCfg}`, { stdio: 'pipe' });
        console.log(`${icon.x} ${c.yellow}missing entries — fixed${c.reset}`);
        if (domain) console.log(`       ${icon.check} ${c.green}Added: allowedOrigins for ${domain}${c.reset}`);
        // Restart gateway to pick up config
        try { execSync('systemctl restart openclaw-gateway', { stdio: 'pipe' }); } catch { /* */ }
        issuesFixed++;
      } else {
        console.log(`${icon.check} ${c.green}gateway config OK${c.reset}`);
      }
    } catch (err) {
      console.log(`${icon.x} ${c.red}could not parse: ${err.message}${c.reset}`);
    }
  } else {
    issuesFound++;
    console.log(`${icon.x} ${c.red}config not found at ${clawCfg}${c.reset}`);
    console.log(`       ${c.yellow}Run: openclaw setup${c.reset}`);
  }

  // ── 5. Portal .env + OPENCLAW_TOKEN ───────────
  process.stdout.write(`  ${c.dim}[5/10]${c.reset} Portal .env ... `);
  if (fileExists(`${portalDest}/.env`)) {
    try {
      const envContent = execSync(`cat ${portalDest}/.env`, { encoding: 'utf-8' });
      const hasToken = /^OPENCLAW_TOKEN=.+/m.test(envContent);
      const hasSecret = /^SESSION_SECRET=.+/m.test(envContent);
      const hasDbUrl = /^DATABASE_URL=.+/m.test(envContent);
      const problems = [];
      if (!hasToken) problems.push('OPENCLAW_TOKEN');
      if (!hasSecret) problems.push('SESSION_SECRET');
      if (!hasDbUrl) problems.push('DATABASE_URL');

      if (problems.length > 0) {
        issuesFound++;
        console.log(`${icon.x} ${c.yellow}missing: ${problems.join(', ')}${c.reset}`);

        // Auto-fix token from OpenClaw config
        if (!hasToken && fileExists(clawCfg)) {
          try {
            const raw = execSync(`cat ${clawCfg}`, { encoding: 'utf-8' });
            const cfg = JSON.parse(raw);
            const token = cfg.gateway?.auth?.token || '';
            if (token) {
              execSync(`echo 'OPENCLAW_TOKEN=${token}' >> ${portalDest}/.env`, { stdio: 'pipe' });
              console.log(`       ${icon.check} ${c.green}OPENCLAW_TOKEN added from gateway config${c.reset}`);
              issuesFixed++;
            } else {
              console.log(`       ${c.yellow}Add token manually: echo 'OPENCLAW_TOKEN=<your-token>' >> ${portalDest}/.env${c.reset}`);
            }
          } catch { /* */ }
        }
        if (!hasSecret) {
          try {
            const secret = execSync('openssl rand -hex 32', { encoding: 'utf-8' }).trim();
            execSync(`echo 'SESSION_SECRET=${secret}' >> ${portalDest}/.env`, { stdio: 'pipe' });
            console.log(`       ${icon.check} ${c.green}SESSION_SECRET generated${c.reset}`);
            issuesFixed++;
          } catch { /* */ }
        }
      } else {
        console.log(`${icon.check} ${c.green}all keys present${c.reset}`);
      }
    } catch {
      console.log(`${icon.x} ${c.red}could not read .env${c.reset}`);
    }
  } else {
    issuesFound++;
    console.log(`${icon.x} ${c.red}missing — re-run OpenClaw setup to create it${c.reset}`);
  }

  // ── 6. Domain setup / change ──────────────────
  process.stdout.write(`  ${c.dim}[6/10]${c.reset} Domain ... `);
  if (domain) {
    console.log(`${icon.check} ${c.green}${domain} detected${c.reset}`);
    const changeDomain = await ask(rl, `         ${c.dim}Change domain? (y/N): ${c.reset}`);
    if (changeDomain.toLowerCase() === 'y') {
      const newDomain = await setupOpenClawDomain(rl);
      if (newDomain) {
        domain = newDomain;
        // Close direct port 3000 — traffic routes through HTTPS
        try { execSync('ufw delete allow 3000/tcp 2>/dev/null', { stdio: 'pipe' }); } catch { /* */ }
        // Update allowedOrigins
        try {
          const raw = execSync(`cat ${clawCfg}`, { encoding: 'utf-8' });
          const cfg = JSON.parse(raw);
          if (!cfg.gateway) cfg.gateway = {};
          if (!cfg.gateway.controlUi) cfg.gateway.controlUi = {};
          if (!cfg.gateway.controlUi.allowedOrigins) cfg.gateway.controlUi.allowedOrigins = [];
          const origins = [`https://${domain}`, `https://www.${domain}`];
          let changed = false;
          for (const origin of origins) {
            if (!cfg.gateway.controlUi.allowedOrigins.includes(origin)) {
              cfg.gateway.controlUi.allowedOrigins.push(origin);
              changed = true;
            }
          }
          if (changed) {
            execSync(`echo '${JSON.stringify(cfg, null, 2).replace(/'/g, "'\\''")}' > ${clawCfg}`, { stdio: 'pipe' });
            try { execSync('systemctl restart openclaw-gateway', NO_STDIN); } catch { /* */ }
          }
        } catch { /* */ }
        // Restart portal
        try { execSync('/usr/local/bin/portal-ctl start', { stdio: 'pipe' }); } catch { /* */ }
        console.log(`  ${icon.check} ${c.green}Domain updated to ${domain}${c.reset}`);
        // Re-detect webserver in case setupOpenClawDomain installed one
        if (isInstalled('nginx')) webserver = 'nginx';
        else if (isInstalled('apache2')) webserver = 'apache2';
        else if (isInstalled('caddy')) webserver = 'caddy';
      }
    }
  } else {
    console.log(`${c.yellow}no domain configured${c.reset}`);
    const setupDomain = await ask(rl, `         ${c.dim}Set up a domain now? (Y/n): ${c.reset}`);
    if (setupDomain.toLowerCase() !== 'n') {
      const newDomain = await setupOpenClawDomain(rl);
      if (newDomain) {
        domain = newDomain;
        // Close direct port 3000 — traffic routes through HTTPS
        try { execSync('ufw delete allow 3000/tcp 2>/dev/null', { stdio: 'pipe' }); } catch { /* */ }
        // Update allowedOrigins
        try {
          const raw = execSync(`cat ${clawCfg}`, { encoding: 'utf-8' });
          const cfg = JSON.parse(raw);
          if (!cfg.gateway) cfg.gateway = {};
          if (!cfg.gateway.controlUi) cfg.gateway.controlUi = {};
          if (!cfg.gateway.controlUi.allowedOrigins) cfg.gateway.controlUi.allowedOrigins = [];
          const origins = [`https://${domain}`, `https://www.${domain}`];
          let changed = false;
          for (const origin of origins) {
            if (!cfg.gateway.controlUi.allowedOrigins.includes(origin)) {
              cfg.gateway.controlUi.allowedOrigins.push(origin);
              changed = true;
            }
          }
          if (changed) {
            execSync(`echo '${JSON.stringify(cfg, null, 2).replace(/'/g, "'\\''")}' > ${clawCfg}`, { stdio: 'pipe' });
            try { execSync('systemctl restart openclaw-gateway', NO_STDIN); } catch { /* */ }
          }
        } catch { /* */ }
        // Restart portal
        try { execSync('/usr/local/bin/portal-ctl start', { stdio: 'pipe' }); } catch { /* */ }
        console.log(`  ${icon.check} ${c.green}Domain configured: ${domain}${c.reset}`);
        // Re-detect webserver in case setupOpenClawDomain installed one
        if (isInstalled('nginx')) webserver = 'nginx';
        else if (isInstalled('apache2')) webserver = 'apache2';
        else if (isInstalled('caddy')) webserver = 'caddy';
      }
    }
  }

  // ── 7. Nginx / web server config ──────────────
  process.stdout.write(`  ${c.dim}[7/10]${c.reset} Web server config ... `);
  if (domain && webserver === 'nginx') {
    const confPath = `/etc/nginx/sites-available/${domain}`;
    if (fileExists(confPath)) {
      try {
        const conf = execSync(`cat ${confPath}`, { encoding: 'utf-8' });
        const hasProxy = conf.includes('proxy_pass');
        const hasSSL = conf.includes('ssl') || conf.includes('443');
        if (hasProxy && hasSSL) {
          console.log(`${icon.check} ${c.green}${domain} — proxy_pass + SSL OK${c.reset}`);
        } else if (hasProxy && !hasSSL) {
          issuesFound++;
          console.log(`${icon.x} ${c.yellow}proxy_pass OK but no SSL — certbot may have failed${c.reset}`);
          console.log(`       ${c.dim}Will attempt SSL fix in check 8${c.reset}`);
        } else {
          issuesFound++;
          console.log(`${icon.x} ${c.red}proxy_pass missing — config may be corrupt${c.reset}`);
          console.log(`       ${c.yellow}Re-run this health check to set up the domain${c.reset}`);
        }
      } catch {
        console.log(`${icon.x} ${c.red}could not read nginx config${c.reset}`);
      }
    } else {
      issuesFound++;
      console.log(`${icon.x} ${c.red}no config found for ${domain}${c.reset}`);
      console.log(`       ${c.yellow}Re-run this health check and choose domain setup in check 6${c.reset}`);
    }
  } else if (domain && webserver === 'apache2') {
    const confPath = `/etc/apache2/sites-available/${domain}.conf`;
    if (fileExists(confPath)) {
      console.log(`${icon.check} ${c.green}Apache config exists for ${domain}${c.reset}`);
    } else {
      issuesFound++;
      console.log(`${icon.x} ${c.red}no config found for ${domain}${c.reset}`);
    }
  } else if (!domain) {
    console.log(`${c.dim}no domain configured — skipped${c.reset}`);
  } else {
    console.log(`${icon.check} ${c.green}${webserver || 'no web server'} detected${c.reset}`);
  }

  // ── 8. SSL certificate check & retry ──────────
  process.stdout.write(`  ${c.dim}[8/10]${c.reset} SSL certificate ... `);
  if (domain && webserver && webserver !== 'caddy') {
    let sslValid = false;
    try {
      const certCheck = execSync(`certbot certificates --domain ${domain} 2>/dev/null`, { encoding: 'utf-8' });
      sslValid = certCheck.includes('Certificate Name') && !certCheck.includes('INVALID');
      if (sslValid) {
        // Check expiry
        const expiryMatch = certCheck.match(/Expiry Date: ([^\n]+)/);
        if (expiryMatch) {
          const expiry = new Date(expiryMatch[1].trim().split(' (')[0]);
          const daysLeft = Math.floor((expiry - new Date()) / 86400000);
          if (daysLeft < 7) {
            console.log(`${c.yellow}expires in ${daysLeft} days — renewing...${c.reset}`);
            try {
              execSync('certbot renew --force-renewal', NO_STDIN);
              console.log(`       ${icon.check} ${c.green}Certificate renewed${c.reset}`);
              issuesFixed++;
            } catch {
              console.log(`       ${icon.x} ${c.red}Renewal failed. Try: sudo certbot renew --force-renewal${c.reset}`);
            }
          } else {
            console.log(`${icon.check} ${c.green}valid (${daysLeft} days remaining)${c.reset}`);
          }
        } else {
          console.log(`${icon.check} ${c.green}certificate found${c.reset}`);
        }
      } else {
        throw new Error('no valid cert');
      }
    } catch {
      issuesFound++;
      console.log(`${icon.x} ${c.yellow}not found or invalid${c.reset}`);

      // Get server IP for display
      let serverIP = 'YOUR_SERVER_IP';
      try { serverIP = execSync("hostname -I | awk '{print $1}'", { encoding: 'utf-8' }).trim(); } catch { /* */ }

      // Interactive SSL repair loop
      let sslRetrying = true;
      while (sslRetrying) {
        // Check DNS
        let resolvedIP = '';
        try { resolvedIP = execSync(`dig +short ${domain} 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim(); } catch { /* */ }
        if (!resolvedIP) {
          try { resolvedIP = execSync(`host ${domain} 2>/dev/null | grep 'has address' | head -1 | awk '{print $NF}'`, { encoding: 'utf-8' }).trim(); } catch { /* */ }
        }
        if (!resolvedIP) {
          try { resolvedIP = execSync(`getent hosts ${domain} 2>/dev/null | awk '{print $1}'`, { encoding: 'utf-8' }).trim(); } catch { /* */ }
        }
        if (!resolvedIP) {
          try { resolvedIP = execSync(`ping -c1 -W2 ${domain} 2>/dev/null | head -1 | grep -oP '\\(\\K[0-9.]+'`, { encoding: 'utf-8' }).trim(); } catch { /* */ }
        }

        if (!resolvedIP) {
          console.log(`\n       ${icon.x} ${c.red}DNS is NOT resolving for ${domain}${c.reset}`);
          console.log(`       ${c.white}Your DNS records should look like this:${c.reset}`);
          console.log(`       ${c.cyan}  Type   Name              Value${c.reset}`);
          console.log(`       ${c.white}  ─────  ────────────────  ─────────────────${c.reset}`);
          console.log(`       ${c.green}  A      ${domain.padEnd(16)}  ${serverIP}${c.reset}`);
          console.log(`       ${c.green}  A      www.${(domain.length > 12 ? domain.substring(0, 12) + '…' : domain).padEnd(12)}  ${serverIP}${c.reset}`);
          console.log();
          console.log(`       ${c.cyan}${c.bold}1)${c.reset} Retry (after fixing DNS)`);
          console.log(`       ${c.cyan}${c.bold}2)${c.reset} Skip SSL for now`);
          const dnsChoice = await ask(rl, `       ${c.cyan}Choose (1-2): ${c.reset}`);
          if (dnsChoice === '2') { sslRetrying = false; break; }
          continue;
        }

        if (resolvedIP !== serverIP) {
          console.log(`\n       ${c.yellow}⚠  DNS resolves to ${c.red}${resolvedIP}${c.reset}${c.yellow}, expected ${c.green}${serverIP}${c.reset}`);
          console.log(`       ${c.cyan}${c.bold}1)${c.reset} Try anyway`);
          console.log(`       ${c.cyan}${c.bold}2)${c.reset} Skip SSL for now`);
          const ipChoice = await ask(rl, `       ${c.cyan}Choose (1-2): ${c.reset}`);
          if (ipChoice === '2') { sslRetrying = false; break; }
        } else {
          console.log(`       ${icon.check} ${c.green}DNS resolves to ${serverIP}${c.reset}`);
        }

        // Attempt certbot
        console.log(`       ${c.cyan}Running Certbot...${c.reset}`);
        try {
          if (webserver === 'nginx') {
            execSync(`certbot --nginx -d ${domain} -d www.${domain} --non-interactive --agree-tos --redirect --register-unsafely-without-email`, NO_STDIN);
          } else {
            execSync(`certbot --apache -d ${domain} -d www.${domain} --non-interactive --agree-tos --redirect --register-unsafely-without-email`, NO_STDIN);
          }
          console.log(`       ${icon.check} ${c.green}${c.bold}SSL certificate obtained!${c.reset}`);
          issuesFixed++;
          sslRetrying = false;
        } catch {
          console.log(`       ${icon.x} ${c.red}Certbot failed.${c.reset}`);
          console.log(`       ${c.yellow}Common causes: DNS not propagated, port 80 blocked, rate limit.${c.reset}`);
          console.log();
          console.log(`       ${c.cyan}${c.bold}1)${c.reset} Retry`);
          console.log(`       ${c.cyan}${c.bold}2)${c.reset} Skip SSL for now`);
          const retryChoice = await ask(rl, `       ${c.cyan}Choose (1-2): ${c.reset}`);
          if (retryChoice === '2') { sslRetrying = false; }
        }
      }
    }
  } else if (webserver === 'caddy') {
    console.log(`${icon.check} ${c.green}Caddy handles SSL automatically${c.reset}`);
  } else {
    console.log(`${c.dim}no domain or web server — skipped${c.reset}`);
  }

  // ── 9. portal-ctl + cron ──────────────────────
  process.stdout.write(`  ${c.dim}[9/10]${c.reset} portal-ctl & cron ... `);
  const portalCtlOk = fileExists('/usr/local/bin/portal-ctl');
  let cronOk = false;
  try {
    const cron = execSync('crontab -l 2>/dev/null', { encoding: 'utf-8' });
    cronOk = cron.includes('portal-ctl health');
  } catch { /* no crontab */ }

  if (portalCtlOk && cronOk) {
    console.log(`${icon.check} ${c.green}installed + cron job active${c.reset}`);
  } else {
    issuesFound++;
    if (!portalCtlOk) {
      try {
        execSync(`cp ${portalDest}/portal-ctl.sh /usr/local/bin/portal-ctl && chmod +x /usr/local/bin/portal-ctl`, { stdio: 'pipe' });
        console.log(`${icon.x} ${c.yellow}portal-ctl missing — installed${c.reset}`);
        issuesFixed++;
      } catch {
        console.log(`${icon.x} ${c.red}portal-ctl missing & could not install${c.reset}`);
      }
    }
    if (!cronOk) {
      try {
        let existing = '';
        try { existing = execSync('crontab -l 2>/dev/null', { encoding: 'utf-8' }); } catch { /* */ }
        const newCron = existing.trimEnd() + '\n0 * * * * /usr/local/bin/portal-ctl health\n';
        execSync(`echo '${newCron.replace(/'/g, "'\\''")}' | crontab -`, { stdio: 'pipe' });
        if (portalCtlOk) console.log(`${icon.x} ${c.yellow}cron missing — installed${c.reset}`);
        else console.log(`       ${icon.x} ${c.yellow}cron missing — installed${c.reset}`);
        issuesFixed++;
      } catch {
        console.log(`       ${icon.x} ${c.red}Could not install cron job${c.reset}`);
      }
    }
  }

  // ── 10. Shell aliases ─────────────────────────
  process.stdout.write(`  ${c.dim}[10/10]${c.reset} Shell aliases ... `);
  const bashrcPaths = [`${homeDir}/.bashrc`, '/root/.bashrc'];
  let aliasesFixed = false;
  for (const rc of bashrcPaths) {
    try {
      if (!existsSync(rc)) continue;
      const content = readFileSync(rc, 'utf-8');
      if (!content.includes('portal-start')) {
        if (!aliasesFixed) { issuesFound++; aliasesFixed = true; }
        const aliasBlock = [
          '', '# OpenClaw Portal aliases',
          "alias portal-start='sudo portal-ctl start'",
          "alias portal-stop='sudo portal-ctl stop'",
          "alias portal-status='sudo portal-ctl status'",
          "alias openclaw-stop='sudo systemctl stop openclaw-gateway 2>/dev/null; sudo kill \$(lsof -ti:18789) 2>/dev/null; sudo kill \$(lsof -ti:3000) 2>/dev/null; echo \"OpenClaw stopped\"'",
          "alias openclaw-restart='sudo systemctl stop openclaw-gateway 2>/dev/null; sudo kill \$(lsof -ti:18789) 2>/dev/null; sudo kill \$(lsof -ti:3000) 2>/dev/null; sleep 1; sudo systemctl start openclaw-gateway; sleep 2; sudo portal-ctl start; echo \"OpenClaw restarted\"'",
          '',
        ].join('\n');
        appendFileSync(rc, aliasBlock);
      }
    } catch { /* non-critical */ }
  }
  if (aliasesFixed) {
    console.log(`${icon.x} ${c.yellow}missing — added to .bashrc${c.reset}`);
    issuesFixed++;
  } else {
    console.log(`${icon.check} ${c.green}portal-start/stop/status, openclaw-stop/restart OK${c.reset}`);
  }

  // ── Summary ───────────────────────────────────
  console.log();
  console.log(`${c.bold}  ────────────────────────────────────────────${c.reset}`);
  if (issuesFound === 0) {
    console.log(`\n  ${icon.check} ${c.green}${c.bold}All checks passed — OpenClaw is healthy!${c.reset}`);
  } else if (issuesFixed === issuesFound) {
    console.log(`\n  ${icon.check} ${c.green}${c.bold}Found ${issuesFound} issue(s) — all fixed automatically.${c.reset}`);
  } else {
    const remaining = issuesFound - issuesFixed;
    console.log(`\n  ${c.yellow}${c.bold}Found ${issuesFound} issue(s): ${issuesFixed} fixed, ${remaining} need manual attention.${c.reset}`);
  }

  if (domain) {
    console.log(`\n  ${c.dim}Traffic: User → ${domain} (443) → Portal (3000) → OpenClaw (18789)${c.reset}`);
  }

  await ask(rl, `\n  ${c.dim}Press Enter to continue...${c.reset}`);
}

// ── Add a static website with landing page ──────
async function addWebsite(rl) {
  clearScreen();
  printHeader();
  console.log(`${c.bgGreen}${c.white}${c.bold}                                                ${c.reset}`);
  console.log(`${c.bgGreen}${c.white}${c.bold}   🌐 Add a New Website                         ${c.reset}`);
  console.log(`${c.bgGreen}${c.white}${c.bold}                                                ${c.reset}`);
  console.log();

  const domain = await ask(rl, `  ${c.cyan}Enter the domain name (e.g., example.com): ${c.reset}`);
  if (!domain || domain.length < 3 || !domain.includes('.')) {
    console.log(`\n  ${c.yellow}Invalid or empty domain. Returning to menu.${c.reset}`);
    await ask(rl, `\n  ${c.dim}Press Enter to continue...${c.reset}`);
    return;
  }

  console.log(`\n  ${c.green}Domain: ${c.bold}${domain}${c.reset}`);

  // ── Detect or install web server ────────────
  const hasNginx = isInstalled('nginx');
  const hasApache = isInstalled('apache2');
  const hasCaddy = isInstalled('caddy');
  let webserver = null;

  if (hasNginx && hasApache) {
    const pick = await ask(rl, `\n  ${c.cyan}Both Nginx & Apache2 installed. Use which? (1=Nginx, 2=Apache2): ${c.reset}`);
    webserver = pick === '2' ? 'apache2' : 'nginx';
  } else if (hasNginx) {
    webserver = 'nginx';
    console.log(`  ${icon.check} ${c.green}Nginx detected${c.reset}`);
  } else if (hasApache) {
    webserver = 'apache2';
    console.log(`  ${icon.check} ${c.green}Apache2 detected${c.reset}`);
  } else if (hasCaddy) {
    webserver = 'caddy';
    console.log(`  ${icon.check} ${c.green}Caddy detected${c.reset}`);
  } else {
    console.log(`\n  ${c.yellow}No web server installed.${c.reset}`);
    console.log(`  ${c.cyan}${c.bold}1)${c.reset} Nginx  ${c.dim}(recommended)${c.reset}`);
    console.log(`  ${c.cyan}${c.bold}2)${c.reset} Apache2`);
    console.log(`  ${c.cyan}${c.bold}3)${c.reset} Caddy`);
    const wsPick = await ask(rl, `\n  ${c.cyan}Select a web server to install (1-3): ${c.reset}`);
    if (wsPick === '2') { webserver = 'apache2'; installPackage('apache2'); }
    else if (wsPick === '3') { webserver = 'caddy'; installPackage('caddy'); }
    else { webserver = 'nginx'; installPackage('nginx'); }
  }

  // ── Create web directory ────────────────────
  createWebDirectory(domain);

  // ── Deploy landing page ─────────────────────
  const landingPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${domain}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
      color: #e4e4e7;
    }
    .container {
      text-align: center;
      padding: 3rem 2rem;
      max-width: 600px;
    }
    .logo {
      width: 80px;
      height: 80px;
      margin: 0 auto 2rem;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.5rem;
      box-shadow: 0 8px 32px rgba(99, 102, 241, 0.3);
    }
    h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      background: linear-gradient(135deg, #c7d2fe, #e0e7ff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    p {
      color: #a1a1aa;
      font-size: 1.125rem;
      line-height: 1.6;
      margin-bottom: 2rem;
    }
    .badge {
      display: inline-block;
      padding: 0.5rem 1.25rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 500;
      background: rgba(99, 102, 241, 0.15);
      color: #a5b4fc;
      border: 1px solid rgba(99, 102, 241, 0.25);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">🚀</div>
    <h1>${domain}</h1>
    <p>This site is live and ready. Edit the files at <code style="color:#818cf8">/var/www/${domain}/public_html/</code> to build something amazing.</p>
    <span class="badge">Powered by Linux VPS Bootstrapper</span>
  </div>
</body>
</html>`;

  try {
    // Write landing page (don't overwrite if user already has content)
    const indexPath = `/var/www/${domain}/public_html/index.html`;
    let hasContent = false;
    try { execSync(`test -f ${indexPath}`, { stdio: 'pipe' }); hasContent = true; } catch { /* no index yet */ }
    if (!hasContent) {
      execSync(`cat > ${indexPath} << 'LANDING_EOF'\n${landingPage}\nLANDING_EOF`, { stdio: 'pipe' });
      console.log(`  ${icon.check} ${c.green}Landing page created: ${indexPath}${c.reset}`);
    } else {
      console.log(`  ${icon.check} ${c.green}index.html already exists — not overwriting${c.reset}`);
    }
  } catch (err) {
    console.log(`  ${icon.x} ${c.red}Failed to create landing page: ${err.message}${c.reset}`);
  }

  // ── Create web server config (static site) ──
  if (webserver === 'nginx') {
    createStaticNginxConfig(domain);
  } else if (webserver === 'apache2') {
    createStaticApacheConfig(domain);
  } else if (webserver === 'caddy') {
    createStaticCaddyConfig(domain);
  }

  // ── SSL via Certbot ─────────────────────────
  if (webserver !== 'caddy') {
    if (!isInstalled('certbot')) {
      console.log(`\n  ${c.cyan}Installing Certbot for SSL...${c.reset}`);
      installPackage('certbot');
    }
    if (webserver === 'nginx') {
      runApt('install', 'python3-certbot-nginx');
    } else if (webserver === 'apache2') {
      runApt('install', 'python3-certbot-apache');
    }

    // DNS instructions
    console.log();
    console.log(`${c.bgRed}${c.white}${c.bold}  ╔══════════════════════════════════════════════╗  ${c.reset}`);
    console.log(`${c.bgRed}${c.white}${c.bold}  ║  ⚠  REQUIRED: Add these DNS records first!   ║  ${c.reset}`);
    console.log(`${c.bgRed}${c.white}${c.bold}  ╚══════════════════════════════════════════════╝  ${c.reset}`);
    console.log();
    let serverIP = 'YOUR_SERVER_IP';
    try { serverIP = execSync("hostname -I | awk '{print $1}'", { encoding: 'utf-8' }).trim(); } catch { /* */ }
    console.log(`  ${c.white}Go to your DNS provider and add:${c.reset}`);
    console.log();
    console.log(`  ${c.cyan}${c.bold}  Type   Name              Value${c.reset}`);
    console.log(`  ${c.white}  ─────  ────────────────  ─────────────────${c.reset}`);
    console.log(`  ${c.green}  A      ${domain.padEnd(16)}  ${serverIP}${c.reset}`);
    console.log(`  ${c.green}  A      www.${(domain.length > 12 ? domain.substring(0, 12) + '…' : domain).padEnd(12)}  ${serverIP}${c.reset}`);
    console.log();

    const dnsReady = await ask(rl, `  ${c.cyan}${c.bold}Have you added the DNS records and are they propagated? (y/n): ${c.reset}`);
    if (dnsReady.toLowerCase() === 'y') {
      console.log(`\n  ${c.cyan}Running Certbot...${c.reset}\n`);
      try {
        if (webserver === 'nginx') {
          execSync(`certbot --nginx -d ${domain} -d www.${domain} --non-interactive --agree-tos --redirect --register-unsafely-without-email`, NO_STDIN);
        } else {
          execSync(`certbot --apache -d ${domain} -d www.${domain} --non-interactive --agree-tos --redirect --register-unsafely-without-email`, NO_STDIN);
        }
        console.log(`\n  ${icon.check} ${c.green}${c.bold}SSL certificate obtained! ${domain} is now secured with HTTPS.${c.reset}`);
      } catch {
        console.log(`\n  ${icon.x} ${c.red}Certbot failed. You can retry later:${c.reset}`);
        console.log(`  ${c.white}  sudo certbot --${webserver === 'nginx' ? 'nginx' : 'apache'} -d ${domain} -d www.${domain}${c.reset}`);
      }
    } else {
      console.log(`\n  ${c.yellow}No problem! After DNS propagates, run:${c.reset}`);
      console.log(`  ${c.white}  sudo certbot --${webserver === 'nginx' ? 'nginx' : 'apache'} -d ${domain} -d www.${domain}${c.reset}`);
    }
  } else {
    console.log(`\n  ${c.dim}Caddy handles SSL automatically once DNS resolves.${c.reset}`);
  }

  console.log();
  console.log(`  ${icon.rocket} ${c.green}${c.bold}Website ready: https://${domain}${c.reset}`);
  console.log(`  ${c.dim}Edit files at: /var/www/${domain}/public_html/${c.reset}`);

  await ask(rl, `\n  ${c.dim}Press Enter to continue...${c.reset}`);
}

// ── Add SSH Key to authorized_keys ──────────────
async function addSSHKey(rl) {
  clearScreen();
  printHeader();
  console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}   🔐 Add SSH Key (Authorize Access)            ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
  console.log();

  // Get the real user
  let realUser;
  try {
    realUser = execSync('logname 2>/dev/null || echo root', { encoding: 'utf-8' }).trim();
  } catch { realUser = 'root'; }
  const homeDir = realUser === 'root' ? '/root' : `/home/${realUser}`;
  const authKeysPath = `${homeDir}/.ssh/authorized_keys`;

  // Show current keys
  let currentKeys = '';
  try {
    currentKeys = execSync(`cat ${authKeysPath} 2>/dev/null`, { encoding: 'utf-8' }).trim();
  } catch { /* no file yet */ }

  if (currentKeys) {
    const keyCount = currentKeys.split('\n').filter(l => l.trim()).length;
    console.log(`  ${c.green}${keyCount} key(s) currently authorized for ${c.bold}${realUser}${c.reset}`);
    console.log();
    for (const line of currentKeys.split('\n').filter(l => l.trim())) {
      const parts = line.trim().split(' ');
      const comment = parts.length >= 3 ? parts.slice(2).join(' ') : '(no comment)';
      const type = parts[0] || 'unknown';
      console.log(`  ${c.dim}•${c.reset} ${c.cyan}${type}${c.reset} — ${c.white}${comment}${c.reset}`);
    }
    console.log();
  } else {
    console.log(`  ${c.yellow}No authorized keys found yet.${c.reset}\n`);
  }

  // Add keys in a loop
  while (true) {
    console.log(`  ${c.white}Paste a public SSH key to authorize access to this server.${c.reset}`);
    console.log(`  ${c.dim}(The key starts with ssh-ed25519, ssh-rsa, ecdsa-sha2, etc.)${c.reset}`);
    const newKey = await ask(rl, `\n  ${c.cyan}SSH public key (or press Enter to finish): ${c.reset}`);

    if (!newKey || !newKey.startsWith('ssh-') && !newKey.startsWith('ecdsa-')) {
      if (newKey) console.log(`  ${c.yellow}That doesn't look like a public key. Skipping.${c.reset}`);
      break;
    }

    try {
      // Ensure .ssh directory exists
      execSync(`mkdir -p ${homeDir}/.ssh`, { stdio: 'pipe' });

      // Check for duplicates
      let isDuplicate = false;
      try {
        const existing = execSync(`cat ${authKeysPath} 2>/dev/null`, { encoding: 'utf-8' });
        const newKeyFingerprint = newKey.split(' ').slice(0, 2).join(' ');
        isDuplicate = existing.split('\n').some(line => line.includes(newKeyFingerprint));
      } catch { /* file doesn't exist yet */ }

      if (isDuplicate) {
        console.log(`\n  ${c.yellow}This key is already authorized. Skipping.${c.reset}\n`);
        continue;
      }

      // Append the key
      execSync(`echo '${newKey}' >> ${authKeysPath}`, { stdio: 'pipe' });
      if (realUser !== 'root') {
        execSync(`chown ${realUser}:${realUser} ${authKeysPath}`, { stdio: 'pipe' });
      }
      execSync(`chmod 600 ${authKeysPath}`, { stdio: 'pipe' });

      const comment = newKey.split(' ').length >= 3 ? newKey.split(' ').slice(2).join(' ') : '';
      console.log(`\n  ${icon.check} ${c.green}Key added${comment ? ` (${comment})` : ''}${c.reset}\n`);
    } catch (err) {
      console.log(`\n  ${icon.x} ${c.red}Failed to add key: ${err.message}${c.reset}\n`);
    }

    const addMore = await ask(rl, `  ${c.cyan}Add another key? (y/n): ${c.reset}`);
    if (addMore.toLowerCase() !== 'y') break;
    console.log();
  }

  // Also copy to root if running for a regular user
  if (realUser !== 'root') {
    try {
      execSync(`mkdir -p /root/.ssh`, { stdio: 'pipe' });
      execSync(`cp ${authKeysPath} /root/.ssh/authorized_keys`, { stdio: 'pipe' });
      execSync(`chmod 600 /root/.ssh/authorized_keys`, { stdio: 'pipe' });
      console.log(`\n  ${icon.check} ${c.green}Keys also synced to root account${c.reset}`);
    } catch { /* non-critical */ }
  }

  await ask(rl, `\n  ${c.dim}Press Enter to continue...${c.reset}`);
}

// ── Generate Server SSH Key (for outbound SSH) ──
async function generateServerSSHKey(rl) {
  clearScreen();
  printHeader();
  console.log(`${c.bgCyan}${c.white}${c.bold}                                                ${c.reset}`);
  console.log(`${c.bgCyan}${c.white}${c.bold}   🔑 Generate Server SSH Key                   ${c.reset}`);
  console.log(`${c.bgCyan}${c.white}${c.bold}                                                ${c.reset}`);
  console.log();
  console.log(`  ${c.white}This generates an SSH key pair ${c.bold}on this server${c.reset}${c.white} so it can${c.reset}`);
  console.log(`  ${c.white}SSH into other servers (agent-to-agent access, deployments, etc.).${c.reset}`);
  console.log();

  // Get the real user
  let realUser;
  try {
    realUser = execSync('logname 2>/dev/null || echo root', { encoding: 'utf-8' }).trim();
  } catch { realUser = 'root'; }
  const homeDir = realUser === 'root' ? '/root' : `/home/${realUser}`;
  const sshKeyPath = `${homeDir}/.ssh/id_ed25519`;

  // Check for existing key
  let keyExists = false;
  try { execSync(`test -f ${sshKeyPath}`, { stdio: 'pipe' }); keyExists = true; } catch { /* doesn't exist */ }

  if (keyExists) {
    console.log(`  ${c.yellow}An SSH key already exists at ${sshKeyPath}${c.reset}`);
    const existingKey = execSync(`cat ${sshKeyPath}.pub`, { encoding: 'utf-8' }).trim();
    console.log(`  ${c.dim}${existingKey}${c.reset}`);
    console.log();
    const regen = await ask(rl, `  ${c.yellow}Generate a new key? This will ${c.bold}overwrite${c.reset}${c.yellow} the existing one. (y/n): ${c.reset}`);
    if (regen.toLowerCase() !== 'y') {
      // Show existing key with copy instructions
      printServerKeyInstructions(existingKey, realUser);
      await ask(rl, `\n  ${c.dim}Press Enter to continue...${c.reset}`);
      return;
    }
  }

  // Optional comment for the key
  let hostname = 'server';
  try { hostname = execSync('hostname', { encoding: 'utf-8' }).trim(); } catch { /* */ }
  const defaultComment = `${realUser}@${hostname}`;
  const comment = await ask(rl, `  ${c.cyan}Key comment (default: ${defaultComment}): ${c.reset}`);
  const keyComment = comment || defaultComment;

  console.log(`\n  ${c.cyan}Generating Ed25519 SSH key...${c.reset}`);
  try {
    execSync(`mkdir -p ${homeDir}/.ssh`, { stdio: 'pipe' });
    execSync(`ssh-keygen -t ed25519 -C "${keyComment}" -f ${sshKeyPath} -N ""`, { stdio: 'pipe' });
    if (realUser !== 'root') {
      execSync(`chown ${realUser}:${realUser} ${sshKeyPath} ${sshKeyPath}.pub`, { stdio: 'pipe' });
    }
    execSync(`chmod 600 ${sshKeyPath}`, { stdio: 'pipe' });
    console.log(`  ${icon.check} ${c.green}SSH key generated at ${sshKeyPath}${c.reset}`);

    const pubKey = execSync(`cat ${sshKeyPath}.pub`, { encoding: 'utf-8' }).trim();
    printServerKeyInstructions(pubKey, realUser);
  } catch (err) {
    console.log(`  ${icon.x} ${c.red}Failed to generate SSH key: ${err.message}${c.reset}`);
  }

  await ask(rl, `\n  ${c.dim}Press Enter to continue...${c.reset}`);
}

function printServerKeyInstructions(pubKey, user) {
  console.log();
  console.log(`${c.bgGreen}${c.white}${c.bold}  ╔══════════════════════════════════════════════╗  ${c.reset}`);
  console.log(`${c.bgGreen}${c.white}${c.bold}  ║  SERVER'S PUBLIC KEY (copy this)             ║  ${c.reset}`);
  console.log(`${c.bgGreen}${c.white}${c.bold}  ╚══════════════════════════════════════════════╝  ${c.reset}`);
  console.log();
  console.log(`  ${c.cyan}${c.bold}${pubKey}${c.reset}`);
  console.log();
  console.log(`${c.yellow}${c.bold}  To let this server SSH into another server:${c.reset}`);
  console.log(`${c.white}  1. Copy the public key above${c.reset}`);
  console.log(`${c.white}  2. On the ${c.bold}target${c.reset}${c.white} server, append it to ${c.cyan}~/.ssh/authorized_keys${c.reset}`);
  console.log(`${c.white}     ${c.dim}echo 'PASTE_KEY_HERE' >> ~/.ssh/authorized_keys${c.reset}`);
  console.log(`${c.white}  3. Or use the ${c.green}"Add SSH Key"${c.reset}${c.white} tool on the target server${c.reset}`);
  console.log();
  console.log(`${c.dim}  Test with: ssh ${user}@<target-server-ip>${c.reset}`);
  console.log();
}

// ── OpenClaw post-install setup (idempotent — safe to re-run) ──
async function setupOpenClaw(rl) {
  console.log();
  console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}   🤖 OpenClaw Gateway Setup                    ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
  console.log();

  // Get the real user (not root)
  let realUser;
  try {
    realUser = execSync('logname 2>/dev/null || echo root', { encoding: 'utf-8' }).trim();
  } catch { realUser = 'root'; }
  const homeDir = realUser === 'root' ? '/root' : `/home/${realUser}`;

  const installerDir = path.dirname(fileURLToPath(import.meta.url));
  const portalSrc = path.join(installerDir, 'openclaw-portal');
  const portalDest = '/opt/openclaw-portal';

  // ── Helper: check if a step is already done ───
  function fileExists(p) { try { execSync(`test -f ${p}`, { stdio: 'pipe' }); return true; } catch { return false; } }
  function dirExists(p) { try { execSync(`test -d ${p}`, { stdio: 'pipe' }); return true; } catch { return false; } }

  const portalDeployed = dirExists(portalDest) && fileExists(`${portalDest}/server.mjs`);
  const depsInstalled = dirExists(`${portalDest}/node_modules`);
  const envExists = fileExists(`${portalDest}/.env`);
  const portalCtlExists = fileExists('/usr/local/bin/portal-ctl');
  const openclawInstalled = isInstalled('openclaw');
  const gatewayServiceExists = fileExists('/etc/systemd/system/openclaw-gateway.service');

  // Show recovery status if re-running
  if (portalDeployed || openclawInstalled) {
    console.log(`  ${c.yellow}${c.bold}Recovery mode — checking what still needs setup:${c.reset}`);
    console.log(`  ${portalDeployed ? icon.check + c.green : icon.x + c.red}Portal files${c.reset}`);
    console.log(`  ${depsInstalled ? icon.check + c.green : icon.x + c.red}npm dependencies${c.reset}`);
    console.log(`  ${envExists ? icon.check + c.green : icon.x + c.red}.env config${c.reset}`);
    console.log(`  ${portalCtlExists ? icon.check + c.green : icon.x + c.red}portal-ctl script${c.reset}`);
    console.log(`  ${openclawInstalled ? icon.check + c.green : icon.x + c.red}OpenClaw binary${c.reset}`);
    console.log(`  ${gatewayServiceExists ? icon.check + c.green : icon.x + c.red}Gateway systemd service${c.reset}`);
    console.log();
  }

  // ── 1. Domain setup ──────────────────────────
  let domain = null;
  let existingDomain = null;
  try {
    const sites = execSync('ls /etc/nginx/sites-available/ 2>/dev/null', { encoding: 'utf-8' }).trim();
    const candidates = sites.split('\n').filter(s => s !== 'default' && s.length > 0);
    if (candidates.length > 0) existingDomain = candidates[0];
  } catch { /* no nginx or no sites */ }

  if (existingDomain) {
    console.log(`  ${icon.check} ${c.green}Domain already configured: ${c.bold}${existingDomain}${c.reset}`);
    const reconfigure = await ask(rl, `  ${c.cyan}Reconfigure domain? (y/n): ${c.reset}`);
    if (reconfigure.toLowerCase() === 'y') {
      domain = await setupOpenClawDomain(rl);
    } else {
      domain = existingDomain;
    }
  } else {
    domain = await setupOpenClawDomain(rl);
  }

  // ── 2. PostgreSQL ─────────────────────────────
  if (!isInstalled('postgresql')) {
    console.log(`\n  ${c.cyan}PostgreSQL is required for the portal. Installing...${c.reset}`);
    installPackage('postgresql');
  }
  try {
    execSync('systemctl enable postgresql && systemctl start postgresql', { stdio: 'pipe' });
    console.log(`  ${icon.check} ${c.green}PostgreSQL running${c.reset}`);
  } catch { /* continue */ }

  // ── 3. Deploy portal files ────────────────────
  if (!portalDeployed) {
    console.log();
    console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
    console.log(`${c.bgMagenta}${c.white}${c.bold}   🔐 OpenClaw Portal Setup                     ${c.reset}`);
    console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
    console.log();
    console.log(`  ${c.cyan}Deploying portal to ${portalDest}...${c.reset}`);
    try {
      execSync(`rm -rf ${portalDest} && cp -r ${portalSrc} ${portalDest}`, { stdio: 'pipe' });
      console.log(`  ${icon.check} ${c.green}Portal files deployed${c.reset}`);
    } catch (err) {
      console.log(`  ${icon.x} ${c.red}Failed to copy portal files: ${err.message}${c.reset}`);
      return;
    }
  } else {
    console.log(`  ${icon.check} ${c.green}Portal files already deployed${c.reset}`);
  }

  // ── 4. npm dependencies ───────────────────────
  if (!depsInstalled) {
    console.log(`  ${c.cyan}Installing portal dependencies...${c.reset}`);
    try {
      execSync(`cd ${portalDest} && npm install --omit=dev`, NO_STDIN);
      console.log(`  ${icon.check} ${c.green}Dependencies installed${c.reset}`);
    } catch {
      console.log(`  ${icon.x} ${c.red}npm install failed. Run manually: cd ${portalDest} && npm install${c.reset}`);
    }
  } else {
    console.log(`  ${icon.check} ${c.green}Dependencies already installed${c.reset}`);
  }

  // ── 5. .env config ───────────────────────────
  if (!envExists) {
    let sessionSecret = 'change-me';
    try { sessionSecret = execSync('openssl rand -hex 32', { encoding: 'utf-8' }).trim(); } catch { /* use default */ }
    const envLines = [
      'PORTAL_PORT=3000',
      'OPENCLAW_PORT=18789',
      `SESSION_SECRET=${sessionSecret}`,
      'NODE_ENV=production',
      'DATABASE_URL=postgresql://openclaw_portal:openclaw_portal@localhost:5432/openclaw_portal',
    ];
    try {
      execSync(`printf '%s\\n' ${envLines.map(l => `'${l}'`).join(' ')} > ${portalDest}/.env`, { stdio: 'pipe' });
      execSync(`chmod 600 ${portalDest}/.env`, { stdio: 'pipe' });
      console.log(`  ${icon.check} ${c.green}Environment configured (.env)${c.reset}`);
    } catch { /* non-critical */ }
  } else {
    console.log(`  ${icon.check} ${c.green}.env already configured${c.reset}`);
  }

  // ── 6. Database & admin account ───────────────
  let dbReady = false;
  try {
    const dbCheck = execSync(`sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='openclaw_portal'"`, { encoding: 'utf-8' }).trim();
    dbReady = dbCheck === '1';
  } catch { /* not ready */ }

  if (!dbReady) {
    console.log();
    console.log(`  ${c.yellow}${c.bold}Create your admin account for the OpenClaw Portal:${c.reset}`);
    const adminUser = await ask(rl, `  ${c.cyan}Admin username: ${c.reset}`);
    const adminPass = await ask(rl, `  ${c.cyan}Admin password: ${c.reset}`);

    if (adminUser && adminPass) {
      console.log(`\n  ${c.cyan}Setting up database & admin account...${c.reset}`);
      try {
        execSync(`cd ${portalDest} && ADMIN_USER="${adminUser}" ADMIN_PASS="${adminPass}" node db/setup.mjs`, NO_STDIN);
        console.log(`  ${icon.check} ${c.green}Database configured & admin account created${c.reset}`);
      } catch {
        console.log(`  ${icon.x} ${c.red}Database setup failed. Run manually: cd ${portalDest} && node db/setup.mjs${c.reset}`);
      }
    } else {
      console.log(`  ${c.yellow}Skipped — run manually later: cd ${portalDest} && node db/setup.mjs${c.reset}`);
    }
  } else {
    console.log(`  ${icon.check} ${c.green}Database already configured${c.reset}`);
  }

  // ── 7. portal-ctl management script ───────────
  if (!portalCtlExists) {
    try {
      execSync(`cp ${portalDest}/portal-ctl.sh /usr/local/bin/portal-ctl && chmod +x /usr/local/bin/portal-ctl`, { stdio: 'pipe' });
      console.log(`  ${icon.check} ${c.green}Management script installed: /usr/local/bin/portal-ctl${c.reset}`);
    } catch {
      console.log(`  ${icon.x} ${c.red}Failed to install portal-ctl to /usr/local/bin/${c.reset}`);
    }
  } else {
    console.log(`  ${icon.check} ${c.green}portal-ctl already installed${c.reset}`);
  }

  // ── 8. Cron health-check ──────────────────────
  try {
    let existingCron = '';
    try { existingCron = execSync('crontab -l 2>/dev/null', { encoding: 'utf-8' }); } catch { /* empty crontab */ }
    if (!existingCron.includes('portal-ctl health')) {
      const newCron = existingCron.trimEnd() + '\n0 * * * * /usr/local/bin/portal-ctl health\n';
      execSync(`echo '${newCron.replace(/'/g, "'\\''") }' | crontab -`, { stdio: 'pipe' });
      console.log(`  ${icon.check} ${c.green}Hourly health-check cron job installed${c.reset}`);
    } else {
      console.log(`  ${icon.check} ${c.green}Cron job already exists${c.reset}`);
    }
  } catch (err) {
    console.log(`  ${icon.x} ${c.red}Failed to install cron job. Add manually:${c.reset}`);
    console.log(`  ${c.white}  (crontab -l; echo "0 * * * * /usr/local/bin/portal-ctl health") | crontab -${c.reset}`);
  }

  // ── 9. Aliases ────────────────────────────────
  const aliasBlock = [
    '',
    '# OpenClaw Portal aliases',
    "alias portal-start='sudo portal-ctl start'",
    "alias portal-stop='sudo portal-ctl stop'",
    "alias portal-status='sudo portal-ctl status'",
    "alias openclaw-stop='sudo systemctl stop openclaw-gateway 2>/dev/null; sudo kill \$(lsof -ti:18789) 2>/dev/null; sudo kill \$(lsof -ti:3000) 2>/dev/null; echo \"OpenClaw stopped\"'",
    "alias openclaw-restart='sudo systemctl stop openclaw-gateway 2>/dev/null; sudo kill \$(lsof -ti:18789) 2>/dev/null; sudo kill \$(lsof -ti:3000) 2>/dev/null; sleep 1; sudo systemctl start openclaw-gateway; sleep 2; sudo portal-ctl start; echo \"OpenClaw restarted\"'",
    '',
  ].join('\n');
  const bashrcPaths = [`${homeDir}/.bashrc`, '/root/.bashrc'];
  for (const rc of bashrcPaths) {
    try {
      if (!existsSync(rc)) continue;
      const existing = readFileSync(rc, 'utf-8');
      if (!existing.includes('portal-start')) {
        appendFileSync(rc, aliasBlock);
      }
    } catch { /* non-critical */ }
  }
  console.log(`  ${icon.check} ${c.green}Aliases added to .bashrc (source ~/.bashrc or re-login to activate)${c.reset}`);

  // ── 10. Start portal ──────────────────────────
  try {
    execSync('/usr/local/bin/portal-ctl start', { stdio: 'pipe' });
    console.log(`  ${icon.check} ${c.green}Portal started on port 3000${c.reset}`);
  } catch {
    console.log(`  ${icon.x} ${c.red}Failed to start portal. Try: portal-start${c.reset}`);
  }

  if (domain) {
    console.log(`\n  ${c.dim}Traffic: User → ${domain} (443) → Portal (3000) → OpenClaw (18789)${c.reset}`);
  } else {
    openPorts(['3000/tcp']);
    console.log(`\n  ${c.dim}Traffic: User → :3000 (Portal + Auth) → OpenClaw (18789)${c.reset}`);
  }

  // Summary
  console.log();
  console.log(`${c.bgMagenta}${c.white}${c.bold}  ╔══════════════════════════════════════════════╗  ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}  ║  Portal Management Commands                  ║  ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}  ╚══════════════════════════════════════════════╝  ${c.reset}`);
  console.log();
  console.log(`  ${c.cyan}${c.bold}portal-start${c.reset}       Start portal & enable auto-restart`);
  console.log(`  ${c.cyan}${c.bold}portal-stop${c.reset}        Stop portal & disable auto-restart`);
  console.log(`  ${c.cyan}${c.bold}portal-status${c.reset}      Check portal & auto-restart status`);
  console.log(`  ${c.cyan}${c.bold}openclaw-restart${c.reset}   Restart gateway + portal together`);
  console.log(`  ${c.cyan}${c.bold}openclaw-stop${c.reset}      Stop gateway + portal together`);
  console.log();
  console.log(`  ${c.dim}A cron job runs every hour to check if the portal is alive.${c.reset}`);
  console.log(`  ${c.dim}Using portal-stop disables auto-restart until portal-start is used.${c.reset}`);
  console.log(`  ${c.dim}Logs: /var/log/openclaw-portal.log${c.reset}`);

  // ── 11. Install OpenClaw binary (last — may take a while) ──
  if (!openclawInstalled) {
    console.log();
    console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
    console.log(`${c.bgMagenta}${c.white}${c.bold}   📦 Installing OpenClaw Gateway                ${c.reset}`);
    console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
    console.log();

    // Install psmisc (provides fuser) + lsof — needed by OpenClaw's --force flag
    try {
      execSync('apt install -y psmisc lsof', NO_STDIN);
    } catch { /* non-critical */ }

    // Ensure swap exists — OpenClaw npm install needs ~1GB and gets OOM-killed on small VPS
    let hasSwap = false;
    try { hasSwap = execSync('swapon --show 2>/dev/null', { encoding: 'utf-8' }).trim().length > 0; } catch { /* no swap */ }
    if (!hasSwap) {
      console.log(`  ${c.yellow}No swap detected. Creating 1GB swap to prevent out-of-memory during install...${c.reset}`);
      try {
        execSync('fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile', { stdio: 'pipe' });
        console.log(`  ${icon.check} ${c.green}1GB swap enabled${c.reset}`);
      } catch {
        console.log(`  ${c.yellow}Could not create swap — continuing anyway (install may fail on low-RAM servers)${c.reset}`);
      }
    }

    console.log(`  ${c.yellow}${c.bold}Installing OpenClaw — this includes model selection + API key setup.${c.reset}`);
    console.log(`  ${c.yellow}Follow the prompts from the OpenClaw installer below.${c.reset}`);
    console.log();

    // Pause our readline so the install script's configure wizard can use stdin.
    // The install script runs `openclaw configure` which needs interactive input
    // for model selection and device auth (e.g. GitHub Copilot code flow).
    rl.pause();
    try {
      execSync('curl -fsSL https://openclaw.ai/install.sh | bash', { stdio: 'inherit' });
      console.log(`\n  ${icon.check} ${c.green}OpenClaw gateway installed${c.reset}`);
    } catch {
      console.log(`\n  ${icon.x} ${c.red}OpenClaw gateway installation failed.${c.reset}`);
      console.log(`  ${c.yellow}Re-run the OpenClaw option from the menu to retry.${c.reset}`);
      console.log(`  ${c.dim}Or manually: curl -fsSL https://openclaw.ai/install.sh | bash${c.reset}`);
    }
    rl.resume();
  } else {
    console.log(`\n  ${icon.check} ${c.green}OpenClaw gateway already installed${c.reset}`);
  }

  // ── 12. Post-install: overlay gateway settings + start services ──
  // We do NOT touch any config until the install script is 100% done.
  // The install script handles model selection, device auth, and writes its own
  // config. We only overlay the gateway architecture settings we need (port,
  // bind, trustedProxies, controlUi) and set up systemd + portal token.
  const clawDir = `${homeDir}/.openclaw`;
  const clawCfg = `${clawDir}/openclaw.json`;

  if (isInstalled('openclaw')) {
    // Ensure directory structure exists
    try {
      execSync(`sudo -u ${realUser} mkdir -p ${clawDir}/workspace ${clawDir}/agents/main/agent ${clawDir}/agents/main/sessions`, { stdio: 'pipe' });
    } catch { /* non-critical */ }

    // ── 12a. Overlay gateway settings onto config the install script created ──
    let gatewayToken = '';
    if (fileExists(clawCfg)) {
      try {
        const raw = execSync(`cat ${clawCfg}`, { encoding: 'utf-8' });
        const cfg = JSON.parse(raw);

        if (!cfg.gateway) cfg.gateway = {};
        cfg.gateway.mode = 'local';
        cfg.gateway.port = 18789;
        cfg.gateway.bind = 'loopback';

        // Generate auth token if the install script didn't create one
        if (!cfg.gateway.auth) cfg.gateway.auth = {};
        if (!cfg.gateway.auth.token) {
          try { cfg.gateway.auth.token = execSync('openssl rand -hex 24', { encoding: 'utf-8' }).trim(); } catch {
            cfg.gateway.auth.token = [...Array(48)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
          }
        }
        gatewayToken = cfg.gateway.auth.token;

        // Trusted proxies — portal proxies from localhost
        if (!cfg.gateway.trustedProxies) cfg.gateway.trustedProxies = [];
        if (!cfg.gateway.trustedProxies.includes('127.0.0.1')) cfg.gateway.trustedProxies.push('127.0.0.1');

        // Disable browser device-identity checks — our portal handles auth
        if (!cfg.gateway.controlUi) cfg.gateway.controlUi = {};
        cfg.gateway.controlUi.dangerouslyDisableDeviceAuth = true;

        // Add domain origins
        if (domain) {
          if (!cfg.gateway.controlUi.allowedOrigins) cfg.gateway.controlUi.allowedOrigins = [];
          for (const o of [`https://${domain}`, `https://www.${domain}`]) {
            if (!cfg.gateway.controlUi.allowedOrigins.includes(o)) cfg.gateway.controlUi.allowedOrigins.push(o);
          }
        }

        execSync(`echo '${JSON.stringify(cfg, null, 2).replace(/'/g, "'\\''")}' > ${clawCfg}`, { stdio: 'pipe' });
        execSync(`chown ${realUser}:${realUser} ${clawCfg}`, { stdio: 'pipe' });
        console.log(`  ${icon.check} ${c.green}Gateway config ready (token: ${gatewayToken.slice(0, 8)}...)${c.reset}`);
      } catch (err) {
        console.log(`  ${icon.x} ${c.red}Config overlay failed: ${err.message}${c.reset}`);
      }
    } else {
      console.log(`  ${c.yellow}No openclaw config found — run ${c.bold}openclaw configure${c.reset}${c.yellow} to set up${c.reset}`);
    }

    // ── 12b. Create systemd service + start gateway ──
    let serviceExists = false;
    try { serviceExists = fileExists('/etc/systemd/system/openclaw-gateway.service'); } catch { /* nope */ }

    if (!serviceExists) {
      try { execSync(`sudo -u ${realUser} openclaw doctor --fix 2>/dev/null`, { stdio: 'pipe' }); } catch { /* ignore */ }

      let openclawBin = '';
      try { openclawBin = execSync('which openclaw', { encoding: 'utf-8' }).trim(); } catch { /* not found */ }

      if (openclawBin) {
        let systemPath = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
        try { systemPath = execSync('echo $PATH', { encoding: 'utf-8' }).trim(); } catch { /* use default */ }

        const serviceContent = [
          '[Unit]',
          'Description=OpenClaw Gateway',
          'After=network.target postgresql.service',
          'Wants=network.target',
          '',
          '[Service]',
          'Type=simple',
          `User=${realUser}`,
          `Group=${realUser}`,
          `WorkingDirectory=${homeDir}`,
          `ExecStart=${openclawBin} gateway --port 18789`,
          'Restart=on-failure',
          'RestartSec=5',
          `Environment=HOME=${homeDir}`,
          'Environment=NODE_ENV=production',
          `Environment=PATH=${systemPath}`,
          '',
          '[Install]',
          'WantedBy=multi-user.target',
          '',
        ].join('\n');

        try {
          writeFileSync('/etc/systemd/system/openclaw-gateway.service', serviceContent);
          execSync('systemctl daemon-reload', { stdio: 'pipe' });
          execSync('systemctl enable openclaw-gateway', { stdio: 'pipe' });
          execSync('systemctl start openclaw-gateway', { stdio: 'pipe' });
        } catch (err) {
          console.log(`  ${icon.x} ${c.red}Failed to create systemd service: ${err.message}${c.reset}`);
          console.log(`  ${c.dim}Start manually: openclaw gateway --port 18789${c.reset}`);
        }

        // Verify gateway stays running
        try {
          execSync('sleep 3', { stdio: 'pipe' });
          const gwCheck = execSync('systemctl is-active openclaw-gateway 2>/dev/null || echo stopped', { encoding: 'utf-8' }).trim();
          if (gwCheck === 'active') {
            console.log(`  ${icon.check} ${c.green}OpenClaw gateway systemd service created & started${c.reset}`);
          } else {
            console.log(`  ${icon.x} ${c.yellow}Gateway started but crashed. Checking logs...${c.reset}`);
            try {
              const journal = execSync('journalctl -u openclaw-gateway --no-pager -n 12 2>/dev/null || true', { encoding: 'utf-8' }).trim();
              if (journal) console.log(`  ${c.dim}${journal}${c.reset}`);
            } catch { /* ignore */ }
          }
        } catch { /* verification non-critical */ }
      }
    } else {
      try {
        execSync('systemctl restart openclaw-gateway', { stdio: 'pipe' });
        console.log(`  ${icon.check} ${c.green}OpenClaw gateway service restarted${c.reset}`);
      } catch { /* non-critical */ }
    }

    // ── 12c. Save token to portal .env + restart portal (LAST THING) ──
    // Token is saved only after gateway is running so nothing interferes
    if (gatewayToken && fileExists(`${portalDest}/.env`)) {
      // Re-read token in case gateway changed it on start
      try {
        const raw = execSync(`cat ${clawCfg}`, { encoding: 'utf-8' });
        const cfg = JSON.parse(raw);
        if (cfg.gateway?.auth?.token) gatewayToken = cfg.gateway.auth.token;
      } catch { /* use what we have */ }

      try {
        let envContent = readFileSync(`${portalDest}/.env`, 'utf-8');
        if (envContent.includes('OPENCLAW_TOKEN=')) {
          envContent = envContent.replace(/^OPENCLAW_TOKEN=.*$/m, `OPENCLAW_TOKEN=${gatewayToken}`);
        } else {
          envContent += `\nOPENCLAW_TOKEN=${gatewayToken}\n`;
        }
        writeFileSync(`${portalDest}/.env`, envContent);
        console.log(`  ${icon.check} ${c.green}Gateway token saved to portal .env${c.reset}`);
      } catch { /* non-critical */ }
    }

    // Final portal restart — portal needs the token in .env before starting
    try {
      execSync('kill $(lsof -ti:3000) 2>/dev/null || true', { stdio: 'pipe' });
      execSync('sleep 1', { stdio: 'pipe' });
      execSync('/usr/local/bin/portal-ctl start', { stdio: 'pipe' });
      console.log(`  ${icon.check} ${c.green}Portal restarted (connected to gateway)${c.reset}`);
    } catch { /* portal-ctl may not exist yet on first run */ }
  }

  console.log();
  if (domain) {
    console.log(`  ${icon.rocket} ${c.green}${c.bold}Setup Complete! Your portal is at: https://${domain}${c.reset}`);
  } else {
    console.log(`  ${icon.rocket} ${c.green}${c.bold}OpenClaw Portal: http://your_server_ip:3000${c.reset}`);
  }
  console.log(`\n  ${c.dim}Tip: Run ${c.bold}source ~/.bashrc${c.reset}${c.dim} or log out and back in to use aliases (openclaw-restart, portal-status, etc.)${c.reset}`);
  console.log();
}

// ── Web directory setup ─────────────────────────
function createWebDirectory(domain) {
  const basePath = `/var/www/${domain}`;
  const publicPath = `${basePath}/public_html`;
  try {
    execSync(`mkdir -p ${publicPath}`, { stdio: 'pipe' });
    // Create a starter .env file for environment variables
    execSync(`test -f ${basePath}/.env || echo '# Environment variables for ${domain}\\n# This file is OUTSIDE public_html — not web-accessible\\n# Usage: store API keys, DB credentials, secrets here\\n' > ${basePath}/.env`, { stdio: 'pipe' });
    // Set restrictive permissions on .env
    execSync(`chmod 600 ${basePath}/.env`, { stdio: 'pipe' });
    // Detect the real user for ownership
    let realUser = 'www-data';
    try {
      realUser = execSync('logname 2>/dev/null', { encoding: 'utf-8' }).trim();
    } catch { /* default to www-data */ }
    execSync(`chown -R ${realUser}:${realUser} ${basePath}`, { stdio: 'pipe' });
    console.log(`  ${icon.check} ${c.green}Web directory created: ${basePath}/${c.reset}`);
    console.log(`  ${c.dim}    ├── public_html/   (web root — publicly served files)${c.reset}`);
    console.log(`  ${c.dim}    └── .env           (environment variables — not web-accessible)${c.reset}`);
    return true;
  } catch (err) {
    console.log(`  ${icon.x} ${c.red}Failed to create web directory: ${err.message}${c.reset}`);
    return false;
  }
}

// ── Web server config generators ────────────────
function createNginxConfig(domain) {
  createWebDirectory(domain);
  const config = [
    `# OpenClaw reverse proxy — ${domain}`,
    'server {',
    '    listen 80;',
    `    server_name ${domain} www.${domain};`,
    '',
    `    root /var/www/${domain}/public_html;`,
    '    index index.html;',
    '',
    '    location / {',
    '        proxy_pass http://127.0.0.1:3000;',
    '        proxy_http_version 1.1;',
    '        proxy_set_header Upgrade $http_upgrade;',
    '        proxy_set_header Connection "upgrade";',
    '        proxy_set_header Host $host;',
    '        proxy_set_header X-Real-IP $remote_addr;',
    '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '        proxy_set_header X-Forwarded-Proto $scheme;',
    '        proxy_read_timeout 86400;',
    '    }',
    '',
    '    # Block access to .env and dotfiles',
    '    location ~ /\\. {',
    '        deny all;',
    '    }',
    '}',
  ].join('\n');
  const confPath = `/etc/nginx/sites-available/${domain}`;
  const linkPath = `/etc/nginx/sites-enabled/${domain}`;
  try {
    execSync(`echo '${config.replace(/'/g, "'\\''")}' > ${confPath}`, { stdio: 'pipe' });
    execSync(`ln -sf ${confPath} ${linkPath}`, { stdio: 'pipe' });
    execSync('nginx -t', { stdio: 'pipe' });
    execSync('systemctl reload nginx', { stdio: 'pipe' });
    console.log(`  ${icon.check} ${c.green}Nginx config created: ${confPath}${c.reset}`);
    console.log(`  ${icon.check} ${c.green}Nginx reloaded successfully.${c.reset}`);
  } catch (err) {
    console.log(`  ${icon.x} ${c.red}Failed to configure Nginx: ${err.message}${c.reset}`);
    console.log(`  ${c.dim}Config written to ${confPath} — check with: nginx -t${c.reset}`);
  }
}

function createApacheConfig(domain) {
  createWebDirectory(domain);
  const config = [
    `# OpenClaw reverse proxy — ${domain}`,
    '<VirtualHost *:80>',
    `    ServerName ${domain}`,
    `    ServerAlias www.${domain}`,
    '',
    `    DocumentRoot /var/www/${domain}/public_html`,
    '',
    '    ProxyPreserveHost On',
    '    ProxyPass / http://127.0.0.1:3000/',
    '    ProxyPassReverse / http://127.0.0.1:3000/',
    '',
    '    RequestHeader set X-Forwarded-Proto "http"',
    '',
    '    # WebSocket support for OpenClaw dashboard',
    '    RewriteEngine On',
    '    RewriteCond %{HTTP:Upgrade} websocket [NC]',
    '    RewriteCond %{HTTP:Connection} upgrade [NC]',
    '    RewriteRule ^/?(.*) ws://127.0.0.1:3000/$1 [P,L]',
    '',
    '    # Block access to .env and dotfiles',
    '    <Directory /var/www/${domain}>',
    '        <FilesMatch "^\\.">',
    '            Require all denied',
    '        </FilesMatch>',
    '    </Directory>',
    '',
    `    ErrorLog \${APACHE_LOG_DIR}/${domain}-error.log`,
    `    CustomLog \${APACHE_LOG_DIR}/${domain}-access.log combined`,
    '</VirtualHost>',
  ].join('\n');
  const confPath = `/etc/apache2/sites-available/${domain}.conf`;
  try {
    execSync(`echo '${config.replace(/'/g, "'\\''")}' > ${confPath}`, { stdio: 'pipe' });
    execSync('a2enmod proxy proxy_http proxy_wstunnel headers rewrite', { stdio: 'pipe' });
    execSync(`a2ensite ${domain}.conf`, { stdio: 'pipe' });
    execSync('systemctl reload apache2', { stdio: 'pipe' });
    console.log(`  ${icon.check} ${c.green}Apache config created: ${confPath}${c.reset}`);
    console.log(`  ${icon.check} ${c.green}Apache modules enabled & reloaded.${c.reset}`);
  } catch (err) {
    console.log(`  ${icon.x} ${c.red}Failed to configure Apache: ${err.message}${c.reset}`);
    console.log(`  ${c.dim}Config written to ${confPath}${c.reset}`);
  }
}

function createCaddyConfig(domain) {
  createWebDirectory(domain);
  const block = `\\n${domain} {\\n    root * /var/www/${domain}/public_html\\n    reverse_proxy 127.0.0.1:3000\\n    @dotfiles path */.*\\n    respond @dotfiles 403\\n}\\n`;
  try {
    execSync(`echo '${block}' >> /etc/caddy/Caddyfile`, { stdio: 'pipe' });
    execSync('systemctl reload caddy', { stdio: 'pipe' });
    console.log(`  ${icon.check} ${c.green}Caddy config appended to /etc/caddy/Caddyfile${c.reset}`);
    console.log(`  ${c.dim}Caddy handles SSL automatically — no certbot needed.${c.reset}`);
  } catch (err) {
    console.log(`  ${icon.x} ${c.red}Failed to configure Caddy: ${err.message}${c.reset}`);
  }
}

// ── Static site config generators ───────────────
function createStaticNginxConfig(domain) {
  const config = [
    `# Static site — ${domain}`,
    'server {',
    '    listen 80;',
    `    server_name ${domain} www.${domain};`,
    '',
    `    root /var/www/${domain}/public_html;`,
    '    index index.html index.htm;',
    '',
    '    location / {',
    '        try_files $uri $uri/ =404;',
    '    }',
    '',
    '    # Block access to .env and dotfiles',
    '    location ~ /\\. {',
    '        deny all;',
    '    }',
    '}',
  ].join('\n');
  const confPath = `/etc/nginx/sites-available/${domain}`;
  const linkPath = `/etc/nginx/sites-enabled/${domain}`;
  try {
    execSync(`echo '${config.replace(/'/g, "'\\''")}' > ${confPath}`, { stdio: 'pipe' });
    execSync(`ln -sf ${confPath} ${linkPath}`, { stdio: 'pipe' });
    execSync('nginx -t', { stdio: 'pipe' });
    execSync('systemctl reload nginx', { stdio: 'pipe' });
    console.log(`  ${icon.check} ${c.green}Nginx static config created: ${confPath}${c.reset}`);
  } catch (err) {
    console.log(`  ${icon.x} ${c.red}Failed to configure Nginx: ${err.message}${c.reset}`);
    console.log(`  ${c.dim}Config written to ${confPath} — check with: nginx -t${c.reset}`);
  }
}

function createStaticApacheConfig(domain) {
  const config = [
    `# Static site — ${domain}`,
    '<VirtualHost *:80>',
    `    ServerName ${domain}`,
    `    ServerAlias www.${domain}`,
    '',
    `    DocumentRoot /var/www/${domain}/public_html`,
    '',
    `    <Directory /var/www/${domain}/public_html>`,
    '        Options -Indexes +FollowSymLinks',
    '        AllowOverride All',
    '        Require all granted',
    '    </Directory>',
    '',
    '    # Block access to .env and dotfiles',
    `    <Directory /var/www/${domain}>`,
    '        <FilesMatch "^\\.">',
    '            Require all denied',
    '        </FilesMatch>',
    '    </Directory>',
    '',
    `    ErrorLog \${APACHE_LOG_DIR}/${domain}-error.log`,
    `    CustomLog \${APACHE_LOG_DIR}/${domain}-access.log combined`,
    '</VirtualHost>',
  ].join('\n');
  const confPath = `/etc/apache2/sites-available/${domain}.conf`;
  try {
    execSync(`echo '${config.replace(/'/g, "'\\''")}' > ${confPath}`, { stdio: 'pipe' });
    execSync(`a2ensite ${domain}.conf`, { stdio: 'pipe' });
    execSync('systemctl reload apache2', { stdio: 'pipe' });
    console.log(`  ${icon.check} ${c.green}Apache static config created: ${confPath}${c.reset}`);
  } catch (err) {
    console.log(`  ${icon.x} ${c.red}Failed to configure Apache: ${err.message}${c.reset}`);
    console.log(`  ${c.dim}Config written to ${confPath}${c.reset}`);
  }
}

function createStaticCaddyConfig(domain) {
  const block = `\\n${domain} {\\n    root * /var/www/${domain}/public_html\\n    file_server\\n    @dotfiles path */.*\\n    respond @dotfiles 403\\n}\\n`;
  try {
    execSync(`echo '${block}' >> /etc/caddy/Caddyfile`, { stdio: 'pipe' });
    execSync('systemctl reload caddy', { stdio: 'pipe' });
    console.log(`  ${icon.check} ${c.green}Caddy static config appended to /etc/caddy/Caddyfile${c.reset}`);
    console.log(`  ${c.dim}Caddy handles SSL automatically — no certbot needed.${c.reset}`);
  } catch (err) {
    console.log(`  ${icon.x} ${c.red}Failed to configure Caddy: ${err.message}${c.reset}`);
  }
}

function clearScreen() {
  process.stdout.write('\x1bc');
}

function printHeader() {
  console.log(`${c.bgBlue}${c.white}${c.bold}                                                ${c.reset}`);
  console.log(`${c.bgBlue}${c.white}${c.bold}   ${icon.gear} Platform Installer                        ${c.reset}`);
  console.log(`${c.bgBlue}${c.white}${c.bold}   Linux VPS Package Manager                    ${c.reset}`);
  console.log(`${c.bgBlue}${c.white}${c.bold}                                                ${c.reset}`);
  console.log();
}

function printStatusLine(key) {
  const pkg = packages[key];
  const installed = isInstalled(key);
  const statusIcon = installed ? icon.installed : icon.notInstalled;
  const statusLabel = installed
    ? `${c.bgGreen}${c.white}${c.bold} INSTALLED ${c.reset}`
    : `${c.dim} not installed${c.reset}`;
  const nameColor = installed ? c.green + c.bold : c.white;
  return `  ${statusIcon}${nameColor}${pkg.name.padEnd(18)}${c.reset} ${statusLabel}  ${c.dim}${pkg.desc}${c.reset}`;
}

// ── Readline prompt ─────────────────────────────
function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

// ── Menu: category list ─────────────────────────
function showCategoryMenu(rl) {
  clearScreen();
  printHeader();

  // Count installed
  const totalInstalled = Object.keys(packages).filter(isInstalled).length;
  console.log(`  ${c.cyan}${totalInstalled}${c.reset} of ${Object.keys(packages).length} packages installed\n`);

  console.log(`${c.bold}${c.yellow}  PRESET STACKS${c.reset}`);
  let i = 1;
  const menuMap = {};

  for (const [key, stack] of Object.entries(stacks)) {
    const allInstalled = stack.packages.every(isInstalled);
    const someInstalled = stack.packages.some(isInstalled);
    let status = '';
    if (allInstalled) status = ` ${c.bgGreen}${c.white}${c.bold} ALL INSTALLED ${c.reset}`;
    else if (someInstalled) status = ` ${c.yellow}partial${c.reset}`;
    console.log(`  ${c.cyan}${c.bold}${i})${c.reset} ${stack.name}${status}`);
    console.log(`     ${c.dim}${stack.desc}${c.reset}`);
    menuMap[i] = { type: 'stack', key };
    i++;
  }

  console.log();
  console.log(`${c.bold}${c.yellow}  INDIVIDUAL PACKAGES${c.reset}`);

  const categories = [...new Set(Object.values(packages).map(p => p.category))];
  for (const cat of categories) {
    const catKeys = Object.keys(packages).filter(k => packages[k].category === cat);
    const installedCount = catKeys.filter(isInstalled).length;
    const catStatus = installedCount > 0 ? `${c.green}(${installedCount}/${catKeys.length} installed)${c.reset}` : `${c.dim}(0/${catKeys.length})${c.reset}`;
    console.log(`  ${c.cyan}${c.bold}${i})${c.reset} ${cat} ${catStatus}`);
    menuMap[i] = { type: 'category', category: cat };
    i++;
  }

  // ── Tools section (contextual) ──────────────
  const hasOpenClaw = isInstalled('openclaw');
  const hasGit = isInstalled('git');
  const hasWebServer = isInstalled('nginx') || isInstalled('apache2') || isInstalled('caddy');
  // SSH tools are always available
  const showTools = hasOpenClaw || hasGit || hasWebServer || true;
  if (showTools) {
    console.log();
    console.log(`${c.bold}${c.yellow}  TOOLS${c.reset}`);
    if (hasWebServer) {
      console.log(`  ${c.cyan}${c.bold}${i})${c.reset} 🌐 Add a Website  ${c.dim}Create a new site with landing page, config & SSL${c.reset}`);
      menuMap[i] = { type: 'tool', tool: 'add-website' };
      i++;
    }
    if (hasGit) {
      console.log(`  ${c.cyan}${c.bold}${i})${c.reset} 🔑 Git & SSH Key Setup  ${c.dim}Configure Git identity & generate SSH key for GitHub${c.reset}`);
      menuMap[i] = { type: 'tool', tool: 'git-ssh' };
      i++;
    }
    console.log(`  ${c.cyan}${c.bold}${i})${c.reset} 🔐 Add SSH Key  ${c.dim}Authorize another user, agent, or developer to SSH in${c.reset}`);
    menuMap[i] = { type: 'tool', tool: 'add-ssh-key' };
    i++;
    console.log(`  ${c.cyan}${c.bold}${i})${c.reset} 🔑 Generate Server SSH Key  ${c.dim}Create a key so this server can SSH into others${c.reset}`);
    menuMap[i] = { type: 'tool', tool: 'generate-server-key' };
    i++;
    if (hasOpenClaw) {
      console.log(`  ${c.cyan}${c.bold}${i})${c.reset} � Health Check & Repair  ${c.dim}Diagnose & fix OpenClaw: domain, SSL, config & more${c.reset}`);
      menuMap[i] = { type: 'tool', tool: 'repair-openclaw' };
      i++;
    }
  }

  console.log();
  console.log(`  ${c.red}${c.bold}0)${c.reset} Exit`);
  console.log();

  return menuMap;
}

// ── Menu: packages in a category ────────────────
async function showPackageMenu(rl, category, pkgKeys) {
  clearScreen();
  printHeader();
  console.log(`${c.bold}${c.yellow}  ${category}${c.reset}\n`);

  const menuMap = {};
  let i = 1;
  for (const key of pkgKeys) {
    console.log(`  ${c.cyan}${c.bold}${i})${c.reset}${printStatusLine(key)}`);
    menuMap[i] = key;
    i++;
  }

  console.log();
  console.log(`  ${c.dim}${icon.back}${c.bold}0)${c.reset} Back to main menu`);
  console.log();

  const choice = await ask(rl, `${c.bold}  Select a package number: ${c.reset}`);
  const num = parseInt(choice);

  if (num === 0 || isNaN(num) || !menuMap[num]) return;

  const key = menuMap[num];
  const pkg = packages[key];
  const installed = isInstalled(key);

  console.log();
  if (installed) {
    const confirm = await ask(rl, `  ${c.yellow}${pkg.name} is already installed. Remove it? (y/n): ${c.reset}`);
    if (confirm.toLowerCase() === 'y') {
      const ok = runApt('remove', pkg.apt);
      console.log(ok
        ? `\n  ${icon.check} ${c.green}${pkg.name} removed successfully.${c.reset}`
        : `\n  ${icon.x} ${c.red}Failed to remove ${pkg.name}.${c.reset}`);
    }
  } else {
    if (pkg.ports && pkg.ports.length > 0) {
      console.log(`  ${c.yellow}⚡ This will also open firewall port(s): ${pkg.ports.join(', ')}${c.reset}`);
    }
    const confirm = await ask(rl, `  ${c.cyan}Install ${pkg.name}? (y/n): ${c.reset}`);
    if (confirm.toLowerCase() === 'y') {
      const ok = installPackage(key);
      console.log(ok
        ? `\n  ${icon.check} ${c.green}${pkg.name} installed successfully.${c.reset}`
        : `\n  ${icon.x} ${c.red}Failed to install ${pkg.name}.${c.reset}`);
      // Run post-install if defined
      if (ok && pkg.customInstall && customInstalls[key]?.postInstall) {
        await customInstalls[key].postInstall(rl);
      }
    }
  }

  await ask(rl, `\n  ${c.dim}Press Enter to continue...${c.reset}`);
}

// ── Menu: stack installer ───────────────────────
async function showStackMenu(rl, stackKey) {
  const stack = stacks[stackKey];
  clearScreen();
  printHeader();
  console.log(`${c.bold}${c.magenta}  ${stack.name}${c.reset}`);
  console.log(`  ${c.dim}${stack.desc}${c.reset}\n`);

  for (const key of stack.packages) {
    console.log(printStatusLine(key));
  }

  const allInstalled = stack.packages.every(isInstalled);
  console.log();

  if (allInstalled) {
    console.log(`  ${icon.check} ${c.green}${c.bold}All packages in this stack are already installed!${c.reset}\n`);
    const removeChoice = await ask(rl, `  ${c.red}Remove all packages in this stack? (y/n): ${c.reset}`);
    if (removeChoice.toLowerCase() === 'y') {
      for (const key of stack.packages) {
        if (isInstalled(key)) {
          runApt('remove', packages[key].apt);
        }
      }
      console.log(`\n  ${icon.check} ${c.green}Stack removed.${c.reset}`);
    }
  } else {
    const missing = stack.packages.filter(k => !isInstalled(k));
    console.log(`  ${c.yellow}${missing.length} package(s) to install: ${missing.map(k => packages[k].name).join(', ')}${c.reset}\n`);
    const installChoice = await ask(rl, `  ${c.cyan}Install missing packages? (y/n): ${c.reset}`);
    if (installChoice.toLowerCase() === 'y') {
      for (const key of missing) {
        installPackage(key);
      }
      console.log(`\n  ${icon.check} ${c.green}Stack installation complete.${c.reset}`);

      // Run stack post-install hook (e.g., Git SSH setup for Lance's Stack)
      if (stack.postInstall) {
        await stack.postInstall(rl);
      }

      // Run individual package post-installs
      for (const key of missing) {
        const pkg = packages[key];
        if (pkg.customInstall && customInstalls[key]?.postInstall) {
          await customInstalls[key].postInstall(rl);
        }
      }
    }
  }

  await ask(rl, `\n  ${c.dim}Press Enter to continue...${c.reset}`);
}

// ── Main loop ───────────────────────────────────
async function main() {
  // Check root
  if (process.getuid && process.getuid() !== 0) {
    console.log(`\n  ${icon.x} ${c.red}${c.bold}Please run this installer as root (sudo).${c.reset}\n`);
    process.exit(1);
  }

  // Update package lists on launch
  console.log(`\n${c.cyan}${c.bold}  Updating package lists...${c.reset}\n`);
  try { execSync('apt update', NO_STDIN); } catch { /* continue */ }

  const rl = createPrompt();

  while (true) {
    const menuMap = showCategoryMenu(rl);

    const choice = await ask(rl, `${c.bold}  Select an option: ${c.reset}`);
    const num = parseInt(choice);

    if (num === 0) {
      clearScreen();
      console.log(`\n  ${icon.rocket} ${c.green}${c.bold}Goodbye!${c.reset}\n`);
      rl.close();
      process.exit(0);
    }

    if (isNaN(num) || !menuMap[num]) continue;

    const selected = menuMap[num];

    if (selected.type === 'stack') {
      await showStackMenu(rl, selected.key);
    } else if (selected.type === 'category') {
      const catKeys = Object.keys(packages).filter(k => packages[k].category === selected.category);
      await showPackageMenu(rl, selected.category, catKeys);
    } else if (selected.type === 'tool' && selected.tool === 'git-ssh') {
      await setupGitSSH(rl);
      await ask(rl, `\n  ${c.dim}Press Enter to continue...${c.reset}`);
    } else if (selected.type === 'tool' && selected.tool === 'add-website') {
      await addWebsite(rl);
    } else if (selected.type === 'tool' && selected.tool === 'add-ssh-key') {
      await addSSHKey(rl);
    } else if (selected.type === 'tool' && selected.tool === 'generate-server-key') {
      await generateServerSSHKey(rl);
    } else if (selected.type === 'tool' && selected.tool === 'repair-openclaw') {
      await repairOpenClaw(rl);
    }
  }
}

main();
