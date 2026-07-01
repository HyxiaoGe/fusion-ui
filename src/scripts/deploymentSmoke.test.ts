import { describe, expect, it } from 'vitest';

import {
  buildSmokeUrl,
  resolveSmokeBaseUrl,
  validateDeploymentSmokeResult,
} from '../../scripts/smoke-dev-deployment.mjs';

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
