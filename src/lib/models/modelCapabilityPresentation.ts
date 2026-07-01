import type { ModelInfo } from '@/lib/config/modelConfig';

export type CapabilityTone = 'success' | 'muted' | 'info' | 'warning' | 'danger';

export interface CapabilityLabel {
  key: string;
  text: string;
  tone: CapabilityTone;
}

function supportsAgentTools(model: Pick<ModelInfo, 'capabilities'>): boolean {
  const capabilities = model.capabilities || {};
  return Boolean(capabilities.agentTools || capabilities.webSearch);
}

export function buildModelCapabilityLabels(model: ModelInfo): CapabilityLabel[] {
  const capabilities = model.capabilities || {};
  const labels: CapabilityLabel[] = [
    supportsAgentTools(model)
      ? { key: 'network', text: '可联网', tone: 'success' }
      : { key: 'no-network', text: '不可联网', tone: 'muted' },
  ];

  if (capabilities.vision) {
    labels.push({ key: 'vision', text: '视觉', tone: 'info' });
  }

  if (capabilities.deepThinking) {
    labels.push({ key: 'deep-task', text: '深度任务', tone: 'warning' });
  }

  if (capabilities.fileSupport && !capabilities.vision) {
    labels.push({ key: 'file', text: '文件', tone: 'info' });
  }

  if (capabilities.imageGen) {
    labels.push({ key: 'image-gen', text: '画图', tone: 'info' });
  }

  if (model.health?.status === 'unhealthy') {
    labels.push({ key: 'unhealthy', text: '不可用', tone: 'danger' });
  }

  return labels;
}

export function buildModelCapabilityTooltip(model: ModelInfo | null): string {
  if (!model) {
    return '选择本次对话使用的模型';
  }

  const capabilities = model.capabilities || {};
  const lines = [model.name];

  lines.push(
    supportsAgentTools(model)
      ? '可按问题需要自主联网搜索和读取关键来源'
      : '不支持联网搜索，将基于模型知识回答',
  );

  lines.push(capabilities.vision ? '支持图片理解' : '不支持图片理解');
  lines.push(capabilities.deepThinking ? '适合复杂推理和深度任务' : '不支持深度思考模式');

  if (model.health?.status === 'unhealthy') {
    lines.push(`健康状态异常：${model.health.error || '服务商暂时不可用'}`);
  }

  return lines.join('\n');
}
