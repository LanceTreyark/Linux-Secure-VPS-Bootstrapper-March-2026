// ── Database & Admin User Setup ──────────────────
// Run with: node db/setup.mjs
//
// This creates the PostgreSQL database, tables, and
// the initial admin user. Called automatically during
// the Platform Installer OpenClaw setup flow.

import pg from 'pg';
import bcrypt from 'bcrypt';
import * as readline from 'readline';

const DB_NAME = process.env.DB_NAME || 'openclaw_portal';
const DB_USER = process.env.DB_USER || 'openclaw_portal';
const DB_PASS = process.env.DB_PASS || 'openclaw_portal';

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n  🔧 OpenClaw Portal — Database Setup\n');

  // ── Get admin credentials ──────────────────────
  const adminUser = process.env.ADMIN_USER || await ask(rl, '  Enter admin username: ');
  const adminPass = process.env.ADMIN_PASS || await ask(rl, '  Enter admin password: ');

  if (!adminUser || !adminPass) {
    console.error('  ❌ Username and password are required.');
    process.exit(1);
  }

  // ── Connect as postgres superuser to create DB & role ──
  const superClient = new pg.Client({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    port: 5432,
  });

  try {
    await superClient.connect();

    // Create role if not exists
    const roleCheck = await superClient.query(
      "SELECT 1 FROM pg_roles WHERE rolname = $1", [DB_USER]
    );
    if (roleCheck.rowCount === 0) {
      await superClient.query(`CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}'`);
      console.log(`  ✅ Database role "${DB_USER}" created.`);
    } else {
      console.log(`  ✅ Database role "${DB_USER}" already exists.`);
    }

    // Create database if not exists
    const dbCheck = await superClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME]
    );
    if (dbCheck.rowCount === 0) {
      await superClient.query(`CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}`);
      console.log(`  ✅ Database "${DB_NAME}" created.`);
    } else {
      console.log(`  ✅ Database "${DB_NAME}" already exists.`);
    }

    await superClient.end();
  } catch (err) {
    console.error(`  ❌ Superuser connection failed: ${err.message}`);
    console.log('  Make sure PostgreSQL is running and peer/trust auth is configured for postgres user.');
    await superClient.end();
    rl.close();
    process.exit(1);
  }

  // ── Connect to app database and create tables ──
  const appClient = new pg.Client({
    user: DB_USER,
    password: DB_PASS,
    host: 'localhost',
    database: DB_NAME,
    port: 5432,
  });

  try {
    await appClient.connect();

    // Users table
    await appClient.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✅ Users table ready.');

    // Sessions table (connect-pg-simple will also auto-create, but explicit is safer)
    await appClient.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        sid VARCHAR NOT NULL PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL
      )
    `);
    await appClient.query(`
      CREATE INDEX IF NOT EXISTS idx_session_expire ON user_sessions (expire)
    `);
    console.log('  ✅ Sessions table ready.');

    // Hash password and insert admin user
    const hash = await bcrypt.hash(adminPass, 12);

    // Upsert — update password if user already exists
    await appClient.query(`
      INSERT INTO users (username, password_hash)
      VALUES ($1, $2)
      ON CONFLICT (username)
      DO UPDATE SET password_hash = EXCLUDED.password_hash
    `, [adminUser, hash]);

    console.log(`  ✅ Admin user "${adminUser}" created.\n`);
    console.log('  Database setup complete! The portal is ready to use.\n');

    await appClient.end();
  } catch (err) {
    console.error(`  ❌ Database setup failed: ${err.message}`);
    await appClient.end();
    rl.close();
    process.exit(1);
  }

  rl.close();
}

main();
