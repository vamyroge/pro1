#!/usr/bin/env node
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function prompt(question, { silent = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (silent) {
      const stdin = process.openStdin();
      process.stdin.on('data', (char) => {
        const c = char + '';
        switch (c) {
          case '\n': case '\r': case '\u0004':
            stdin.pause();
            break;
          default:
            process.stdout.clearLine(0);
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(question + Array(rl.line.length + 1).join('*'));
            break;
        }
      });
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const username = (process.env.ADMIN_USERNAME || await prompt('Username: ')).toLowerCase();
  if (!username) { console.error('Username required'); process.exit(1); }

  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = await prompt('Password: ', { silent: true });
    const confirm = await prompt('Confirm password: ', { silent: true });
    if (password !== confirm) {
      console.error('Passwords do not match'); process.exit(1);
    }
  }
  if (!password || password.length < 6) {
    console.error('Password must be at least 6 characters'); process.exit(1);
  }

  const fullName = process.env.ADMIN_FULL_NAME || (await prompt('Full name (optional): '));
  const role = (process.env.ADMIN_ROLE || await prompt('Role [ADMIN/LIBRARIAN] (default ADMIN): ')).toUpperCase() || 'ADMIN';
  if (!['ADMIN', 'LIBRARIAN'].includes(role)) {
    console.error('Role must be ADMIN or LIBRARIAN'); process.exit(1);
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('users')
    .upsert(
      [{ username, password_hash, full_name: fullName || null, role }],
      { onConflict: 'username' }
    )
    .select()
    .single();

  if (error) {
    console.error('Failed to create user:', error.message);
    process.exit(1);
  }
  console.log('User ready:', { id: data.id, username: data.username, role: data.role });
}

main().catch((e) => { console.error(e); process.exit(1); });
