// tests/e2e/event-lifecycle.spec.ts
// End-to-end tests for complete event lifecycle
import { test, expect } from '@playwright/test';

test.describe('Event Lifecycle E2E', () => {
  test('complete event flow from creation to finalization', async ({ page, browser }) => {
    // Start the application
    await page.goto('http://localhost:3000');

    // Step 1: Host creates event
    await page.click('text=Host Event');
    await page.fill('input[name="title"]', 'E2E Test Event');
    await page.fill('textarea[name="description"]', 'End-to-end test event');
    
    // Set date range
    await page.fill('input[name="startDate"]', '2025-01-01');
    await page.fill('input[name="endDate"]', '2025-01-07');
    await page.fill('input[name="voteDeadline"]', '2025-01-05');
    
    // Set quorum
    await page.fill('input[name="quorum"]', '2');
    
    // Create event
    await page.click('button[type="submit"]');
    
    // Wait for event creation and get the invite link
    await page.waitForSelector('text=Event created successfully');
    const inviteLink = await page.textContent('[data-testid="invite-link"]');
    expect(inviteLink).toBeTruthy();

    // Step 2: Open attendee page in new browser context
    const attendeeContext = await browser.newContext();
    const attendeePage = await attendeeContext.newPage();
    
    // Extract token from invite link
    const token = inviteLink?.split('/').pop() || '';
    await attendeePage.goto(`http://localhost:3000/e/${token}`);

    // Step 3: Attendee joins event
    await attendeePage.fill('input[name="displayName"]', 'Test Attendee');
    await attendeePage.click('button[type="submit"]');
    
    // Wait for join confirmation
    await attendeePage.waitForSelector('text=Joined successfully');

    // Step 4: Attendee votes IN
    await attendeePage.click('button[data-testid="vote-in"]');
    
    // Wait for vote confirmation
    await attendeePage.waitForSelector('text=Vote recorded');

    // Step 5: Host advances phase (should happen automatically when quorum is met)
    await page.reload();
    await page.waitForSelector('text=PICK_DAYS', { timeout: 10000 });

    // Step 6: Attendee blocks days
    await attendeePage.click('[data-testid="calendar-day"][data-date="2025-01-02"]');
    await attendeePage.click('[data-testid="calendar-day"][data-date="2025-01-03"]');
    await attendeePage.click('button[data-testid="save-availability"]');

    // Wait for save confirmation
    await attendeePage.waitForSelector('text=Availability saved');

    // Step 7: Host advances to RESULTS phase
    await page.click('button[data-testid="advance-phase"]');
    await page.waitForSelector('text=Phase advanced to RESULTS');

    // Step 8: Host sets final date
    await page.click('[data-testid="calendar-day"][data-date="2025-01-01"]');
    await page.click('button[data-testid="set-final-date"]');
    
    // Wait for final date confirmation
    await page.waitForSelector('text=Final date set');

    // Step 9: Verify final state
    await page.waitForSelector('text=FINALIZED');
    await attendeePage.waitForSelector('text=FINALIZED');

    // Clean up
    await attendeeContext.close();
  });

  test('host detection works correctly', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Create event as host
    await page.click('text=Host Event');
    await page.fill('input[name="title"]', 'Host Detection Test');
    await page.fill('input[name="startDate"]', '2025-01-01');
    await page.fill('input[name="endDate"]', '2025-01-07');
    await page.fill('input[name="voteDeadline"]', '2025-01-05');
    await page.fill('input[name="quorum"]', '1');
    
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Event created successfully');

    // Verify host controls are visible
    await expect(page.locator('button[data-testid="advance-phase"]')).toBeVisible();
    await expect(page.locator('button[data-testid="copy-link"]')).toBeVisible();
    await expect(page.locator('[data-testid="host-calendar"]')).toBeVisible();
  });

  test('non-host cannot access host controls', async ({ page, browser }) => {
    // Host creates event
    await page.goto('http://localhost:3000');
    await page.click('text=Host Event');
    await page.fill('input[name="title"]', 'Access Control Test');
    await page.fill('input[name="startDate"]', '2025-01-01');
    await page.fill('input[name="endDate"]', '2025-01-07');
    await page.fill('input[name="voteDeadline"]', '2025-01-05');
    await page.fill('input[name="quorum"]', '1');
    
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Event created successfully');
    
    const inviteLink = await page.textContent('[data-testid="invite-link"]');
    const token = inviteLink?.split('/').pop() || '';

    // Attendee joins event
    const attendeeContext = await browser.newContext();
    const attendeePage = await attendeeContext.newPage();
    
    await attendeePage.goto(`http://localhost:3000/e/${token}`);
    await attendeePage.fill('input[name="displayName"]', 'Test Attendee');
    await attendeePage.click('button[type="submit"]');
    await attendeePage.waitForSelector('text=Joined successfully');

    // Verify attendee cannot see host controls
    await expect(attendeePage.locator('button[data-testid="advance-phase"]')).not.toBeVisible();
    await expect(attendeePage.locator('button[data-testid="copy-link"]')).not.toBeVisible();

    await attendeeContext.close();
  });

  test('real-time updates work correctly', async ({ page, browser }) => {
    // Host creates event
    await page.goto('http://localhost:3000');
    await page.click('text=Host Event');
    await page.fill('input[name="title"]', 'Real-time Test');
    await page.fill('input[name="startDate"]', '2025-01-01');
    await page.fill('input[name="endDate"]', '2025-01-07');
    await page.fill('input[name="voteDeadline"]', '2025-01-05');
    await page.fill('input[name="quorum"]', '1');
    
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Event created successfully');
    
    const inviteLink = await page.textContent('[data-testid="invite-link"]');
    const token = inviteLink?.split('/').pop() || '';

    // Attendee joins in new context
    const attendeeContext = await browser.newContext();
    const attendeePage = await attendeeContext.newPage();
    
    await attendeePage.goto(`http://localhost:3000/e/${token}`);
    await attendeePage.fill('input[name="displayName"]', 'Real-time Attendee');
    await attendeePage.click('button[type="submit"]');
    await attendeePage.waitForSelector('text=Joined successfully');

    // Attendee votes IN
    await attendeePage.click('button[data-testid="vote-in"]');
    await attendeePage.waitForSelector('text=Vote recorded');

    // Host should see real-time update (phase should advance automatically)
    await page.waitForSelector('text=PICK_DAYS', { timeout: 10000 });

    // Verify both pages show the same phase
    await expect(page.locator('text=PICK_DAYS')).toBeVisible();
    await expect(attendeePage.locator('text=PICK_DAYS')).toBeVisible();

    await attendeeContext.close();
  });
});
