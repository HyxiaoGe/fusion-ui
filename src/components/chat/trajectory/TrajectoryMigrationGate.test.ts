// @vitest-environment node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('Trajectory P3 旧过程迁移闸门', () => {
  it('聊天产品装配不再挂载或引用旧过程组件和模型', () => {
    const productComposition = [
      'src/app/(app)/chat/[chatId]/page.tsx',
      'src/components/chat/ChatMessageList.tsx',
      'src/components/chat/ChatMessage.tsx',
      'src/components/chat/AssistantMessage.tsx',
      'src/components/chat/AssistantResponseStack.tsx',
    ];

    for (const path of productComposition) {
      expect(source(path), path).not.toMatch(
        /AgentRunTimeline|ExecutionProcess|buildExecutionProcessModel|executionProcessModel/,
      );
    }
  });

  it('Agent run continue 不再穿过聊天消息链路，响应栈也不接收旧过程参数', () => {
    const messageChain = [
      'src/components/chat/ChatMessageList.tsx',
      'src/components/chat/ChatMessage.tsx',
      'src/components/chat/AssistantMessage.tsx',
    ];

    for (const path of messageChain) {
      expect(source(path), path).not.toContain('onContinueAgentRun');
    }

    const responseStack = source('src/components/chat/AssistantResponseStack.tsx');
    expect(responseStack).not.toMatch(/onRetry|onContinueAgentRun|searchQueries/);
  });

  it('公共 agent 入口不再导出旧过程，旧实现仍保留到 dev 真实 run 回归后的 cleanup PR', () => {
    expect(source('src/components/chat/agent/index.ts')).not.toContain('AgentRunTimeline');
    expect(existsSync(resolve(root, 'src/components/chat/agent/AgentRunTimeline.tsx'))).toBe(true);
    expect(existsSync(resolve(root, 'src/components/chat/agent/ExecutionProcess.tsx'))).toBe(true);
    expect(existsSync(resolve(root, 'src/components/chat/agent/executionProcessModel.ts'))).toBe(true);
  });
});
