import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(join(process.cwd(), '.github/workflows/build-and-deploy.yml'), 'utf8');
const buildBlock = workflow.slice(workflow.indexOf('  build:'), workflow.indexOf('  deploy-preview:'));
const deployDevBlock = workflow.slice(workflow.indexOf('  deploy-dev:'));

describe('build-and-deploy workflow 发布门禁', () => {
  it('dev 部署后使用宿主 Chrome 运行 browser smoke', () => {
    expect(deployDevBlock).toContain('Run dev browser smoke');
    expect(deployDevBlock).toContain('Resolve browser smoke runtime');
    expect(deployDevBlock).toContain('command -v google-chrome');
    expect(deployDevBlock).toContain('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$chromePath');
    expect(deployDevBlock).not.toContain('mcr.microsoft.com/playwright:');
    expect(deployDevBlock).not.toContain('${{ env.SMOKE_IMAGE }}:${{ env.SMOKE_RUNNER_TAG }}');
    expect(deployDevBlock).toContain('scripts/smoke-dev-deployment.mjs');
    expect(deployDevBlock).toContain('SMOKE_BASE_URL: http://127.0.0.1:3004');
  });

  it('dev 部署 job 给 browser smoke 保留足够 timeout', () => {
    expect(deployDevBlock).toContain('timeout-minutes: 25');
  });

  it('dev 部署 job 会先 checkout smoke 脚本再执行浏览器 smoke', () => {
    expect(deployDevBlock).toContain('Checkout smoke scripts');
    expect(deployDevBlock.indexOf('Checkout smoke scripts')).toBeLessThan(deployDevBlock.indexOf('Run dev browser smoke'));
  });

  it('dev smoke 失败时仍输出 fusion-ui 容器日志', () => {
    expect(deployDevBlock).toContain('docker logs --tail 80 fusion-ui || true');
  });

  it('dev browser smoke 只缓存 Playwright 包且不下载浏览器', () => {
    expect(deployDevBlock).toContain('smokeNodeDir="$HOME/.cache/fusion-ui-smoke/playwright-1.58.2"');
    expect(deployDevBlock).toContain('PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --prefix "$smokeNodeDir"');
    expect(deployDevBlock).toContain('PLAYWRIGHT_MODULE_PATH="$smokeNodeDir/node_modules/playwright/index.js"');
    expect(deployDevBlock).toContain('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"');
    expect(deployDevBlock).not.toContain('npm install --prefix /tmp/fusion-ui-smoke');
    expect(deployDevBlock).not.toContain('npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/npm-cache && node scripts/smoke-dev-deployment.mjs');
  });

  it('Windows 构建 job 不再构建 browser smoke runner 镜像', () => {
    expect(workflow).not.toContain('Dockerfile.smoke');
    expect(workflow).not.toContain('Ensure smoke runner image');
    expect(workflow).not.toContain('docker build -f Dockerfile.smoke');
    expect(workflow).not.toContain('docker push $smokeImage');
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

  it('Windows 构建只在 Docker targets 中安装依赖、测试和构建', () => {
    expect(buildBlock).not.toContain('Setup Node.js');
    expect(buildBlock).not.toContain('npm ci --no-audit --no-fund --cache');
    expect(buildBlock).not.toContain('run: npm run build');
    expect(buildBlock).not.toContain('run: npm test');
    expect(buildBlock).toContain('"--target", "test"');
    expect(buildBlock).toContain('"--no-cache-filter", "test"');
    expect(buildBlock).toContain('"--target", "production"');
  });

  it('Windows Docker builds 复用 Runner 专属 builder 内部缓存', () => {
    expect(buildBlock).toContain("$runnerKey = '${{ runner.name }}' -replace");
    expect(buildBlock).toContain('$builder = "fusion-ui-ci-$runnerKey"');
    expect(buildBlock).not.toContain('type=local,src=');
    expect(buildBlock).not.toContain('type=local,dest=');
    expect(buildBlock).not.toContain('fusion-ui-buildx-cache-next');
  });
});
