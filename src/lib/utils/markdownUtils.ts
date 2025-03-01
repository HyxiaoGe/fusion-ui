// 将代码块内容提取出来
export function extractCodeBlocks(markdown: string): { language: string; code: string }[] {
    const codeBlockRegex = /```([a-zA-Z0-9]*)\n([\s\S]*?)```/g;
    const codeBlocks: { language: string; code: string }[] = [];
    
    let match;
    while ((match = codeBlockRegex.exec(markdown)) !== null) {
      codeBlocks.push({
        language: match[1] || 'text',
        code: match[2].trim()
      });
    }
    
    return codeBlocks;
  }
  
  // 检测Markdown中是否有表格
  export function hasTable(markdown: string): boolean {
    const tableRegex = /\|(.+)\|(.+)\|/;
    return tableRegex.test(markdown);
  }
  
  // 检测Markdown是否包含图片链接
  export function hasImages(markdown: string): boolean {
    const imageRegex = /!\[(.*?)\]\((.*?)\)/;
    return imageRegex.test(markdown);
  }
  
  // 将URL转换为Markdown链接
  export function urlToMarkdownLink(text: string): string {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, (url) => `[${url}](${url})`);
  }
  
  // 简单格式化代码
  export function formatCode(code: string, language: string): string {
    // 这里只是简单的代码格式化逻辑
    // 实际项目中可能需要使用专业的代码格式化工具
    if (language === 'json') {
      try {
        const parsed = JSON.parse(code);
        return JSON.stringify(parsed, null, 2);
      } catch (e) {
        return code;
      }
    }
    
    return code;
  }
  
  // 为Markdown内容添加可读性增强
  export function enhanceMarkdown(markdown: string): string {
    // 将URL转换为链接
    markdown = urlToMarkdownLink(markdown);
    
    // 为代码块添加语言标记，如果没有指定
    markdown = markdown.replace(/```\n/g, '```text\n');
    
    return markdown;
  }