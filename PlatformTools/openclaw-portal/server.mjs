import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { createProxyMiddleware } from 'http-proxy-middleware';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Config ──────────────────────────────────────
const PORT = process.env.PORTAL_PORT || 3000;
const OPENCLAW_PORT = process.env.OPENCLAW_PORT || 18789;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const DB_URL = process.env.DATABASE_URL || 'postgresql://openclaw_portal:openclaw_portal@localhost:5432/openclaw_portal';

// ── Read OpenClaw dashboard token ───────────────
let openclawToken = process.env.OPENCLAW_TOKEN || '';
if (!openclawToken) {
  try {
    const cfgPath = path.join(process.env.HOME || '/root', '.openclaw', 'openclaw.json');
    if (existsSync(cfgPath)) {
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
      openclawToken = cfg.gateway?.auth?.token || cfg.token || cfg.api_token || cfg.dashboard_token || cfg.secret || '';
      if (!openclawToken) {
        // Try to find any string field that looks like a hex token
        for (const [, v] of Object.entries(cfg)) {
          if (typeof v === 'string' && /^[a-f0-9]{32,}$/i.test(v)) { openclawToken = v; break; }
        }
      }
    }
  } catch { /* token will remain empty */ }
}
if (openclawToken) console.log('  ✓ OpenClaw dashboard token loaded');

// ── PostgreSQL pool ─────────────────────────────
const pool = new pg.Pool({ connectionString: DB_URL });

// ── Session store ───────────────────────────────
const PgSession = connectPgSimple(session);

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Middleware ───────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  store: new PgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
}));

app.use(passport.initialize());
app.use(passport.session());

// ── Passport local strategy ─────────────────────
passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const result = await pool.query(
      'SELECT id, username, password_hash, totp_secret FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];
    if (!user) return done(null, false, { message: 'Invalid username or password.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return done(null, false, { message: 'Invalid username or password.' });

    return done(null, { id: user.id, username: user.username, totp_enabled: !!user.totp_secret });
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT id, username, totp_secret FROM users WHERE id = $1', [id]);
    const row = result.rows[0];
    if (!row) return done(null, null);
    done(null, { id: row.id, username: row.username, totp_enabled: !!row.totp_secret });
  } catch (err) {
    done(err);
  }
});

// ── Auth middleware ──────────────────────────────
function requireAuth(req, res, next) {
  if (!req.isAuthenticated()) return res.redirect('/login');
  // If user has TOTP enabled but hasn't verified it this session, force verification
  if (req.user.totp_enabled && !req.session.totp_verified) return res.redirect('/2fa/verify');
  return next();
}

// ── Helper: create TOTP instance ────────────────
function createTOTP(secret, username) {
  return new OTPAuth.TOTP({
    issuer: 'OpenClaw Portal',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

// ── Routes ──────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    if (req.user.totp_enabled && !req.session.totp_verified) return res.redirect('/2fa/verify');
    return res.redirect('/');
  }
  const error = req.session.flashError || null;
  delete req.session.flashError;
  res.render('login', { error });
});

app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.session.flashError = info?.message || 'Invalid credentials.';
      return res.redirect('/login');
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      // If TOTP is enabled, go to verification before granting access
      if (user.totp_enabled) {
        req.session.totp_verified = false;
        // If they checked "Enable Authenticator" but already have it, pre-check disable
        if (req.body.enable_2fa) req.session.want_disable_2fa = true;
        return res.redirect('/2fa/verify');
      }
      // If user opted to enable 2FA, redirect to setup instead of dashboard
      if (req.body.enable_2fa) return res.redirect('/2fa/setup');
      // No TOTP — go straight to dashboard
      res.redirect(openclawToken ? `/#token=${openclawToken}` : '/');
    });
  })(req, res, next);
});

app.post('/logout', requireAuth, (req, res) => {
  req.session.totp_verified = false;
  req.logout(() => {
    res.redirect('/login');
  });
});

// ── 2FA: Verify code (after login) ──────────────
app.get('/2fa/verify', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  if (!req.user.totp_enabled) return res.redirect('/');
  if (req.session.totp_verified) return res.redirect('/');
  const error = req.session.flashError || null;
  const wantDisable = !!req.session.want_disable_2fa;
  delete req.session.flashError;
  delete req.session.want_disable_2fa;
  res.render('totp-verify', { error, wantDisable });
});

