// 一个非常简单的token计数估算工具
// 注意：这只是一个粗略估计，实际token数量需要由模型提供方确定

// 不同语言平均每个单词的token数估算
const TOKEN_ESTIMATIONS: Record<string, number> = {
    english: 1.3, // 英语约1.3个token/单词
    chinese: 1.5, // 中文约1.5个token/字符
    code: 0.75,  // 代码约0.75个token/字符
  };
  
  // 检测文本是否主要是中文
  function isMainlyChinese(text: string): boolean {
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g)?.length || 0;
    return chineseChars / text.length > 0.5;
  }
  
  // 检测文本是否主要是代码
  function isMainlyCode(text: string): boolean {
    // 简单检测是否包含常见代码模式
    const codePatterns = [
      /\b(function|const|let|var|if|else|for|while|class|import|export|return)\b/g,
      /[{}[\]();]/g,
      /\b(\w+)\s*\([^)]*\)/g,
    ];
    
    let codeScore = 0;
    codePatterns.forEach(pattern => {
      const matches = text.match(pattern)?.length || 0;
      codeScore += matches;
    });
    
    return codeScore > text.length * 0.05;
  }
  
  // 估算token数
  export function estimateTokens(text: string): number {
    if (!text) return 0;
    
    // 确定文本类型
    let multiplier = TOKEN_ESTIMATIONS.english;
    if (isMainlyChinese(text)) {
      multiplier = TOKEN_ESTIMATIONS.chinese;
    } else if (isMainlyCode(text)) {
      multiplier = TOKEN_ESTIMATIONS.code;
    }
    
    // 计算单词/字符数
    return Math.ceil(text.length * multiplier);
  }
  
  // 估算对话的总token数
  export function estimateConversationTokens(messages: Array<{role: string, content: string}>): number {
    // 基础token用于角色和模型处理
    const baseTokens = messages.length * 4;
    
    // 计算内容token
    const contentTokens = messages.reduce((total, message) => {
      return total + estimateTokens(message.content);
    }, 0);
    
    return baseTokens + contentTokens;
  }
  
  // 不同模型的token限制
  export const MODEL_TOKEN_LIMITS: Record<string, number> = {
    'ernie-bot-4': 4096,
    'qwen-max': 8192,
    'claude-3-5-sonnet': 16384,
    'deepseek-chat': 8192,
  };