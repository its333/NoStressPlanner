#!/usr/bin/env node
// scripts/setup-environment.mjs
// Professional environment setup for No Stress Planner

import { writeFileSync, existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import crypto from 'crypto';

const ENV_FILE = '.env.local';
const EXAMPLE_FILE = '.env.example';

// Generate secure random secrets
function generateSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// Default environment configuration
const defaultConfig = {
  // Database Configuration
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:6543/nostressplanner',
  DIRECT_URL: 'postgresql://postgres:postgres@localhost:5432/nostressplanner',
  
  // NextAuth Configuration
  NEXTAUTH_SECRET: generateSecret(32),
  NEXTAUTH_URL: 'http://localhost:3001',
  
  // Discord OAuth (Optional - for production)
  DISCORD_CLIENT_ID: '',
  DISCORD_CLIENT_SECRET: '',
  
  // Pusher Real-time Configuration (REQUIRED for live updates)
  PUSHER_APP_ID: '',
  PUSHER_KEY: '',
  PUSHER_SECRET: '',
  PUSHER_CLUSTER: 'us2',
  
  // Public Pusher Configuration (for client-side)
  NEXT_PUBLIC_PUSHER_KEY: '',
  NEXT_PUBLIC_PUSHER_CLUSTER: 'us2',
  
  // Cron Configuration
  CRON_SECRET: generateSecret(16),
  
  // Redis Configuration (Optional - for caching)
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  REDIS_PASSWORD: '',
  REDIS_DB: '0',
  
  // Development Configuration
  NODE_ENV: 'development'
};

// Check if .env.local already exists
if (existsSync(ENV_FILE)) {
  console.log('⚠️  .env.local already exists. Backing up to .env.local.backup');
  const backupContent = readFileSync(ENV_FILE, 'utf8');
  writeFileSync('.env.local.backup', backupContent);
}

// Create .env.example for reference
console.log('📝 Creating .env.example for reference...');
const exampleContent = Object.entries(defaultConfig)
  .map(([key, value]) => {
    if (key.includes('SECRET') || key.includes('PASSWORD')) {
      return `${key}="your-${key.toLowerCase().replace(/_/g, '-')}-here"`;
    }
    return `${key}="${value}"`;
  })
  .join('\n');

writeFileSync(EXAMPLE_FILE, exampleContent);

// Create .env.local with defaults
console.log('🔧 Creating .env.local with secure defaults...');
const envContent = Object.entries(defaultConfig)
  .map(([key, value]) => `${key}="${value}"`)
  .join('\n');

writeFileSync(ENV_FILE, envContent);

console.log('✅ Environment setup complete!');
console.log('');
console.log('🔑 Generated secure secrets:');
console.log(`   NEXTAUTH_SECRET: ${defaultConfig.NEXTAUTH_SECRET.substring(0, 8)}...`);
console.log(`   CRON_SECRET: ${defaultConfig.CRON_SECRET.substring(0, 8)}...`);
console.log('');
console.log('📋 Next steps:');
console.log('   1. Set up Pusher account at https://pusher.com');
console.log('   2. Add your Pusher credentials to .env.local');
console.log('   3. Set up Discord OAuth (optional)');
console.log('   4. Run: pnpm dev');
console.log('');
console.log('🚀 Live updates will work once Pusher is configured!');
