import type { RuntimeConfigPayload } from "@/lib/api/runtimeConfig";

export interface RuntimeConfigPresentation {
  title: string;
  category: string;
  description: string;
  impact: string;
  risk: string;
}

const promptTemplateConfig: Record<string, RuntimeConfigPresentation> = {
  app_identity: {
    title: "应用身份 Prompt",
    category: "Prompt 模板",
    description: "定义 Fusion 在回答中如何介绍自己的身份、能力边界和默认语气。",
    impact: "影响所有对话的基础身份表达。",
    risk: "错误配置可能导致模型身份表述混乱。",
  },
  tool_usage_contract: {
    title: "工具使用边界 Prompt",
    category: "Prompt 模板",
    description: "约束模型如何判断是否调用工具，以及调用工具时如何解释能力边界。",
    impact: "影响工具调用前后的说明和决策口径。",
    risk: "错误配置可能导致过度调用工具或不该调用时仍调用。",
  },
  no_tool_network_boundary: {
    title: "无联网模型提示",
    category: "Prompt 模板",
    description: "当模型不支持联网工具时，用来约束模型说明实时信息不可验证。",
    impact: "影响无工具模型回答实时问题时的提示方式。",
    risk: "错误配置可能让用户误以为模型已经检索最新信息。",
  },
  no_vision_file_boundary: {
    title: "无视觉模型提示",
    category: "Prompt 模板",
    description: "当模型不支持视觉或文件能力时，用来说明图片、文件处理边界。",
    impact: "影响无视觉模型处理图片或文件请求时的解释。",
    risk: "错误配置可能造成能力承诺和实际能力不一致。",
  },
  url_read_tool_description: {
    title: "网页读取工具说明",
    category: "工具说明",
    description: "描述网页读取工具的能力、适用场景和返回内容边界。",
    impact: "影响模型选择读取网页时的判断。",
    risk: "错误配置可能导致网页读取过少、过多或解释不清。",
  },
  limit_summary: {
    title: "上下文触顶总结 Prompt",
    category: "Prompt 模板",
    description: "当上下文接近限制时，用来总结当前任务状态和后续继续方式。",
    impact: "影响长对话或长任务触顶时的连续性。",
    risk: "错误配置可能导致任务状态丢失或总结质量下降。",
  },
  continuation_system: {
    title: "续写系统 Prompt",
    category: "Prompt 模板",
    description: "断点续写或继续生成时注入的系统提示。",
    impact: "影响长回答继续输出时的上下文衔接。",
    risk: "错误配置可能导致续写偏题或重复。",
  },
  generate_title: {
    title: "标题生成 Prompt",
    category: "Prompt 模板",
    description: "用于根据对话内容生成会话标题。",
    impact: "影响新对话标题自动生成。",
    risk: "错误配置会直接影响标题质量和历史会话可识别性。",
  },
  generate_suggested_questions: {
    title: "推荐问题 Prompt",
    category: "Prompt 模板",
    description: "用于在回答结束后生成后续可追问问题。",
    impact: "影响回答后的推荐问题质量和相关性。",
    risk: "错误配置可能让推荐问题变得空泛或偏离当前上下文。",
  },
  file_analysis: {
    title: "文件分析 Prompt",
    category: "Prompt 模板",
    description: "用于指导模型分析上传文件内容。",
    impact: "影响文件理解、摘要和结构化分析质量。",
    risk: "错误配置可能导致文件要点遗漏或分析方向错误。",
  },
  file_content_enhancement: {
    title: "文件内容增强 Prompt",
    category: "Prompt 模板",
    description: "用于将文件解析结果整理成更适合模型消费的上下文。",
    impact: "影响上传文件进入对话上下文后的可读性。",
    risk: "错误配置可能导致文件上下文冗余或关键信息丢失。",
  },
};

const knownConfigs: Record<string, RuntimeConfigPresentation> = {
  "agent_strategy:default": {
    title: "Agent 执行策略",
    category: "Agent 策略",
    description: "控制搜索、深读、来源排序和工具上下文等默认决策。",
    impact: "影响联网回答的资料查找深度、速度和依据质量。",
    risk: "错误配置可能让 Agent 搜了不读、读太多或选择低价值来源。",
  },
  "model_presentation:default": {
    title: "模型能力展示",
    category: "模型展示",
    description: "控制模型选择器里的能力标签、推荐说明和评分展示。",
    impact: "影响用户选择模型时看到的能力解释。",
    risk: "错误配置可能让用户误判模型能力或成本倾向。",
  },
};

const fieldLabels: Record<string, string> = {
  template: "模板内容",
  max_searches: "搜索预算",
  max_search_results: "搜索结果数",
  max_reads: "深读预算",
  read_budget: "深读预算",
  search_budget: "搜索预算",
  title: "标题",
  description: "说明",
  score: "评分",
};

function humanizeKey(value: string): string {
  return value.replace(/[_-]+/g, " ").trim() || value;
}

function labelForField(key: string): string {
  return fieldLabels[key] || humanizeKey(key);
}

function describeValue(key: string, value: unknown): string {
  const label = labelForField(key);
  if (typeof value === "string") {
    return `${label}：${value.length} 字`;
  }
  if (typeof value === "number") {
    return `${label}：${value}`;
  }
  if (typeof value === "boolean") {
    return `${label}：${value ? "已开启" : "已关闭"}`;
  }
  if (Array.isArray(value)) {
    return `${label}：${value.length} 项`;
  }
  if (value && typeof value === "object") {
    return `${label}：${Object.keys(value).length} 个子项`;
  }
  return `${label}：未设置`;
}

export function getRuntimeConfigPresentation(namespace: string, key: string): RuntimeConfigPresentation {
  if (namespace === "prompt_template" && promptTemplateConfig[key]) {
    return promptTemplateConfig[key];
  }

  const known = knownConfigs[`${namespace}:${key}`];
  if (known) {
    return known;
  }

  return {
    title: humanizeKey(key),
    category: "未登记配置",
    description: "尚未登记用途说明，修改前需要先确认调用方和影响范围。",
    impact: "影响范围暂未登记。",
    risk: "建议先补充说明，再开放给非工程同学操作。",
  };
}

export function summarizeRuntimeConfigPayload(payload: RuntimeConfigPayload): string[] {
  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return ["空配置对象"];
  }

  const visibleEntries = entries.slice(0, 4).map(([key, value]) => describeValue(key, value));
  const hiddenCount = entries.length - visibleEntries.length;
  if (hiddenCount > 0) {
    visibleEntries.push(`另有 ${hiddenCount} 个字段`);
  }
  return visibleEntries;
}