app.post('/2fa/verify', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  const code = (req.body.code || '').replace(/\s/g, '');

  try {
    const result = await pool.query('SELECT totp_secret FROM users WHERE id = $1', [req.user.id]);
    const secret = result.rows[0]?.totp_secret;
    if (!secret) return res.redirect('/');

    const totp = createTOTP(secret, req.user.username);
    const delta = totp.validate({ token: code, window: 1 });

    if (delta !== null) {
      req.session.totp_verified = true;

      // If the user checked "disable 2FA", remove TOTP now that they proved they own it
      if (req.body.disable_2fa) {
        await pool.query('UPDATE users SET totp_secret = NULL WHERE id = $1', [req.user.id]);
        req.user.totp_enabled = false;
        req.session.totp_verified = false;
      }

      return res.redirect(openclawToken ? `/#token=${openclawToken}` : '/');
    }

    req.session.flashError = 'Invalid authenticator code. Try again.';
    res.redirect('/2fa/verify');
  } catch (err) {
    req.session.flashError = 'Verification error. Try again.';
    res.redirect('/2fa/verify');
  }
});

// ── 2FA: Setup (enable TOTP) ────────────────────
app.get('/2fa/setup', requireAuth, async (req, res) => {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: 'OpenClaw Portal',
    label: req.user.username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  const otpauthUrl = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  // Store pending secret in session until user verifies
  req.session.pendingTotpSecret = secret.base32;

  res.render('totp-setup', {
    qrDataUrl,
    secret: secret.base32,
    error: req.session.flashError || null,
    totpEnabled: req.user.totp_enabled,
  });
  delete req.session.flashError;
});

app.post('/2fa/enable', requireAuth, async (req, res) => {
  const code = (req.body.code || '').replace(/\s/g, '');
  const pendingSecret = req.session.pendingTotpSecret;

  if (!pendingSecret) {
    req.session.flashError = 'Setup expired. Please start again.';
    return res.redirect('/2fa/setup');
  }

  const totp = createTOTP(pendingSecret, req.user.username);
  const delta = totp.validate({ token: code, window: 1 });

  if (delta === null) {
    req.session.flashError = 'Invalid code. Scan the QR code again and enter a fresh code.';
    return res.redirect('/2fa/setup');
  }

  // Save the secret to the database
  await pool.query('UPDATE users SET totp_secret = $1 WHERE id = $2', [pendingSecret, req.user.id]);
  delete req.session.pendingTotpSecret;
  req.session.totp_verified = true;
  req.user.totp_enabled = true;

  res.redirect('/?2fa=enabled');
});

app.post('/2fa/disable', requireAuth, async (req, res) => {
  // Require current password to disable 2FA
  const password = req.body.password || '';
  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const hash = result.rows[0]?.password_hash;

  if (!hash || !(await bcrypt.compare(password, hash))) {
    req.session.flashError = 'Incorrect password. 2FA was not disabled.';
    return res.redirect('/2fa/setup');
  }

  await pool.query('UPDATE users SET totp_secret = NULL WHERE id = $1', [req.user.id]);
  req.user.totp_enabled = false;
  req.session.totp_verified = false;
  delete req.session.pendingTotpSecret;

  res.redirect('/?2fa=disabled');
});

// ── Proxy to OpenClaw gateway (authenticated) ───
app.use('/', requireAuth, createProxyMiddleware({
  target: `http://127.0.0.1:${OPENCLAW_PORT}`,
  changeOrigin: true,
  ws: true,
  on: {
    proxyReq: (proxyReq) => {
      // Inject the gateway auth token so OpenClaw accepts the request
      if (openclawToken) {
        proxyReq.setHeader('Authorization', `Bearer ${openclawToken}`);
      }
    },
    error: (err, req, res) => {
      if (res.headersSent) return;
      res.writeHead(502, { 'Content-Type': 'text/html' });
      res.end(`
        <div style="font-family:system-ui;color:#e4e4e7;background:#0a0a0f;min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px">
          <h2 style="color:#6366f1">OpenClaw Gateway Unavailable</h2>
          <p style="color:#71717a">The gateway on port ${OPENCLAW_PORT} is not responding.</p>
          <p style="color:#71717a">Make sure OpenClaw is running: <code style="color:#a5b4fc">openclaw serve</code></p>
          <code style="color:#ef4444;font-size:13px">${err.message}</code>
          <p style="margin-top:20px"><a href="/" style="color:#818cf8">↻ Retry</a></p>
        </div>
      `);
    },
  },
}));

// ── Start ───────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  🤖 OpenClaw Portal running on port ${PORT}`);
  console.log(`  ↳  Login:    http://localhost:${PORT}/login`);
  console.log(`  ↳  Proxying: http://127.0.0.1:${OPENCLAW_PORT}\n`);
});
