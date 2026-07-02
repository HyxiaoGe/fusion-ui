import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildSmokeUrl,
  resolveChromiumExecutablePath,
  resolvePlaywrightChromium,
  resolvePlaywrightModuleSpecifier,
  resolveSmokeBaseUrl,
  validateDeploymentSmokeResult,
} from '../../scripts/smoke-dev-deployment-helpers.mjs';

describe('deployment smoke helpers', () => {
  it('优先使用命令行 base-url，其次使用 SMOKE_BASE_URL，最后回退 dev 本机地址', () => {
    expect(resolveSmokeBaseUrl(['node', 'smoke', '--base-url', 'https://example.com'], {})).toBe(
      'https://example.com',
    );
    expect(resolveSmokeBaseUrl(['node', 'smoke'], { SMOKE_BASE_URL: 'https://env.example.com' })).toBe(
      'https://env.example.com',
    );
    expect(resolveSmokeBaseUrl(['node', 'smoke'], {})).toBe('http://127.0.0.1:3004');
  });

  it('构造 /chat/new smoke 地址时会去掉尾部斜杠', () => {
    expect(buildSmokeUrl('https://fusion.example.com/')).toBe('https://fusion.example.com/chat/new');
  });

  it('Playwright 模块默认按包名加载，也支持临时安装目录路径', () => {
    const modulePath = '/tmp/smoke/node_modules/playwright/index.js';

    expect(resolvePlaywrightModuleSpecifier({})).toBe('playwright');
    expect(resolvePlaywrightModuleSpecifier({ PLAYWRIGHT_MODULE_PATH: modulePath })).toBe(
      pathToFileURL(modulePath).href,
    );
  });

  it('兼容 Playwright ESM 命名导出和 CJS default 导出', () => {
    const namedChromium = {};
    const defaultChromium = {};

    expect(resolvePlaywrightChromium({ chromium: namedChromium })).toBe(namedChromium);
    expect(resolvePlaywrightChromium({ default: { chromium: defaultChromium } })).toBe(defaultChromium);
    expect(() => resolvePlaywrightChromium({})).toThrow('无法加载 Playwright chromium');
  });

  it('支持 smoke runner 指定系统 Chromium 路径', () => {
    expect(resolveChromiumExecutablePath({})).toBeUndefined();
    expect(
      resolveChromiumExecutablePath({
        PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/usr/bin/chromium-browser',
      }),
    ).toBe('/usr/bin/chromium-browser');
    expect(resolveChromiumExecutablePath({ CHROMIUM_EXECUTABLE_PATH: '/custom/chromium' })).toBe(
      '/custom/chromium',
    );
  });

  it('校验新对话页输入区、模型能力说明、下拉标签和控制台错误', () => {
    expect(() =>
      validateDeploymentSmokeResult({
        currentUrl: 'https://fusion.example.com/chat/new',
        hasApplicationError: false,
        inputVisible: true,
        modelCapabilityTextVisible: true,
        capabilityLabelsVisible: true,
        consoleErrors: [],
        pageErrors: [],
      }),
    ).not.toThrow();

    expect(() =>
      validateDeploymentSmokeResult({
        currentUrl: 'https://fusion.example.com/chat/new',
        hasApplicationError: false,
        inputVisible: true,
        modelCapabilityTextVisible: false,
        capabilityLabelsVisible: true,
        consoleErrors: [],
        pageErrors: [],
      }),
    ).toThrow('模型能力说明不可见');
  });
});
