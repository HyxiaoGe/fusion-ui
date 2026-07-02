import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(join(process.cwd(), '.github/workflows/build-and-deploy.yml'), 'utf8');
const deployDevBlock = workflow.slice(workflow.indexOf('  deploy-dev:'));

describe('build-and-deploy workflow 发布门禁', () => {
  it('dev 部署后运行 Playwright 官方容器 smoke', () => {
    expect(deployDevBlock).toContain('Run dev browser smoke');
    expect(deployDevBlock).toContain('mcr.microsoft.com/playwright:');
    expect(deployDevBlock).toContain('scripts/smoke-dev-deployment.mjs');
    expect(deployDevBlock).toContain('SMOKE_BASE_URL=http://127.0.0.1:3004');
  });

  it('dev 部署 job 会先 checkout smoke 脚本再执行浏览器 smoke', () => {
    expect(deployDevBlock).toContain('Checkout smoke scripts');
    expect(deployDevBlock.indexOf('Checkout smoke scripts')).toBeLessThan(deployDevBlock.indexOf('Run dev browser smoke'));
  });

  it('dev smoke 失败时仍输出 fusion-ui 容器日志', () => {
    expect(deployDevBlock).toContain('docker logs --tail 80 fusion-ui || true');
  });
});
