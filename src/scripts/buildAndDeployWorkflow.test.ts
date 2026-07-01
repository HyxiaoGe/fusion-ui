import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(join(process.cwd(), '.github/workflows/build-and-deploy.yml'), 'utf8');

describe('build-and-deploy workflow 发布门禁', () => {
  it('dev 部署后运行 Playwright 官方容器 smoke', () => {
    expect(workflow).toContain('Run dev browser smoke');
    expect(workflow).toContain('mcr.microsoft.com/playwright:');
    expect(workflow).toContain('scripts/smoke-dev-deployment.mjs');
    expect(workflow).toContain('SMOKE_BASE_URL=http://127.0.0.1:3004');
  });

  it('dev smoke 失败时仍输出 fusion-ui 容器日志', () => {
    expect(workflow).toContain('docker logs --tail 80 fusion-ui || true');
  });
});
