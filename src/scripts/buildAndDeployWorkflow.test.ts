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

  it('dev 部署 job 给首次拉取 Playwright 镜像保留足够 timeout', () => {
    expect(deployDevBlock).toContain('timeout-minutes: 25');
  });

  it('dev 部署 job 会先 checkout smoke 脚本再执行浏览器 smoke', () => {
    expect(deployDevBlock).toContain('Checkout smoke scripts');
    expect(deployDevBlock.indexOf('Checkout smoke scripts')).toBeLessThan(deployDevBlock.indexOf('Run dev browser smoke'));
  });

  it('dev smoke 失败时仍输出 fusion-ui 容器日志', () => {
    expect(deployDevBlock).toContain('docker logs --tail 80 fusion-ui || true');
  });

  it('dev browser smoke 只安装 Playwright 包而不是全量 npm ci', () => {
    expect(deployDevBlock).toContain('npm install --no-save --package-lock=false');
    expect(deployDevBlock).toContain('playwright@1.58.2');
    expect(deployDevBlock).not.toContain('npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/npm-cache && node scripts/smoke-dev-deployment.mjs');
  });

  it('Windows 构建 job 的 Docker access 校验包含重试和服务启动兜底', () => {
    expect(workflow).toContain('for ($attempt = 1; $attempt -le 6; $attempt++)');
    expect(workflow).toContain("'docker', 'com.docker.service'");
    expect(workflow).toContain('Start-Service -Name $serviceName');
    expect(workflow).toContain('Docker Desktop.exe');
    expect(workflow).toContain('Start-Process -FilePath $desktopPath');
    expect(workflow).toContain('Docker daemon ready');
  });

  it('Docker 镜像构建对 registry 或 buildx 瞬断做有限重试', () => {
    expect(workflow).toContain('for ($attempt = 1; $attempt -le 3; $attempt++)');
    expect(workflow).toContain('docker @buildArgs');
    expect(workflow).toContain('docker build 失败，第 $attempt 次');
  });
});
