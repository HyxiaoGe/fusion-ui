import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile.smoke'), 'utf8');

describe('smoke runner 镜像', () => {
  it('基于 node alpine 预装系统 Chromium 和 smoke 依赖', () => {
    expect(dockerfile).toContain('FROM node:20-alpine');
    expect(dockerfile).not.toContain('mcr.microsoft.com/playwright');
    expect(dockerfile).toContain('apk add --no-cache');
    expect(dockerfile).toContain('chromium');
    expect(dockerfile).toContain('PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1');
    expect(dockerfile).toContain('npm install --no-save --package-lock=false');
    expect(dockerfile).toContain('playwright@1.58.2');
    expect(dockerfile).toContain('PLAYWRIGHT_MODULE_PATH=/smoke/node_modules/playwright/index.js');
    expect(dockerfile).toContain('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser');
  });
});
