// tests/setup.ts
// Test setup and global configuration
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

let prismaClient: (typeof import('@/lib/prisma'))['prisma'] | null = null;

async function getPrismaClient() {
  if (prismaClient) {
    return prismaClient;
  }

  try {
    const module = await import('@/lib/prisma');
    prismaClient = module.prisma;
  } catch (error) {
    console.warn(
      'Prisma client unavailable for tests, skipping database cleanup.'
    );
    prismaClient = null;
  }

  return prismaClient;
}

// Global test setup
beforeAll(async () => {
  // Ensure database is clean before running tests
  await cleanupDatabase();
});

afterAll(async () => {
  // Clean up after all tests
  await cleanupDatabase();
});

beforeEach(async () => {
  // Clean up before each test
  await cleanupDatabase();
});

afterEach(async () => {
  // Clean up after each test
  await cleanupDatabase();
});

async function cleanupDatabase() {
  const prisma = await getPrismaClient();
  if (!prisma) {
    return;
  }

  try {
    // Delete in reverse order of dependencies
    await prisma.dayBlock.deleteMany();
    await prisma.vote.deleteMany();
    await prisma.attendeeSession.deleteMany();
    await prisma.inviteToken.deleteMany();
    await prisma.event.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();
    await prisma.verificationToken.deleteMany();
  } catch (error) {
    console.warn('Database cleanup failed:', error);
  }
}

// Mock environment variables for testing
Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXTAUTH_SECRET: 'test-secret',
  NEXTAUTH_URL: 'http://localhost:3000',
  DATABASE_URL:
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
  DIRECT_URL:
    process.env.DIRECT_URL || 'postgresql://test:test@localhost:5432/test',
});
