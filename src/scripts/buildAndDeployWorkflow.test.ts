import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const releaseWorkflow = readFileSync(join(process.cwd(), '.github/workflows/build-and-deploy.yml'), 'utf8');
const pullRequestWorkflow = readFileSync(join(process.cwd(), '.github/workflows/pull-request.yml'), 'utf8');
const releaseSafetyManifest = readFileSync(join(process.cwd(), '.github/release-safety.yml'), 'utf8');
const releaseSafetyContractPath = join(process.cwd(), '.github/scripts/release-safety-contract.sh');
const releaseSafetyContract = readFileSync(releaseSafetyContractPath, 'utf8');
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

type WorkflowStep = {
  name?: string;
  id?: string;
  if?: string;
  run?: string;
  uses?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
  ['continue-on-error']?: boolean;
};
type WorkflowJob = {
  if?: string;
  needs?: string | string[];
  steps?: WorkflowStep[];
};
type WorkflowDocument = {
  env?: Record<string, string>;
  on?: {
    workflow_dispatch?: {
      inputs?: Record<string, { description?: string; required?: boolean; type?: string }>;
    };
  };
  jobs?: Record<string, WorkflowJob>;
};
const releaseWorkflowDocument = parse(releaseWorkflow) as WorkflowDocument;
const pullRequestWorkflowDocument = parse(pullRequestWorkflow) as WorkflowDocument;
const releaseSafetyDocument = parse(releaseSafetyManifest);

const expectedPublishCondition =
  "github.ref == 'refs/heads/master' && (github.event_name != 'workflow_dispatch' || github.event.inputs.rollback_sha == '')";
const expectedDeployCondition =
  "always() && github.ref == 'refs/heads/master' && (needs.publish.result == 'success' || (needs.publish.result == 'skipped' && github.event_name == 'workflow_dispatch' && github.event.inputs.rollback_sha != ''))";
const expectedRollbackCondition =
  "${{ failure() && steps.capture_previous.outcome == 'success' && steps.deploy_candidate.outcome != 'skipped' }}";

const activeShellLines = (run: string | undefined): string[] =>
  (run ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

const releaseSafetyStructureViolations = (document: WorkflowDocument): string[] => {
  const violations: string[] = [];
  const publishJob = document.jobs?.publish;
  const deployJob = document.jobs?.['deploy-dev'];
  const deploySteps = deployJob?.steps ?? [];
  const stepsById = new Map(deploySteps.filter((step) => step.id).map((step) => [step.id!, step]));

  if (publishJob?.if !== expectedPublishCondition) violations.push('publish condition');
  if (deployJob?.if !== expectedDeployCondition) violations.push('deploy condition');
  for (const id of [
    'validate_deploy_target',
    'capture_previous',
    'deploy_candidate',
    'rollback_previous',
  ]) {
    if (deploySteps.filter((step) => step.id === id).length !== 1) {
      violations.push(`step id count: ${id}`);
    }
  }

  const rollbackStep = stepsById.get('rollback_previous');
  if (rollbackStep?.if !== expectedRollbackCondition) violations.push('rollback condition');
  if (rollbackStep?.['continue-on-error'] === true) violations.push('rollback continue-on-error');

  const captureLines = activeShellLines(stepsById.get('capture_previous')?.run);
  if (
    !captureLines.some((line) =>
      /^previousImageRef="\$\(docker inspect --format '\{\{\.Config\.Image\}\}' fusion-ui/.test(
        line,
      ),
    )
  ) {
    violations.push('capture image ref command');
  }
  if (
    !captureLines.some((line) =>
      /^previousImageId="\$\(docker inspect --format '\{\{\.Image\}\}' fusion-ui/.test(line),
    )
  ) {
    violations.push('capture image id command');
  }
  if (
    !captureLines.some(
      (line) => line === 'if ! [[ "$previousImageSha" =~ ^[0-9a-f]{40}$ ]]; then',
    )
  ) {
    violations.push('capture immutable sha validation');
  }
  if (
    !captureLines.some(
      (line) => line === 'if ! [[ "$previousImageId" =~ ^sha256:[0-9a-f]{64}$ ]]; then',
    )
  ) {
    violations.push('capture image id validation');
  }

  const rollbackLines = activeShellLines(rollbackStep?.run);
  for (const requiredLine of [
    'if [ "$runningImageRef" != "$previousImageRef" ]; then',
    'if [ "$runningImageId" != "$previousImageId" ]; then',
  ]) {
    if (!rollbackLines.includes(requiredLine)) violations.push(`rollback command: ${requiredLine}`);
  }
  if (
    !rollbackLines.some(
      (line) =>
        line.startsWith('if docker exec fusion-ui node -e ') &&
        line.includes('fetch("http://127.0.0.1:3000/"'),
    )
  ) {
    violations.push('rollback container smoke command');
  }

  return violations;
};

