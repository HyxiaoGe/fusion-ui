import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile.smoke'), 'utf8');

describe('smoke runner 镜像', () => {
  it('基于官方 Playwright 容器并预装 smoke 依赖', () => {
    expect(dockerfile).toContain('FROM mcr.microsoft.com/playwright:v1.58.2-noble');
    expect(dockerfile).toContain('PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1');
    expect(dockerfile).toContain('npm install --no-save --package-lock=false');
    expect(dockerfile).toContain('playwright@1.58.2');
    expect(dockerfile).toContain('PLAYWRIGHT_MODULE_PATH=/smoke/node_modules/playwright/index.js');
  });
});
