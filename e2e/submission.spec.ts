import { expect, test } from '@playwright/test';

test('web shell opens the chat-only submission surface with document attach', async ({ page }) => {
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        user: {
          public_user_id: 'e2e-submitter-public',
          display_name: 'E2E Submitter',
          is_demo: false,
          email: 'e2e.submitter@gmail.com',
          avatar_url: null,
          is_whatsapp_linked: false,
          display_name_updated_at: null,
        },
      }),
    });
  });

  await page.goto('/');

  await expect(page).toHaveTitle(/Earth Talk/i);

  const submitButton = page.getByRole('button', { name: 'Submit Field Observation' }).first();
  await expect(submitButton).toBeVisible();
  await submitButton.click();

  const dialog = page.getByRole('dialog', { name: 'Submit Field Observation' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/I handle the whole submission here/i);
  await expect(dialog).toContainText(/No other form or screen is needed/i);
  await expect(dialog).toContainText(/document files/i);

  await dialog.getByRole('button', { name: 'Attach photo, video clip, or location' }).click();
  await expect(dialog.getByText('File / PDF')).toBeVisible();
});

test('login copy hides the identity provider implementation details', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to Earth Talk' });

  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/Use your Google account to continue securely/i);
  await expect(dialog).toContainText(/Secure Google sign-in for Earth Talk/i);
  await expect(dialog).not.toContainText(/supabase/i);
});

test('mobile sites view exposes the explanation behind an info icon', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: 'Open sidebar', exact: true }).first().click();
  await page.getByRole('button', { name: 'Geoscience sites' }).click();
  await expect(
    page.getByRole('heading', { name: 'Posts without a published location' })
  ).toBeVisible();

  const infoButton = page.getByRole('button', { name: 'About this view' });
  await expect(infoButton).toBeVisible();
  await infoButton.click();

  await expect(page.getByRole('note')).toContainText(
    /Published field posts that have no public map coordinate/i
  );
});

test('mobile investigations action is icon-only with an accessible name', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: 'Open sidebar', exact: true }).first().click();
  await page.getByRole('button', { name: 'Investigations' }).click();

  const button = page.getByRole('button', { name: 'Open investigation' });
  await expect(button).toBeVisible();
  await expect(button.locator('span')).toBeHidden();
});
