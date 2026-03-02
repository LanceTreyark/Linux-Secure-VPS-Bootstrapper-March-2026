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
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Config ──────────────────────────────────────
const PORT = process.env.PORTAL_PORT || 3000;
const OPENCLAW_PORT = process.env.OPENCLAW_PORT || 18789;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const DB_URL = process.env.DATABASE_URL || 'postgresql://openclaw_portal:openclaw_portal@localhost:5432/openclaw_portal';

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
      'SELECT id, username, password_hash FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];
    if (!user) return done(null, false, { message: 'Invalid username or password.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return done(null, false, { message: 'Invalid username or password.' });

    return done(null, { id: user.id, username: user.username });
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT id, username FROM users WHERE id = $1', [id]);
    done(null, result.rows[0] || null);
  } catch (err) {
    done(err);
  }
});

// ── Auth middleware ──────────────────────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

// ── Routes ──────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
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
      res.redirect('/');
    });
  })(req, res, next);
});

app.post('/logout', requireAuth, (req, res) => {
  req.logout(() => {
    res.redirect('/login');
  });
});

// ── Proxy to OpenClaw gateway (authenticated) ───
app.use('/', requireAuth, createProxyMiddleware({
  target: `http://127.0.0.1:${OPENCLAW_PORT}`,
  changeOrigin: true,
  ws: true,
  onError: (err, req, res) => {
    res.status(502).send(`
      <div style="font-family:system-ui;color:#e4e4e7;background:#0a0a0f;min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px">
        <h2 style="color:#6366f1">OpenClaw Gateway Unavailable</h2>
        <p style="color:#71717a">The gateway on port ${OPENCLAW_PORT} is not responding.</p>
        <code style="color:#ef4444;font-size:13px">${err.message}</code>
      </div>
    `);
  },
}));

// ── Start ───────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  🤖 OpenClaw Portal running on port ${PORT}`);
  console.log(`  ↳  Login:    http://localhost:${PORT}/login`);
  console.log(`  ↳  Proxying: http://127.0.0.1:${OPENCLAW_PORT}\n`);
});
