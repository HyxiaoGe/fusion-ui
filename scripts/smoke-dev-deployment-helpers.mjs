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
