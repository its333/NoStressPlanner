import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { format } from 'date-fns';

const prisma = new PrismaClient();
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100';

interface SeedData {
  token: string;
  hostSessionToken: string;
  eventStart: Date;
  eventEnd: Date;
}

async function resetDatabase() {
  await prisma.dayBlock.deleteMany();
  await prisma.vote.deleteMany();
  await prisma.attendeeSession.deleteMany();
  await prisma.attendeeName.deleteMany();
  await prisma.inviteToken.deleteMany();
  await prisma.event.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
}

async function seedEvent(): Promise<SeedData> {
  const host = await prisma.user.create({
    data: {
      email: 'host@example.com',
      name: 'Host',
    },
  });

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + 10);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 4);
  const deadline = new Date();
  deadline.setUTCHours(deadline.getUTCHours() + 4, 0, 0, 0);

  const event = await prisma.event.create({
    data: {
      title: 'Playwright Test Event',
      description: 'E2E flow validation',
      startDate: start,
      endDate: end,
      voteDeadline: deadline,
      quorum: 2,
      requireLoginToAttend: false,
      hostId: host.id,
      attendeeNames: {
        create: [
          { label: 'Alpha', slug: 'alpha' },
          { label: 'Beta', slug: 'beta' },
          { label: 'Gamma', slug: 'gamma' },
        ],
      },
    },
    include: { attendeeNames: true },
  });

  const token = randomBytes(6).toString('base64url');
  await prisma.inviteToken.create({ data: { token, eventId: event.id } });

  const sessionToken = randomBytes(24).toString('hex');
  await prisma.session.create({
    data: {
      sessionToken,
      userId: host.id,
      expires: new Date(Date.now() + 1000 * 60 * 60),
    },
  });

  return {
    token,
    hostSessionToken: sessionToken,
    eventStart: start,
    eventEnd: end,
  };
}

let seed: SeedData;

test.beforeAll(async () => {
  await resetDatabase();
  seed = await seedEvent();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('attendees reach quorum, block days, and host finalises date', async ({ browser }) => {
  const attendeeA = await browser.newContext({ baseURL });
  const attendeeB = await browser.newContext({ baseURL });

  const pageA = await attendeeA.newPage();
  await pageA.goto(`/e/${seed.token}`);
  await pageA.getByLabel('Pick your invite name').selectOption('alpha');
  await pageA.getByLabel('Display name (what other attendees see)').fill('Alex');
  await pageA.getByRole('button', { name: 'Join event' }).click();
  await pageA.getByRole('heading', { name: 'Are you in?' }).waitFor();
  await pageA.getByRole('button', { name: "I'm in" }).click();

  const pageB = await attendeeB.newPage();
  await pageB.goto(`/e/${seed.token}`);
  await pageB.getByLabel('Pick your invite name').selectOption('beta');
  await pageB.getByLabel('Display name (what other attendees see)').fill('Bailey');
  await pageB.getByRole('button', { name: 'Join event' }).click();
  await pageB.getByRole('heading', { name: 'Are you in?' }).waitFor();
  await pageB.getByRole('button', { name: "I'm in" }).click();

  await pageA.getByText('Block the days you cannot do').waitFor();
  await pageB.getByText('Block the days you cannot do').waitFor();

  const dayA = format(seed.eventStart, 'MMM d');
  const dayB = format(new Date(seed.eventStart.getTime() + 86400000), 'MMM d');

  await pageA.getByRole('button', { name: new RegExp(dayA, 'i') }).click();
  await pageA.getByRole('button', { name: 'Save changes' }).click();

  await pageB.getByRole('button', { name: new RegExp(dayB, 'i') }).click();
  await pageB.getByRole('button', { name: 'Save changes' }).click();

  await expect(pageA.getByText('Best availability')).toBeVisible();

  const hostContext = await browser.newContext({ baseURL });
  const expires = Math.floor(Date.now() / 1000) + 3600;
  await hostContext.addCookies([
    {
      name: 'authjs.session-token',
      value: seed.hostSessionToken,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      expires,
      secure: false,
    },
  ]);
  const hostPage = await hostContext.newPage();
  await hostPage.goto(`/e/${seed.token}`);
  await hostPage.getByText('Host controls').waitFor();

  const select = hostPage.locator('#finalDate');
  await select.waitFor();
  const optionValue = await select.locator('option').nth(1).getAttribute('value');
  expect(optionValue).toBeTruthy();
  if (optionValue) {
    await select.selectOption(optionValue);
    await hostPage.getByRole('button', { name: 'Save final date' }).click();
  }

  await expect(hostPage.getByText('Final date:')).toBeVisible();
  await expect(pageA.getByText('Final date:')).toBeVisible();
  await expect(pageB.getByText('Final date:')).toBeVisible();

  await attendeeA.close();
  await attendeeB.close();
  await hostContext.close();
});
