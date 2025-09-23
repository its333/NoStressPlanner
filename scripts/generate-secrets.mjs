#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const targetPath = process.argv[2] ?? '.env.local';
const resolvedPath = path.resolve(process.cwd(), targetPath);

if (!existsSync(resolvedPath)) {
  console.error(`Cannot find ${targetPath}. Create it first (copy from .env.example).`);
  process.exit(1);
}

let contents = readFileSync(resolvedPath, 'utf8');
let didChange = false;

function ensureSecret(key, generator) {
  const pattern = new RegExp(`^${key}=(.*)$`, 'm');
  const match = contents.match(pattern);
  if (match) {
    const current = match[1].trim().replace(/^"|"$/g, '');
    if (current.length > 0) {
      return current;
    }
    const value = generator();
    contents = contents.replace(pattern, `${key}="${value}"`);
    didChange = true;
    return value;
  }
  const value = generator();
  const suffix = contents.endsWith('\n') || contents.length === 0 ? '' : '\n';
  contents = `${contents}${suffix}${key}="${value}"\n`;
  didChange = true;
  return value;
}

const nextAuthSecret = ensureSecret('NEXTAUTH_SECRET', () => randomBytes(32).toString('base64url'));
const cronSecret = ensureSecret('CRON_SECRET', () => randomBytes(24).toString('hex'));

if (didChange) {
  writeFileSync(resolvedPath, contents, 'utf8');
  console.log('Secrets updated in', targetPath);
} else {
  console.log('Secrets already present. Nothing to do.');
}

console.log('NEXTAUTH_SECRET:', nextAuthSecret);
console.log('CRON_SECRET    :', cronSecret);