const getSingleDeployStep = (name: string): WorkflowStep => {
  const steps = (releaseWorkflowDocument.jobs?.['deploy-dev']?.steps ?? []).filter(
    (step) => step.name === name,
  );
  expect(steps, `${name} 必须是唯一的真实 workflow step，注释或普通文本不能替代`).toHaveLength(1);
  return steps[0];
};

const getDeployStepIndex = (name: string): number => {
  const steps = releaseWorkflowDocument.jobs?.['deploy-dev']?.steps ?? [];
  const matches = steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.name === name);
  expect(matches, `${name} 必须是唯一的真实 workflow step，注释或普通文本不能替代`).toHaveLength(1);
  return matches[0].index;
};

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
  it('发布安全 manifest 精确映射真实 workflow 角色', () => {
    expect(releaseSafetyDocument).toEqual({
      version: '1',
      workflow: '.github/workflows/build-and-deploy.yml',
      contract_test: {
        path: '.github/scripts/release-safety-contract.sh',
        pr_step: 'release_safety_contract',
      },
      jobs: { prepare: null, publish: 'publish', deploy: 'deploy-dev', finalize: null },
      steps: {
        target: 'validate_deploy_target',
        target_job: 'deploy',
        capture: 'capture_previous',
        migrations: [],
        candidate: 'deploy_candidate',
        verify: ['verify_candidate', 'verify_browser_smoke'],
        rollback: 'rollback_previous',
        cleanup: 'cleanup_old_images',
        failure: null,
        finalize: null,
        finalize_failure: null,
      },
      needs: { publish: [], deploy: ['publish'], finalize: [] },
      conditions: {
        prepare: null,
        publish: expectedPublishCondition,
        deploy: expectedDeployCondition,
        migration: null,
        rollback:
          "failure() && steps.capture_previous.outcome == 'success' && steps.deploy_candidate.outcome != 'skipped'",
        cleanup: 'success()',
        failure: null,
        finalize: null,
        finalize_failure: null,
      },
    });

    const prSteps = pullRequestWorkflowDocument.jobs?.build?.steps ?? [];
    const contractSteps = prSteps.filter((step) => step.id === 'release_safety_contract');
    expect(contractSteps).toHaveLength(1);
    expect(contractSteps?.[0].id).toBe('release_safety_contract');
    expect(contractSteps?.[0].run).toBe('.github/scripts/release-safety-contract.sh');
    expect(contractSteps?.[0].if).toBeUndefined();
    expect(contractSteps?.[0]['continue-on-error']).toBeUndefined();
    expect(releaseSafetyContract.trimEnd().split(/\r?\n/)).toEqual([
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'exec npx vitest run src/scripts/buildAndDeployWorkflow.test.ts',
    ]);
    expect(statSync(releaseSafetyContractPath).mode & 0o777).toBe(0o755);

    const setupNodeStep = prSteps.find((step) => step.name === 'Setup Node.js');
    const installStep = prSteps.find((step) => step.name === 'Install dependencies');
    const dockerStep = prSteps.find((step) => step.name === 'Test and build Docker targets');
    expect(setupNodeStep?.uses).toBe('actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38');
    expect(setupNodeStep?.with).toEqual({ 'node-version': '20', cache: 'npm' });
    expect(setupNodeStep?.id).toBeUndefined();
    expect(setupNodeStep?.if).toBeUndefined();
    expect(setupNodeStep?.['continue-on-error']).toBeUndefined();
    expect(installStep?.run?.trim()).toBe('npm ci --no-audit --no-fund');
    expect(installStep?.id).toBeUndefined();
    expect(installStep?.if).toBeUndefined();
    expect(installStep?.['continue-on-error']).toBeUndefined();
    expect(dockerStep?.id).toBeUndefined();
    expect(prSteps.indexOf(setupNodeStep!)).toBeLessThan(prSteps.indexOf(installStep!));
    expect(prSteps.indexOf(installStep!)).toBeLessThan(prSteps.indexOf(contractSteps[0]));
    expect(prSteps.indexOf(contractSteps[0])).toBeLessThan(prSteps.indexOf(dockerStep!));

    const deploySteps = releaseWorkflowDocument.jobs?.['deploy-dev']?.steps ?? [];
    const expectedRoleIds = [
      'validate_deploy_target',
      'capture_previous',
      'deploy_candidate',
      'verify_candidate',
      'verify_browser_smoke',
      'rollback_previous',
      'cleanup_old_images',
    ];
    for (const id of expectedRoleIds) {
      expect(deploySteps.filter((step) => step.id === id), `${id} 必须唯一映射真实 step`).toHaveLength(1);
    }
  });

  it('PR CI 与 master 发布使用互斥触发器', () => {
    expect(pullRequestWorkflow).toContain('pull_request:');
    expect(pullRequestWorkflow).toContain('branches: [master]');
    expect(pullRequestWorkflow).not.toContain('  push:');
    expect(pullRequestWorkflow).not.toContain('workflow_dispatch:');

    expect(releaseWorkflow).toContain('push:');
    expect(releaseWorkflow).toContain('branches: [master]');
    expect(releaseWorkflow).toContain('workflow_dispatch:');
    expect(releaseWorkflow).not.toContain('pull_request:');
    expect(releaseWorkflowDocument.jobs?.publish?.if).toContain(
      "github.ref == 'refs/heads/master'",
    );
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
    expect(releaseWorkflowDocument.jobs?.['deploy-dev']?.if).toContain(
      "github.ref == 'refs/heads/master'",
    );
    expect(deployDevBlock).toContain('${{ needs.publish.outputs.started_at }}');
    expect(deployDevBlock).toContain('${{ needs.publish.outputs.runner_name }}');
    expect(deployDevBlock).toContain('persist-credentials: false');
  });

  it('手动回滚输入与实际部署 SHA 使用事件类型安全表达式', () => {
    expect(releaseWorkflow).toContain('rollback_sha:');
    expect(releaseWorkflow).toContain('rollback_reason:');
    expect(releaseWorkflow).not.toMatch(/\$\{\{\s*inputs\./);
    expect(releaseWorkflowDocument.env?.ROLLBACK_SHA).toBe(
      "${{ github.event_name == 'workflow_dispatch' && github.event.inputs.rollback_sha || '' }}",
    );
    expect(releaseWorkflowDocument.env?.ROLLBACK_REASON).toBe(
      "${{ github.event_name == 'workflow_dispatch' && github.event.inputs.rollback_reason || '' }}",
    );
    expect(releaseWorkflowDocument.env?.DEPLOY_TARGET_SHA).toBe(
      "${{ github.event_name == 'workflow_dispatch' && github.event.inputs.rollback_sha || github.sha }}",
    );

    const rollbackShaDescription =
      releaseWorkflowDocument.on?.workflow_dispatch?.inputs?.rollback_sha?.description ?? '';
    expect(rollbackShaDescription).toContain('已知不可变镜像 SHA');
    expect(rollbackShaDescription).toContain('操作方负责确认目标');
    expect(rollbackShaDescription).not.toMatch(/历史\s*master|已成功发布/);
  });

  it('发布、部署与回滚条件必须保持精确的结构化语义', () => {
    expect(releaseWorkflowDocument.jobs?.publish?.if).toBe(expectedPublishCondition);
    expect(releaseWorkflowDocument.jobs?.['deploy-dev']?.if).toBe(expectedDeployCondition);
    expect(getSingleDeployStep('Rollback previous deployment').if).toBe(expectedRollbackCondition);
    expect(releaseSafetyStructureViolations(releaseWorkflowDocument)).toEqual([]);
  });

  it('success 旁路、注释与 echo 伪造不能冒充安全门禁', () => {
    const successBypass = parse(releaseWorkflow) as WorkflowDocument;
    expect(successBypass.jobs?.publish).toBeDefined();
    expect(successBypass.jobs?.['deploy-dev']).toBeDefined();
    successBypass.jobs!.publish.if = `${expectedPublishCondition} || success()`;
    successBypass.jobs!['deploy-dev'].if = `${expectedDeployCondition} || success()`;
    const bypassRollback = successBypass.jobs?.['deploy-dev']?.steps?.find(
      (step) => step.id === 'rollback_previous',
    );
    expect(bypassRollback).toBeDefined();
    bypassRollback!.if =
      "${{ (failure() && steps.capture_previous.outcome == 'success' && steps.deploy_candidate.outcome != 'skipped') || success() }}";
    successBypass.jobs!['deploy-dev'].steps!.push({
      id: 'rollback_previous',
      name: '伪造回滚步骤',
      run: 'echo "failure() && capture_previous && deploy_candidate"',
    });
    expect(releaseSafetyStructureViolations(successBypass)).toEqual(
      expect.arrayContaining([
        'publish condition',
        'deploy condition',
        'rollback condition',
        'step id count: rollback_previous',
      ]),
    );

    const opaquePublishGuard = parse(releaseWorkflow) as WorkflowDocument;
    opaquePublishGuard.jobs!.publish.if =
      "github.ref == 'refs/heads/master' && !(github.event_name == 'workflow_dispatch' && github.event.inputs.rollback_sha != '')";
    expect(releaseSafetyStructureViolations(opaquePublishGuard)).toContain('publish condition');

    const missingSkippedGuard = parse(releaseWorkflow) as WorkflowDocument;
    missingSkippedGuard.jobs!['deploy-dev'].if = expectedDeployCondition.replace(
      "needs.publish.result == 'skipped' && ",
      '',
    );
    expect(releaseSafetyStructureViolations(missingSkippedGuard)).toContain('deploy condition');

    const decoyCommands = parse(releaseWorkflow) as WorkflowDocument;
    const decoyCapture = decoyCommands.jobs?.['deploy-dev']?.steps?.find(
      (step) => step.id === 'capture_previous',
    );
    const decoyRollback = decoyCommands.jobs?.['deploy-dev']?.steps?.find(
      (step) => step.id === 'rollback_previous',
    );
    expect(decoyCapture?.run).toBeTypeOf('string');
    expect(decoyRollback?.run).toBeTypeOf('string');
    decoyCapture!.run = decoyCapture!.run!.replace(
      'if ! [[ "$previousImageId" =~ ^sha256:[0-9a-f]{64}$ ]]; then',
      '# if ! [[ "$previousImageId" =~ ^sha256:[0-9a-f]{64}$ ]]; then\n' +
        'echo \'if ! [[ "$previousImageId" =~ ^sha256:[0-9a-f]{64}$ ]]; then\'',
    );
    decoyRollback!.run = decoyRollback!.run!.replace(
      'if [ "$runningImageId" != "$previousImageId" ]; then',
      '# if [ "$runningImageId" != "$previousImageId" ]; then\n' +
        'echo \'if [ "$runningImageId" != "$previousImageId" ]; then\'',
    );
    expect(releaseSafetyStructureViolations(decoyCommands)).toEqual(
      expect.arrayContaining([
        'capture image id validation',
        'rollback command: if [ "$runningImageId" != "$previousImageId" ]; then',
      ]),
    );
  });

  it('部署前真实校验回滚 SHA 与原因，且原因不插值进 shell', () => {
    const validationStep = getSingleDeployStep('Validate deployment target');
    expect(validationStep.id).toBe('validate_deploy_target');
    expect(validationStep.run).toBeTypeOf('string');
    expect(validationStep.run).toContain('rollbackSha="$ROLLBACK_SHA"');
    expect(validationStep.run).toContain('rollbackReason="$ROLLBACK_REASON"');
    expect(validationStep.run).toContain('^[0-9a-f]{40}$');
    expect(validationStep.run).toContain('[^[:space:]]');
    expect(validationStep.run).toContain('if [ -z "$rollbackReason" ] || ! [[');
    expect(validationStep.run).not.toContain('github.event.inputs.rollback_reason');

    getSingleDeployStep('Configure Docker credential directory');
    expect(getDeployStepIndex('Validate deployment target')).toBeLessThan(
      getDeployStepIndex('Configure Docker credential directory'),
    );

    const runValidation = (rollbackSha: string, rollbackReason: string, deployTargetSha: string) =>
      spawnSync('bash', ['-eu', '-o', 'pipefail', '-c', validationStep.run!], {
        encoding: 'utf8',
        env: {
          ...process.env,
          ROLLBACK_SHA: rollbackSha,
          ROLLBACK_REASON: rollbackReason,
          DEPLOY_TARGET_SHA: deployTargetSha,
        },
      });
    const validSha = 'a'.repeat(40);
    expect(runValidation(validSha, '恢复稳定版本', validSha).status).toBe(0);
    expect(runValidation('A'.repeat(40), '大小写非法', 'A'.repeat(40)).status).not.toBe(0);
    expect(runValidation('a'.repeat(39), '长度非法', 'a'.repeat(39)).status).not.toBe(0);
    expect(runValidation(validSha, '', validSha).status).not.toBe(0);
    expect(runValidation(validSha, '   ', validSha).status).not.toBe(0);
    expect(runValidation('', '孤立原因', validSha).status).not.toBe(0);
  });

  it('回滚模式跳过发布 job，但仍允许部署 job 使用既有镜像', () => {
    const publishJob = releaseWorkflowDocument.jobs?.publish;
    const deployJob = releaseWorkflowDocument.jobs?.['deploy-dev'];
    expect(publishJob?.if).toContain('github.event.inputs.rollback_sha');
    expect(publishJob?.if).toContain("github.event_name != 'workflow_dispatch'");
    expect(publishJob?.if).toContain("github.event.inputs.rollback_sha == ''");
    expect(deployJob?.if).toContain('always()');
    expect(deployJob?.if).toContain("needs.publish.result == 'success'");
    expect(deployJob?.if).toContain("needs.publish.result == 'skipped'");
    expect(deployJob?.if).toContain('github.event.inputs.rollback_sha');

    expect(releasePublishBlock).toContain('Login to ACR');
    expect(releasePublishBlock).toContain('Test and build Docker image');
    expect(releasePublishBlock).toContain('Push Docker image');
  });

  it('候选部署前 fail-closed 捕获旧容器镜像引用与镜像 ID', () => {
    const captureStep = getSingleDeployStep('Capture current deployment');
    const candidateStep = getSingleDeployStep('Deploy candidate image');
    expect(captureStep.id).toBe('capture_previous');
    expect(candidateStep.id).toBe('deploy_candidate');
    expect(captureStep.run).toContain("docker inspect --format '{{.Config.Image}}' fusion-ui");
    expect(captureStep.run).toContain("docker inspect --format '{{.Image}}' fusion-ui");
    expect(captureStep.run).toContain('previousImagePrefix="${IMAGE_NAME}:"');
    expect(captureStep.run).toContain('previousImageSha="${previousImageRef#"$previousImagePrefix"}"');
    expect(captureStep.run).toContain('if ! [[ "$previousImageSha" =~ ^[0-9a-f]{40}$ ]]; then');
    expect(captureStep.run).toContain('if ! [[ "$previousImageId" =~ ^sha256:[0-9a-f]{64}$ ]]; then');
    expect(captureStep.run).toContain('exit 1');
    expect(getDeployStepIndex('Capture current deployment')).toBeLessThan(
      getDeployStepIndex('Deploy candidate image'),
    );

    const fakeDocker = `
docker() {
  if [ "$1" = "inspect" ] && [ "$2" = "--format" ]; then
    case "$3" in
      '{{.Config.Image}}') printf '%s\\n' "$FAKE_PREVIOUS_IMAGE_REF" ;;
      '{{.Image}}') printf '%s\\n' "$FAKE_PREVIOUS_IMAGE_ID" ;;
      *) return 1 ;;
    esac
    return 0
  fi
  if [ "$1" = "ps" ]; then return 0; fi
  return 1
}
`;
    const imageName = releaseWorkflowDocument.env?.IMAGE_NAME ?? '';
    const validSha = 'a'.repeat(40);
    const validId = `sha256:${'b'.repeat(64)}`;
    const runCapture = (imageRef: string, imageId: string) =>
      spawnSync('bash', ['-eu', '-o', 'pipefail', '-c', `${fakeDocker}\n${captureStep.run}`], {
        encoding: 'utf8',
        env: {
          ...process.env,
          IMAGE_NAME: imageName,
          FAKE_PREVIOUS_IMAGE_REF: imageRef,
          FAKE_PREVIOUS_IMAGE_ID: imageId,
          GITHUB_OUTPUT: '/dev/null',
        },
      });

    expect(runCapture(`${imageName}:${validSha}`, validId).status).toBe(0);
    for (const invalidRef of [
      '',
      `${imageName}:latest`,
      `${imageName}:${'A'.repeat(40)}`,
      `registry.invalid/fusion-ui:${validSha}`,
      `${imageName}:${validSha}-suffix`,
    ]) {
      expect(runCapture(invalidRef, validId).status, `必须拒绝旧镜像引用 ${invalidRef}`).not.toBe(0);
    }
    for (const invalidId of [
      '',
      'b'.repeat(64),
      `sha256:${'b'.repeat(63)}`,
      `sha256:${'B'.repeat(64)}`,
      `md5:${'b'.repeat(64)}`,
    ]) {
      expect(runCapture(`${imageName}:${validSha}`, invalidId).status, `必须拒绝旧镜像 ID ${invalidId}`).not.toBe(0);
    }
  });

  it('候选部署统一使用经过校验的实际目标 SHA', () => {
    const candidateStep = getSingleDeployStep('Deploy candidate image');
    const smokeStep = getSingleDeployStep('Smoke check candidate deployment');
    expect(candidateStep.run).toContain('${IMAGE_NAME}:${DEPLOY_TARGET_SHA}');
    expect(candidateStep.run).not.toContain('${{ github.sha }}');
    expect(smokeStep.run).toContain('expectedImage="${IMAGE_NAME}:${DEPLOY_TARGET_SHA}"');
    expect(smokeStep.run).not.toContain('${{ github.sha }}');
    expect(smokeStep.run).toContain("docker image inspect --format '{{.Id}}' \"$expectedImage\"");
    expect(smokeStep.run).toContain("docker inspect --format '{{.Image}}' fusion-ui");
    expect(smokeStep.run).toContain('if [ "$runningImageId" != "$expectedImageId" ]; then');
  });

  it('候选链路失败后以严格 guard 回滚，且成功回滚不掩盖原失败', () => {
    const rollbackStep = getSingleDeployStep('Rollback previous deployment');
    expect(rollbackStep.id).toBe('rollback_previous');
    expect(rollbackStep.if).toContain('failure()');
    expect(rollbackStep.if).toContain("steps.capture_previous.outcome == 'success'");
    expect(rollbackStep.if).toContain("steps.deploy_candidate.outcome != 'skipped'");
    expect(rollbackStep['continue-on-error']).not.toBe(true);

    const browserSmokeStep = getSingleDeployStep('Run dev browser smoke');
    expect(getDeployStepIndex(browserSmokeStep.name!)).toBeLessThan(
      getDeployStepIndex(rollbackStep.name!),
    );
  });

  it('自动回滚同时验证旧镜像引用、镜像 ID 与容器内 HTTP smoke', () => {
    const rollbackStep = getSingleDeployStep('Rollback previous deployment');
    expect(rollbackStep.run).toContain('${{ steps.capture_previous.outputs.previous_image_ref }}');
    expect(rollbackStep.run).toContain('${{ steps.capture_previous.outputs.previous_image_id }}');
    expect(rollbackStep.run).toContain("docker inspect --format '{{.Config.Image}}' fusion-ui");
    expect(rollbackStep.run).toContain("docker inspect --format '{{.Image}}' fusion-ui");
    expect(rollbackStep.run).toContain('if [ "$runningImageRef" != "$previousImageRef" ]; then');
    expect(rollbackStep.run).toContain('if [ "$runningImageId" != "$previousImageId" ]; then');
    expect(rollbackStep.run).toContain('docker exec fusion-ui node -e');
    expect(rollbackStep.run).toContain('fetch("http://127.0.0.1:3000/"');
    expect(rollbackStep.run).toContain('rollback smoke check failed');
  });

  it('旧镜像只在候选链路全部成功后清理', () => {
    const cleanupStep = getSingleDeployStep('Cleanup old images');
    expect(cleanupStep.if).toBe('success()');
    expect(cleanupStep.run).toContain('${IMAGE_NAME}:${DEPLOY_TARGET_SHA}');
    expect(cleanupStep.run).not.toContain('${{ github.sha }}');
  });

  it('部署指标与通知记录实际 DEPLOY_TARGET_SHA', () => {
    const metricsStep = getSingleDeployStep('Push CI/CD metrics');
    const notificationStep = getSingleDeployStep('通知飞书(部署结果)');
    expect(metricsStep.run).toContain('${{ env.IMAGE_NAME }}:${{ env.DEPLOY_TARGET_SHA }}');
    expect(metricsStep.run).toContain('${{ env.DEPLOY_TARGET_SHA }}');
    expect(metricsStep.run).not.toContain('${{ github.sha }}');
    expect(notificationStep.run).toContain('SHORT_SHA="${DEPLOY_TARGET_SHA:0:7}"');
    expect(notificationStep.run).not.toContain('SHORT_SHA="${GITHUB_SHA:0:7}"');
    expect(notificationStep.run).toContain('os.environ.get("ROLLBACK_REASON", "")');
    expect(notificationStep.run).not.toContain('github.event.inputs.rollback_reason');
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
    const smokeRun = getSingleDeployStep('Smoke check candidate deployment').run;
    expect(smokeRun).toBeTypeOf('string');

    const executableLines = smokeRun!
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    const expectedImageLine = 'expectedImage="${IMAGE_NAME}:${DEPLOY_TARGET_SHA}"';
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
