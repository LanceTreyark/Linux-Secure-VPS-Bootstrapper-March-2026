#!/usr/bin/env node

// ──────────────────────────────────────────────
//  Platform Installer — Interactive Node.js Menu
//  Run with: sudo node installer.mjs
// ──────────────────────────────────────────────

import { execSync } from 'child_process';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import path from 'path';

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
    install: 'curl -fsSL https://openclaw.ai/install.sh | bash',
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
    desc: 'Nginx + PostgreSQL + Git + Node.js + Certbot  (+ Git SSH key setup)',
    packages: ['nginx', 'postgresql', 'git', 'nodejs', 'certbot'],
    postInstall: (rl) => setupGitSSH(rl),
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
    execSync(`apt ${action} -y ${aptName}`, { stdio: 'inherit' });
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
    execSync(custom.install, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

function openPorts(ports) {
  for (const port of ports) {
    try {
      execSync(`ufw allow ${port}`, { stdio: 'inherit' });
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

  // ── Install certbot if not present ──────────
  if (!isInstalled('certbot')) {
    console.log(`\n  ${c.cyan}Certbot is required for SSL. Installing...${c.reset}`);
    installPackage('certbot');
    if (webserver === 'nginx') {
      runApt('install', 'python3-certbot-nginx');
    } else if (webserver === 'apache2') {
      runApt('install', 'python3-certbot-apache');
    }
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

  const dnsReady = await ask(rl, `  ${c.cyan}${c.bold}Have you added the DNS records and are they propagated? (y/n): ${c.reset}`);

  if (dnsReady.toLowerCase() === 'y') {
    console.log(`\n  ${c.cyan}Running Certbot to obtain SSL certificate...${c.reset}\n`);
    try {
      if (webserver === 'nginx') {
        execSync(`certbot --nginx -d ${domain} -d www.${domain} --non-interactive --agree-tos --redirect --register-unsafely-without-email`, { stdio: 'inherit' });
      } else if (webserver === 'apache2') {
        execSync(`certbot --apache -d ${domain} -d www.${domain} --non-interactive --agree-tos --redirect --register-unsafely-without-email`, { stdio: 'inherit' });
      } else {
        console.log(`  ${c.dim}Caddy handles SSL automatically. Skipping certbot.${c.reset}`);
      }
      console.log(`\n  ${icon.check} ${c.green}${c.bold}SSL certificate obtained! ${domain} is now secured with HTTPS.${c.reset}`);
    } catch {
      console.log(`\n  ${icon.x} ${c.red}Certbot failed. You can retry later with:${c.reset}`);
      if (webserver === 'nginx') {
        console.log(`  ${c.white}  sudo certbot --nginx -d ${domain} -d www.${domain}${c.reset}`);
      } else {
        console.log(`  ${c.white}  sudo certbot --apache -d ${domain} -d www.${domain}${c.reset}`);
      }
    }
  } else {
    console.log(`\n  ${c.yellow}No problem! After DNS propagates, run certbot manually:${c.reset}`);
    if (webserver === 'nginx') {
      console.log(`  ${c.white}  sudo certbot --nginx -d ${domain} -d www.${domain}${c.reset}`);
    } else if (webserver === 'apache2') {
      console.log(`  ${c.white}  sudo certbot --apache -d ${domain} -d www.${domain}${c.reset}`);
    } else {
      console.log(`  ${c.dim}  Caddy will handle SSL automatically once DNS resolves.${c.reset}`);
    }
  }

  return domain;
}

// ── Configure domain for existing OpenClaw install ─
async function configureOpenClawDomain(rl) {
  clearScreen();
  printHeader();
  console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}   🌐 Add Domain to OpenClaw                    ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
  console.log();

  const domain = await setupOpenClawDomain(rl);
  if (!domain) {
    console.log(`\n  ${c.yellow}No domain entered. Returning to menu.${c.reset}`);
    await ask(rl, `\n  ${c.dim}Press Enter to continue...${c.reset}`);
    return;
  }

  // Close direct port 3000 since domain handles traffic via 443
  try {
    execSync('ufw delete allow 3000/tcp 2>/dev/null', { stdio: 'pipe' });
    console.log(`\n  ${icon.check} ${c.green}Closed port 3000 — traffic now routes through ${domain} (HTTPS).${c.reset}`);
  } catch { /* may not have been open */ }

  // Restart portal to pick up any env changes
  try {
    execSync('/usr/local/bin/portal-ctl start', { stdio: 'pipe' });
    console.log(`  ${icon.check} ${c.green}Portal restarted${c.reset}`);
  } catch { /* non-critical */ }

  console.log(`\n  ${c.dim}Traffic: User → ${domain} (443) → Portal (3000) → OpenClaw (18789)${c.reset}`);
  console.log(`\n  ${icon.rocket} ${c.green}${c.bold}OpenClaw is live at: https://${domain}${c.reset}`);

  await ask(rl, `\n  ${c.dim}Press Enter to continue...${c.reset}`);
}

// ── OpenClaw post-install setup ─────────────────
async function setupOpenClaw(rl) {
  console.log();
  console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}   🤖 OpenClaw Gateway Setup                    ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
  console.log();

  // ── Ask for domain ────────────────────────────
  const domain = await setupOpenClawDomain(rl);

  // ── Deploy OpenClaw Portal ────────────────────
  console.log();
  console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}   🔐 OpenClaw Portal Setup                     ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}                                                ${c.reset}`);
  console.log();

  // Get the real user (not root)
  let realUser;
  try {
    realUser = execSync('logname 2>/dev/null || echo root', { encoding: 'utf-8' }).trim();
  } catch { realUser = 'root'; }
  const homeDir = realUser === 'root' ? '/root' : `/home/${realUser}`;

  // Install PostgreSQL if not present
  if (!isInstalled('postgresql')) {
    console.log(`  ${c.cyan}PostgreSQL is required for the portal. Installing...${c.reset}`);
    installPackage('postgresql');
    try {
      execSync('systemctl enable postgresql && systemctl start postgresql', { stdio: 'pipe' });
    } catch { /* continue */ }
  }

  // Copy portal files to /opt/openclaw-portal
  const installerDir = path.dirname(fileURLToPath(import.meta.url));
  const portalSrc = path.join(installerDir, 'openclaw-portal');
  const portalDest = '/opt/openclaw-portal';

  console.log(`  ${c.cyan}Deploying portal to ${portalDest}...${c.reset}`);
  try {
    execSync(`rm -rf ${portalDest} && cp -r ${portalSrc} ${portalDest}`, { stdio: 'pipe' });
    console.log(`  ${icon.check} ${c.green}Portal files deployed${c.reset}`);
  } catch (err) {
    console.log(`  ${icon.x} ${c.red}Failed to copy portal files: ${err.message}${c.reset}`);
    return;
  }

  // Install dependencies
  console.log(`  ${c.cyan}Installing portal dependencies...${c.reset}`);
  try {
    execSync(`cd ${portalDest} && npm install --omit=dev`, { stdio: 'inherit' });
    console.log(`  ${icon.check} ${c.green}Dependencies installed${c.reset}`);
  } catch {
    console.log(`  ${icon.x} ${c.red}npm install failed. Run manually: cd ${portalDest} && npm install${c.reset}`);
  }

  // Generate .env
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

  // Prompt for admin credentials
  console.log();
  console.log(`  ${c.yellow}${c.bold}Create your admin account for the OpenClaw Portal:${c.reset}`);
  const adminUser = await ask(rl, `  ${c.cyan}Admin username: ${c.reset}`);
  const adminPass = await ask(rl, `  ${c.cyan}Admin password: ${c.reset}`);

  // Run database setup
  if (adminUser && adminPass) {
    console.log(`\n  ${c.cyan}Setting up database & admin account...${c.reset}`);
    try {
      execSync(`cd ${portalDest} && ADMIN_USER="${adminUser}" ADMIN_PASS="${adminPass}" node db/setup.mjs`, { stdio: 'inherit' });
      console.log(`  ${icon.check} ${c.green}Database configured & admin account created${c.reset}`);
    } catch {
      console.log(`  ${icon.x} ${c.red}Database setup failed. Run manually: cd ${portalDest} && node db/setup.mjs${c.reset}`);
    }
  } else {
    console.log(`  ${c.yellow}Skipped — run manually later: cd ${portalDest} && node db/setup.mjs${c.reset}`);
  }

  // Install portal-ctl management script
  try {
    execSync(`cp ${portalDest}/portal-ctl.sh /usr/local/bin/portal-ctl && chmod +x /usr/local/bin/portal-ctl`, { stdio: 'pipe' });
    console.log(`  ${icon.check} ${c.green}Management script installed: /usr/local/bin/portal-ctl${c.reset}`);
  } catch {
    console.log(`  ${icon.x} ${c.red}Failed to install portal-ctl to /usr/local/bin/${c.reset}`);
  }

  // Set up hourly cron health-check
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

  // Add aliases to user's and root's bashrc
  const aliasBlock = [
    '',
    '# OpenClaw Portal aliases',
    "alias portal-start='sudo portal-ctl start'",
    "alias portal-stop='sudo portal-ctl stop'",
    "alias portal-status='sudo portal-ctl status'",
  ].join('\n');
  const bashrcPaths = [`${homeDir}/.bashrc`, '/root/.bashrc'];
  for (const rc of bashrcPaths) {
    try {
      const existing = execSync(`cat ${rc} 2>/dev/null || echo ""`, { encoding: 'utf-8' });
      if (!existing.includes('portal-start')) {
        execSync(`echo '${aliasBlock}' >> ${rc}`, { stdio: 'pipe' });
      }
    } catch { /* non-critical */ }
  }
  console.log(`  ${icon.check} ${c.green}Aliases added: portal-start, portal-stop, portal-status${c.reset}`);

  // ── Start services ────────────────────────────
  console.log();
  const startNow = await ask(rl, `  ${c.cyan}Start OpenClaw gateway & portal now? (y/n): ${c.reset}`);
  if (startNow.toLowerCase() === 'y') {
    // Start OpenClaw gateway
    try {
      console.log(`\n  ${c.cyan}Starting OpenClaw gateway on port 18789 (internal)...${c.reset}`);
      execSync('nohup openclaw gateway --port 18789 > /var/log/openclaw.log 2>&1 &', { stdio: 'pipe' });
      console.log(`  ${icon.check} ${c.green}OpenClaw gateway started on port 18789${c.reset}`);
    } catch {
      console.log(`  ${icon.x} ${c.red}Failed to start OpenClaw gateway.${c.reset}`);
      console.log(`  ${c.white}  Start manually: openclaw gateway --port 18789${c.reset}`);
    }

    // Start portal
    try {
      execSync('/usr/local/bin/portal-ctl start', { stdio: 'pipe' });
      console.log(`  ${icon.check} ${c.green}Portal started on port 3000${c.reset}`);
    } catch {
      console.log(`  ${icon.x} ${c.red}Failed to start portal. Try: portal-start${c.reset}`);
    }

    if (domain) {
      console.log(`\n  ${c.dim}Traffic: User → ${domain} (443) → Portal (3000) → OpenClaw (18789)${c.reset}`);
      console.log(`\n  ${icon.rocket} ${c.green}${c.bold}OpenClaw is live at: https://${domain}${c.reset}`);
    } else {
      openPorts(['3000/tcp']);
      console.log(`\n  ${c.dim}Traffic: User → :3000 (Portal + Auth) → OpenClaw (18789)${c.reset}`);
      console.log(`\n  ${icon.rocket} ${c.green}${c.bold}OpenClaw Portal: http://your_server_ip:3000${c.reset}`);
    }
  } else {
    if (!domain) {
      openPorts(['3000/tcp']);
    }
    console.log(`\n  ${c.dim}Start later with: portal-start${c.reset}`);
    console.log(`  ${c.dim}Gateway: openclaw gateway --port 18789${c.reset}`);
  }

  // ── Summary ───────────────────────────────────
  console.log();
  console.log(`${c.bgMagenta}${c.white}${c.bold}  ╔══════════════════════════════════════════════╗  ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}  ║  Portal Management Commands                  ║  ${c.reset}`);
  console.log(`${c.bgMagenta}${c.white}${c.bold}  ╚══════════════════════════════════════════════╝  ${c.reset}`);
  console.log();
  console.log(`  ${c.cyan}${c.bold}portal-start${c.reset}    Start portal & enable auto-restart`);
  console.log(`  ${c.cyan}${c.bold}portal-stop${c.reset}     Stop portal & disable auto-restart`);
  console.log(`  ${c.cyan}${c.bold}portal-status${c.reset}   Check portal & auto-restart status`);
  console.log();
  console.log(`  ${c.dim}A cron job runs every hour to check if the portal is alive.${c.reset}`);
  console.log(`  ${c.dim}Using portal-stop disables auto-restart until portal-start is used.${c.reset}`);
  console.log(`  ${c.dim}Logs: /var/log/openclaw-portal.log${c.reset}`);
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
    '    ProxyPass / http://127.0.0.1:18789/',
    '    ProxyPassReverse / http://127.0.0.1:18789/',
    '',
    '    RequestHeader set X-Forwarded-Proto "http"',
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
    execSync('a2enmod proxy proxy_http headers', { stdio: 'pipe' });
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
  if (hasOpenClaw) {
    console.log();
    console.log(`${c.bold}${c.yellow}  TOOLS${c.reset}`);
    console.log(`  ${c.cyan}${c.bold}${i})${c.reset} 🌐 Configure OpenClaw Domain  ${c.dim}Add or change the domain for your OpenClaw portal${c.reset}`);
    menuMap[i] = { type: 'tool', tool: 'openclaw-domain' };
    i++;
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
  try { execSync('apt update', { stdio: 'inherit' }); } catch { /* continue */ }

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
    } else if (selected.type === 'tool' && selected.tool === 'openclaw-domain') {
      await configureOpenClawDomain(rl);
    }
  }
}

main();
