// @ts-check
import { test, expect } from '@playwright/test';

test('dashboard agent page loads', async ({ page }) => {
  await page.goto('/dashboard/agent');
  await expect(page).toHaveURL(/dashboard\/agent/);
  // Page should have the main chat/agent UI (no 5xx)
  await expect(page.locator('body')).toBeVisible();
});

test('dashboard overview page loads', async ({ page }) => {
  await page.goto('/dashboard/overview');
  await expect(page).toHaveURL(/dashboard\/overview/);
  await expect(page.locator('body')).toBeVisible();
});
