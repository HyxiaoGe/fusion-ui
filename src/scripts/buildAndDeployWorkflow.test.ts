import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const releaseWorkflow = readFileSync(join(process.cwd(), '.github/workflows/build-and-deploy.yml'), 'utf8');
const pullRequestWorkflow = readFileSync(join(process.cwd(), '.github/workflows/pull-request.yml'), 'utf8');
const windowsDockerBuildAction = readFileSync(
  join(process.cwd(), '.github/actions/windows-docker-build/action.yml'),
  'utf8',
);
const releasePublishBlock = releaseWorkflow.slice(
  releaseWorkflow.indexOf('  publish:'),
  releaseWorkflow.indexOf('  deploy-dev:'),
);
const deployDevBlock = releaseWorkflow.slice(releaseWorkflow.indexOf('  deploy-dev:'));
const checkoutAction = 'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6';
const loginAction = 'docker/login-action@dbcb813823bdd20940b903addbd779551569679f # v4.6.0';

type WorkflowStep = { name?: string; run?: string };
type WorkflowDocument = { jobs?: Record<string, { steps?: WorkflowStep[] }> };
const releaseWorkflowDocument = parse(releaseWorkflow) as WorkflowDocument;

const filesUnder = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
};

const actionDocuments = [
  ...filesUnder(join(process.cwd(), '.github/workflows')),
  ...filesUnder(join(process.cwd(), '.github/actions')).filter((path) => /action\.ya?ml$/.test(path)),
].map((path) => ({ path, content: readFileSync(path, 'utf8') }));

