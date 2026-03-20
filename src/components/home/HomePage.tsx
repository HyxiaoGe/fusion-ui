import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { FileText, Image, Lightbulb, MessageSquare, Plus } from "lucide-react";
import { useCallback, memo, useState } from "react";
import { useAppSelector } from "@/redux/hooks";
import { useToast } from "@/components/ui/toast";

// 统一接口定义
interface HomePageProps {
  onNewChat: () => void;
  onSendMessage: (content: string) => void;
}

// 主页组件
const HomePage: React.FC<HomePageProps> = ({ onNewChat, onSendMessage }) => {
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { toast } = useToast();
  const [pendingExample, setPendingExample] = useState<string | null>(null);

  // 处理对话示例点击的通用函数
  const handleExampleClick = useCallback(async (message: string) => {
    if (pendingExample) {
      return;
    }

    // 检查登录状态
    if (!isAuthenticated) {
      toast({
        message: "请先登录后再使用聊天功能",
        type: "warning",
        duration: 3000
      });
      if ((globalThis as any).triggerLoginDialog) {
        (globalThis as any).triggerLoginDialog();
      }
      return;
    }

    try {
      setPendingExample(message);
      await Promise.resolve(onSendMessage(message));
    } finally {
      setTimeout(() => {
        setPendingExample((current) => (current === message ? null : current));
      }, 1200);
    }
  }, [isAuthenticated, onSendMessage, pendingExample, toast]);

  return (
    <div className="flex flex-col space-y-8 pb-8 px-4 max-w-5xl mx-auto w-full h-full overflow-y-auto">
      <div className="pt-8 text-center">
        <h1 className="text-3xl font-bold mb-2">开始一个新对话</h1>
        <p className="text-muted-foreground">选择下方话题开始，或直接输入您的问题</p>
      </div>

      {/* 对话示例区域 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">对话示例</h2>
          <Button variant="ghost" size="sm" onClick={onNewChat}>
            新建对话
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                智能写作
              </CardTitle>
              <p className="text-sm text-muted-foreground">生成文章、报告、内容创作</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                disabled={Boolean(pendingExample)}
                onClick={() => handleExampleClick("写一篇科技新闻")}
              >
                写一篇科技新闻
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                disabled={Boolean(pendingExample)}
                onClick={() => handleExampleClick("生成产品说明书")}
              >
                生成产品说明书
              </Button>
            </CardContent>
          </Card>
          
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="text-base">⌨️</span>
                代码助手
              </CardTitle>
              <p className="text-sm text-muted-foreground">编程问题、调试、代码生成</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                disabled={Boolean(pendingExample)}
                onClick={() => handleExampleClick("React性能优化技巧")}
              >
                React性能优化技巧
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                disabled={Boolean(pendingExample)}
                onClick={() => handleExampleClick("Python数据分析示例")}
              >
                Python数据分析示例
              </Button>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lightbulb className="h-5 w-5" />
                数据分析
              </CardTitle>
              <p className="text-sm text-muted-foreground">数据处理、统计分析、可视化</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                disabled={Boolean(pendingExample)}
                onClick={() => handleExampleClick("分析销售数据趋势")}
              >
                分析销售数据趋势
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                disabled={Boolean(pendingExample)}
                onClick={() => handleExampleClick("创建数据可视化图表")}
              >
                创建数据可视化图表
              </Button>
            </CardContent>
          </Card>
          
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquare className="h-5 w-5" />
                知识问答
              </CardTitle>
              <p className="text-sm text-muted-foreground">概念解释、学术知识、百科</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                disabled={Boolean(pendingExample)}
                onClick={() => handleExampleClick("量子计算的基本原理")}
              >
                量子计算的基本原理
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                disabled={Boolean(pendingExample)}
                onClick={() => handleExampleClick("人工智能的发展历程")}
              >
                人工智能的发展历程
              </Button>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Image className="h-5 w-5" />
                创意写作
              </CardTitle>
              <p className="text-sm text-muted-foreground">故事创作、剧本、创意构思</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                disabled={Boolean(pendingExample)}
                onClick={() => handleExampleClick("写一个科幻短篇故事")}
              >
                写一个科幻短篇故事
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                disabled={Boolean(pendingExample)}
                onClick={() => handleExampleClick("构思一个电影情节")}
              >
                构思一个电影情节
              </Button>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="h-5 w-5" />
                工作助手
              </CardTitle>
              <p className="text-sm text-muted-foreground">计划制定、模板生成、总结</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                disabled={Boolean(pendingExample)}
                onClick={() => handleExampleClick("创建项目计划书")}
              >
                创建项目计划书
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                disabled={Boolean(pendingExample)}
                onClick={() => handleExampleClick("生成工作周报模板")}
              >
                生成工作周报模板
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default memo(HomePage);
