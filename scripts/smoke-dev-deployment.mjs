#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import {
  buildSmokeSessionStorageFlags,
  buildSmokeUrl,
  isSameOrigin,
  MODEL_CAPABILITY_LABEL_TEXTS,
  MODEL_SELECTOR_PANEL_SELECTOR,
  MODEL_SELECTOR_TRIGGER_SELECTOR,
  resolveChromiumExecutablePath,
  resolvePlaywrightChromium,
  resolvePlaywrightModuleSpecifier,
  resolveSmokeBaseUrl,
  validateDeploymentSmokeResult,
} from './smoke-dev-deployment-helpers.mjs';

function serializeErrors(entries) {
  return entries.map((entry) => String(entry).slice(0, 500));
}

async function waitForCapabilityLabelIn(page, selector, timeout) {
  await page.waitForFunction(
    ({ labels, selector: targetSelector }) => {
      const root = document.querySelector(targetSelector);
      const text = root?.textContent || '';
      return labels.some((label) => text.includes(label));
    },
    { labels: MODEL_CAPABILITY_LABEL_TEXTS, selector },
    { timeout },
  );
}

async function hasVisibleCapabilityLabel(scope) {
  for (const label of MODEL_CAPABILITY_LABEL_TEXTS) {
    if (await scope.getByText(label, { exact: true }).first().isVisible().catch(() => false)) {
      return true;
    }
  }
  return false;
}

async function dismissBlockingDialog(page) {
  const overlay = page.locator('[data-slot="dialog-overlay"]').first();
  if (!(await overlay.isVisible().catch(() => false))) return;

  await page.keyboard.press('Escape').catch(() => {});
  await overlay.waitFor({ state: 'hidden', timeout: 3_000 }).catch(async () => {
    const closeButton = page.getByRole('button', { name: 'Close' }).first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click({ force: true, timeout: 1_000 }).catch(() => {});
    }
  });
}

export async function runDeploymentSmoke({ baseUrl = resolveSmokeBaseUrl(), chromium, logger = console } = {}) {
  const consoleErrors = [];
  const pageErrors = [];
  const smokeUrl = buildSmokeUrl(baseUrl);
  let browser;
  let page;

  try {
    const browserEngine =
      chromium || resolvePlaywrightChromium(await import(resolvePlaywrightModuleSpecifier()));
    const executablePath = resolveChromiumExecutablePath();
    browser = await browserEngine.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox'],
    });
    page = await browser.newPage();
    await page.addInitScript((flags) => {
      try {
        for (const [key, value] of Object.entries(flags)) {
          window.sessionStorage.setItem(key, value);
        }
      } catch {
        // sessionStorage may be unavailable in hardened browser contexts.
      }
    }, buildSmokeSessionStorageFlags());

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error?.stack || error?.message || error));

    await page.goto(smokeUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForSelector('[placeholder*="发消息给 Fusion AI"]', { timeout: 20_000 });
    await page.waitForSelector(MODEL_SELECTOR_TRIGGER_SELECTOR, { timeout: 20_000 });
    await waitForCapabilityLabelIn(page, MODEL_SELECTOR_TRIGGER_SELECTOR, 20_000);
    await dismissBlockingDialog(page);

    const modelTrigger = page.locator(MODEL_SELECTOR_TRIGGER_SELECTOR).first();
    await modelTrigger.click({ timeout: 10_000 });
    const modelPanel = page.locator(MODEL_SELECTOR_PANEL_SELECTOR).first();
    await modelPanel.waitFor({ state: 'visible', timeout: 10_000 });
    await waitForCapabilityLabelIn(page, MODEL_SELECTOR_PANEL_SELECTOR, 10_000);

    const result = {
      currentUrl: page.url(),
      targetUrl: smokeUrl,
      hasApplicationError: await page.getByText('Application error', { exact: false }).isVisible().catch(() => false),
      inputVisible: await page.locator('[placeholder*="发消息给 Fusion AI"]').first().isVisible(),
      modelCapabilityTextVisible: await hasVisibleCapabilityLabel(modelTrigger),
      capabilityLabelsVisible: await hasVisibleCapabilityLabel(modelPanel),
      sameOrigin: isSameOrigin(page.url(), smokeUrl),
      consoleErrors: serializeErrors(consoleErrors),
      pageErrors: serializeErrors(pageErrors),
    };

    validateDeploymentSmokeResult(result);
    logger.log(`deployment smoke ok: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    const failure = {
      currentUrl: page?.url?.() || null,
      targetUrl: smokeUrl,
      consoleErrors: serializeErrors(consoleErrors),
      pageErrors: serializeErrors(pageErrors),
      error: error?.stack || error?.message || String(error),
    };
    logger.error(`deployment smoke failed: ${JSON.stringify(failure, null, 2)}`);
    throw error;
  } finally {
    await browser?.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDeploymentSmoke().catch(() => process.exit(1));
}
