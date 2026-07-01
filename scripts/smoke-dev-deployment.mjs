#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { buildSmokeUrl, resolveSmokeBaseUrl, validateDeploymentSmokeResult } from './smoke-dev-deployment-helpers.mjs';

function serializeErrors(entries) {
  return entries.map((entry) => String(entry).slice(0, 500));
}

export async function runDeploymentSmoke({ baseUrl = resolveSmokeBaseUrl(), chromium, logger = console } = {}) {
  const browserEngine = chromium || (await import('playwright')).chromium;
  const browser = await browserEngine.launch({
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const smokeUrl = buildSmokeUrl(baseUrl);

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error?.stack || error?.message || error));

  try {
    await page.goto(smokeUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForSelector('[placeholder*="发消息给 Fusion AI"]', { timeout: 20_000 });
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[title]')).some((node) =>
          node.getAttribute('title')?.includes('可按问题需要自主联网搜索和读取关键来源'),
        ),
      undefined,
      { timeout: 20_000 },
    );

    const modelTrigger = page.locator(
      'button[title*="可按问题需要自主联网搜索和读取关键来源"], [title*="可按问题需要自主联网搜索和读取关键来源"] button',
    );
    await modelTrigger.first().click({ timeout: 10_000 });
    await page.getByText('可联网', { exact: true }).first().waitFor({ state: 'visible', timeout: 10_000 });

    const result = {
      currentUrl: page.url(),
      hasApplicationError: await page.getByText('Application error', { exact: false }).isVisible().catch(() => false),
      inputVisible: await page.locator('[placeholder*="发消息给 Fusion AI"]').first().isVisible(),
      modelCapabilityTextVisible: await page
        .locator('[title*="可按问题需要自主联网搜索和读取关键来源"]')
        .first()
        .isVisible(),
      capabilityLabelsVisible: await page.getByText('可联网', { exact: true }).first().isVisible(),
      consoleErrors: serializeErrors(consoleErrors),
      pageErrors: serializeErrors(pageErrors),
    };

    validateDeploymentSmokeResult(result);
    logger.log(`deployment smoke ok: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    const failure = {
      currentUrl: page.url(),
      targetUrl: smokeUrl,
      consoleErrors: serializeErrors(consoleErrors),
      pageErrors: serializeErrors(pageErrors),
      error: error?.stack || error?.message || String(error),
    };
    logger.error(`deployment smoke failed: ${JSON.stringify(failure, null, 2)}`);
    throw error;
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDeploymentSmoke().catch(() => process.exit(1));
}