describe('build-and-deploy workflow 发布门禁', () => {
  it('PR CI 与 master 发布使用互斥触发器', () => {
    expect(pullRequestWorkflow).toContain('pull_request:');
    expect(pullRequestWorkflow).toContain('branches: [master]');
    expect(pullRequestWorkflow).not.toContain('  push:');
    expect(pullRequestWorkflow).not.toContain('workflow_dispatch:');

    expect(releaseWorkflow).toContain('push:');
    expect(releaseWorkflow).toContain('branches: [master]');
    expect(releaseWorkflow).toContain('workflow_dispatch:');
    expect(releaseWorkflow).not.toContain('pull_request:');
    expect(releasePublishBlock).toContain("if: github.ref == 'refs/heads/master'");
  });

  it('master 发布不会被后续 push 中途取消', () => {
    expect(releaseWorkflow).toContain('group: fusion-ui-build-deploy-${{ github.ref }}');
    expect(releaseWorkflow).toContain('cancel-in-progress: false');
    expect(pullRequestWorkflow).toContain('cancel-in-progress: true');
  });

  it('PR 路径只使用无发布权限的临时 Linux Runner', () => {
    expect(pullRequestWorkflow.match(/name: PR container validation/g)).toHaveLength(1);
    expect(pullRequestWorkflow).not.toContain('name: Build on Windows runner');
    expect(pullRequestWorkflow).not.toContain('过渡检查名');
    expect(pullRequestWorkflow).toContain('runs-on: ubuntu-latest');
    expect(pullRequestWorkflow).not.toContain('self-hosted');
    expect(pullRequestWorkflow).not.toContain('Windows, X64');
    expect(pullRequestWorkflow).not.toContain('environment:');
    expect(pullRequestWorkflow).not.toContain('${{ secrets.');
    expect(pullRequestWorkflow).not.toContain('docker/login-action');
    expect(pullRequestWorkflow).not.toContain('docker push');
    expect(pullRequestWorkflow).not.toContain('deploy-dev:');
    expect(pullRequestWorkflow).not.toContain('deploy-preview:');
    expect(pullRequestWorkflow).toContain('persist-credentials: false');
  });

  it('master 发布构建独占 Windows Runner 与 dev Environment', () => {
    expect(releasePublishBlock.match(/name: Publish master image on Windows runner/g)).toHaveLength(1);
    expect(releasePublishBlock).toContain('runs-on: [self-hosted, Windows, X64]');
    expect(releasePublishBlock).toContain('environment:');
    expect(releasePublishBlock).toContain('name: dev');
    expect(releasePublishBlock).toContain('deployment: false');
    expect(releasePublishBlock).toContain(loginAction);
    expect(releasePublishBlock).toContain('docker push $image');
    expect(releasePublishBlock).toContain('persist-credentials: false');
  });

  it('仓库内所有外部 Action 都锁定完整 commit SHA 并保留版本注释', () => {
    const usesKeyPattern = /^\s*(?:-\s*)?uses\s*:/;
    const usesValuePattern = /^\s*(?:-\s*)?uses\s*:\s*(['"]?)([^'"#\s]+)\1(?:\s+#\s*(.*\S))?\s*$/;
    let externalActionCount = 0;

    for (const document of actionDocuments) {
      for (const [index, line] of document.content.split(/\r?\n/).entries()) {
        if (!usesKeyPattern.test(line)) continue;
        const action = line.match(usesValuePattern);
        expect(action, `${document.path}:${index + 1} 的 uses 语法未纳入安全校验`).not.toBeNull();
        const [, , reference, versionComment] = action!;
        if (reference.startsWith('./')) continue;
        externalActionCount += 1;
        expect(reference, `${document.path}:${index + 1}`).toMatch(/^[^@\s]+@[0-9a-f]{40}$/);
        expect(versionComment, `${document.path}:${index + 1}`).toMatch(/^v\d/);
      }
    }
    expect(externalActionCount).toBeGreaterThan(0);
    expect(pullRequestWorkflow.split(`uses: ${checkoutAction}`)).toHaveLength(2);
    expect(releaseWorkflow.split(`uses: ${checkoutAction}`)).toHaveLength(3);
  });

  it('dev 部署依赖发布构建并绑定 dev Environment', () => {
    expect(deployDevBlock).toContain('needs: publish');
    expect(deployDevBlock).toContain('environment: dev');
    expect(deployDevBlock).toContain("if: github.ref == 'refs/heads/master'");
    expect(deployDevBlock).toContain('${{ needs.publish.outputs.started_at }}');
    expect(deployDevBlock).toContain('${{ needs.publish.outputs.runner_name }}');
    expect(deployDevBlock).toContain('persist-credentials: false');
  });

  it('Windows 发布清理本次 job 专属 Docker 凭据目录', () => {
    expect(releasePublishBlock).toContain('Join-Path $env:RUNNER_TEMP ".docker-$env:GITHUB_RUN_ID-$env:GITHUB_JOB"');
    expect(releasePublishBlock).toContain('cmd /c "docker image inspect $image >NUL 2>NUL"');
    expect(releasePublishBlock).not.toContain('docker image inspect $image *> $null');
    expect(releasePublishBlock).toContain('$hasExpectedName = (Split-Path $dockerConfig -Leaf) -like ".docker-*"');
    expect(releasePublishBlock).toContain('Remove-Item -Recurse -Force -Path $dockerConfig');
  });

  it('Linux 部署隔离并清理本次 job 的 Docker 凭据目录', () => {
    expect(deployDevBlock).toContain('dockerConfig="${RUNNER_TEMP}/.docker-${GITHUB_RUN_ID}-${GITHUB_JOB}"');
    expect(deployDevBlock).toContain('echo "DOCKER_CONFIG=$dockerConfig" >> "$GITHUB_ENV"');
    expect(deployDevBlock).toContain('if [[ "$dockerConfig" != "$expectedDockerConfig" || "$dockerConfig" != "${RUNNER_TEMP}/.docker-"* ]]');
    expect(deployDevBlock).toContain('rm -rf -- "$dockerConfig"');
    expect(deployDevBlock.lastIndexOf('Cleanup Docker credential directory')).toBeGreaterThan(
      deployDevBlock.indexOf('通知飞书(部署结果)'),
    );
  });

  it('不恢复特性分支 Preview', () => {
    expect(releaseWorkflow).not.toContain('deploy-preview:');
    expect(releaseWorkflow).not.toContain('fusion-ui-preview');
    expect(releaseWorkflow).not.toContain('docker-compose.fusion-ui-preview.yml');
    expect(releaseWorkflow).not.toContain('3005:3000');
    expect(releaseWorkflow).not.toContain('Configure preview public env');
    expect(pullRequestWorkflow).not.toContain('deploy-preview:');
  });

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

  it('dev smoke 先精确验收运行镜像身份再从容器内部访问应用', () => {
    const smokeSteps = (releaseWorkflowDocument.jobs?.['deploy-dev']?.steps ?? []).filter(
      (step) => step.name === 'Smoke check dev deployment',
    );
    expect(smokeSteps).toHaveLength(1);
    const smokeRun = smokeSteps[0].run;
    expect(smokeRun).toBeTypeOf('string');

    const executableLines = smokeRun!
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    const expectedImageLine = 'expectedImage="${IMAGE_NAME}:${GITHUB_SHA}"';
    const runningImageLine =
      'runningImage="$(docker inspect --format \'{{.Config.Image}}\' fusion-ui 2>/dev/null || true)"';
    const compareLine = 'if [ "$runningImage" != "$expectedImage" ]; then';
    const containerSmokeLine = executableLines.find(
      (line) =>
        line.startsWith('if docker exec fusion-ui node -e ') &&
        line.includes('fetch("http://127.0.0.1:3000/"'),
    );
    const retryLine = 'for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do';

    expect(executableLines).toContain(expectedImageLine);
    expect(executableLines).toContain(runningImageLine);
    expect(executableLines).toContain(compareLine);
    expect(executableLines).toContain(retryLine);
    expect(containerSmokeLine).toBeDefined();
    expect(containerSmokeLine).toContain('AbortSignal.timeout(5000)');
    expect(containerSmokeLine).toContain('.catch((error) =>');
    expect(containerSmokeLine).toContain('process.exit(1)');
    expect(executableLines.some((line) => /\bcurl\b/.test(line))).toBe(false);
    expect(smokeRun!.indexOf(runningImageLine)).toBeLessThan(smokeRun!.indexOf(compareLine));
    expect(smokeRun!.indexOf(compareLine)).toBeLessThan(smokeRun!.indexOf(containerSmokeLine!));

    const imageMismatchBlock = smokeRun!.slice(
      smokeRun!.indexOf(compareLine),
      smokeRun!.indexOf(containerSmokeLine!),
    );
    expect(imageMismatchBlock).toContain('docker ps --filter "name=fusion-ui"');
    expect(imageMismatchBlock).toContain('docker logs --tail 80 fusion-ui || true');
    expect(imageMismatchBlock).toMatch(/\n\s*exit 1\n\s*fi\n/);

    const finalFailureBlock = smokeRun!.slice(smokeRun!.indexOf('\ndone\n'));
    expect(finalFailureBlock).toContain('docker ps --filter "name=fusion-ui"');
    expect(finalFailureBlock).toContain('docker logs --tail 80 fusion-ui || true');
    expect(finalFailureBlock.trimEnd().endsWith('exit 1')).toBe(true);
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
    expect(releaseWorkflow).not.toContain('Dockerfile.smoke');
    expect(releaseWorkflow).not.toContain('Ensure smoke runner image');
    expect(releaseWorkflow).not.toContain('docker build -f Dockerfile.smoke');
    expect(releaseWorkflow).not.toContain('docker push $smokeImage');
  });

  it('Windows 构建 job 的 Docker access 校验包含重试和服务启动兜底', () => {
    expect(windowsDockerBuildAction).toContain('for ($attempt = 1; $attempt -le 6; $attempt++)');
    expect(windowsDockerBuildAction).toContain("'docker', 'com.docker.service'");
    expect(windowsDockerBuildAction).toContain('Start-Service -Name $serviceName');
    expect(windowsDockerBuildAction).toContain('Docker Desktop.exe');
    expect(windowsDockerBuildAction).toContain('Start-Process -FilePath $desktopPath');
    expect(windowsDockerBuildAction).toContain('Docker daemon ready');
  });

  it('Docker 镜像构建对 registry 或 buildx 瞬断做有限重试', () => {
    expect(windowsDockerBuildAction).toContain('for ($attempt = 1; $attempt -le 3; $attempt++)');
    expect(windowsDockerBuildAction).toContain('docker @buildArgs');
    expect(windowsDockerBuildAction).toContain('docker build 失败，第 $attempt 次');
  });

  it('Windows 发布只在 Docker targets 中安装依赖、测试和构建', () => {
    expect(windowsDockerBuildAction).not.toContain('Setup Node.js');
    expect(windowsDockerBuildAction).not.toContain('npm ci --no-audit --no-fund --cache');
    expect(windowsDockerBuildAction).not.toContain('run: npm run build');
    expect(windowsDockerBuildAction).not.toContain('run: npm test');
    expect(windowsDockerBuildAction).toContain('"--target", "test"');
    expect(windowsDockerBuildAction).toContain('"--no-cache-filter", "test"');
    expect(windowsDockerBuildAction).toContain('"--target", "production"');
  });

  it('Windows Docker builds 复用 Runner 专属 builder 内部缓存', () => {
    expect(windowsDockerBuildAction).toContain("$runnerKey = '${{ runner.name }}' -replace");
    expect(windowsDockerBuildAction).toContain('$builder = "fusion-ui-ci-$runnerKey"');
    expect(windowsDockerBuildAction).not.toContain('type=local,src=');
    expect(windowsDockerBuildAction).not.toContain('type=local,dest=');
    expect(windowsDockerBuildAction).not.toContain('fusion-ui-buildx-cache-next');
  });

  it('PR 在临时 Linux Runner 完成同等 Docker targets 构建', () => {
    expect(pullRequestWorkflow).not.toContain('uses: ./.github/actions/windows-docker-build');
    expect(pullRequestWorkflow).toContain('docker buildx create');
    expect(pullRequestWorkflow).toContain('--target test');
    expect(pullRequestWorkflow).toContain('--no-cache-filter test');
    expect(pullRequestWorkflow).toContain('--target production');
    expect(pullRequestWorkflow).toContain('--load');
    expect(pullRequestWorkflow).not.toContain('buildx prune');
  });

  it('master 发布复用 Windows 构建实现并保留缓存治理', () => {
    expect(releasePublishBlock).toContain('uses: ./.github/actions/windows-docker-build');
    expect(releasePublishBlock).toContain('"buildx", "prune"');
    expect(releasePublishBlock).toContain('"--max-used-space", "25gb"');
    expect(releasePublishBlock).toContain('"--reserved-space", "8gb"');
    expect(releasePublishBlock).toContain('"--min-free-space", "30gb"');
  });
});
