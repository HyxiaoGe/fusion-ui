#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'http://127.0.0.1:3004';

export class DeploymentSmokeError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DeploymentSmokeError';
    this.details = details;
  }
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/u, '');
}

export function resolveSmokeBaseUrl(argv = process.argv, env = process.env) {
  const equalsArg = argv.find((arg) => arg.startsWith('--base-url='));
  if (equalsArg) {
    return normalizeBaseUrl(equalsArg.slice('--base-url='.length));
  }

  const index = argv.indexOf('--base-url');
  if (index >= 0 && argv[index + 1]) {
    return normalizeBaseUrl(argv[index + 1]);
  }

  return normalizeBaseUrl(env.SMOKE_BASE_URL);
}

export function buildSmokeUrl(baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}/chat/new`;
}

export function validateDeploymentSmokeResult(result) {
  const failures = [];

  if (result.hasApplicationError) failures.push('页面出现 Application error');
  if (!result.inputVisible) failures.push('新对话输入区不可见');
  if (!result.modelCapabilityTextVisible) failures.push('模型能力说明不可见');
  if (!result.capabilityLabelsVisible) failures.push('模型下拉能力标签不可见');
  if (result.consoleErrors?.length) failures.push(`控制台错误 ${result.consoleErrors.length} 条`);
  if (result.pageErrors?.length) failures.push(`页面异常 ${result.pageErrors.length} 条`);

  if (failures.length > 0) {
    throw new DeploymentSmokeError(failures.join('；'), result);
  }
}

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
