// Creates (or resets the password of) a creator account.
//
//   pnpm admin:create                 # dev deployment, prompts for details
//   pnpm admin:create --prod          # production deployment
//
// ADMIN_EMAIL / ADMIN_PASSWORD may be set instead of answering prompts. The
// password is hashed here (PBKDF2-SHA256, the worker's parameters) and only
// the hash reaches Convex, through an internal function.
import { Buffer } from 'node:buffer';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const ITERATIONS = 100_000; // Workers' PBKDF2 ceiling; keep in sync with src/crypto.ts.

async function ask(question, hidden = false) {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  if (hidden) {
    rl._writeToOutput = text => {
      if (text.includes(question)) stdout.write(text);
    };
  }
  const answer = await rl.question(question);
  rl.close();
  if (hidden) stdout.write('\n');
  return answer.trim();
}

const email = (process.env.ADMIN_EMAIL ?? (await ask('Email: '))).toLowerCase();
const password =
  process.env.ADMIN_PASSWORD ??
  (await ask('Password (12+ characters): ', true));

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('That email doesn’t look valid.');
  process.exit(1);
}
if (password.length < 12) {
  console.error('Use a password of at least 12 characters.');
  process.exit(1);
}

const salt = randomBytes(16).toString('hex');
const passwordHash = pbkdf2Sync(
  password,
  Buffer.from(salt, 'hex'),
  ITERATIONS,
  32,
  'sha256'
).toString('hex');
const args = JSON.stringify({
  email,
  passwordHash,
  salt,
  iterations: ITERATIONS,
});
const target = process.argv.includes('--prod') ? ['--prod'] : [];

// Run the Convex CLI through node directly: no shell, so the JSON is passed intact.
const cli = fileURLToPath(
  new URL('../node_modules/convex/bin/main.js', import.meta.url)
);
execFileSync(process.execPath, [cli, 'run', ...target, 'admins:upsert', args], {
  stdio: ['ignore', 'ignore', 'inherit'],
});
console.log(
  `Creator account ready for ${email}${target.length ? ' (production)' : ''}.`
);
