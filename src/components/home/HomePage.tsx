import { useCallback, memo, useEffect, useMemo, useRef, useState } from "react";
import { useAppSelector } from "@/redux/hooks";
import { useToast } from "@/components/ui/toast";

const ALL_EXAMPLES = [
  '写一个 Python 快速排序函数',
  '帮我 review 这段代码',
  '如何用 Docker 部署 FastAPI 服务',
  '解释 React useEffect 的执行时机',
  '写一篇关于 AI 发展的短文',
  '帮我润色这段产品介绍',
  '写一封正式的商务邮件',
  '给这篇文章起 5 个标题',
  '分析这段用户行为数据的趋势',
  '对比 PostgreSQL 和 MongoDB 的适用场景',
  '解释一下量子计算的基本原理',
  '帮我梳理这个项目的架构问题',
  '构思一个科幻短篇故事的开头',
  '设计一套移动端 App 的配色方案',
  '帮我想 10 个产品功能点子',
  '写一段产品发布会的开场白',
];

interface HomePageProps {
  onNewChat?: () => void;
  onSendMessage: (content: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onSendMessage }) => {
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { toast } = useToast();
  const [pendingExample, setPendingExample] = useState<string | null>(null);
  const pendingResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const randomExamples = useMemo(() => {
    return [...ALL_EXAMPLES].sort(() => Math.random() - 0.5).slice(0, 8);
  }, []);

  useEffect(() => {
    return () => {
      if (pendingResetRef.current) {
        clearTimeout(pendingResetRef.current);
      }
    };
  }, []);

  const handleExampleClick = useCallback((message: string) => {
    if (pendingExample) {
      return;
    }

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

    setPendingExample(message);
    if (pendingResetRef.current) {
      clearTimeout(pendingResetRef.current);
    }

    pendingResetRef.current = setTimeout(() => {
      setPendingExample((current) => (current === message ? null : current));
      pendingResetRef.current = null;
    }, 4000);

    void Promise.resolve(onSendMessage(message)).catch(() => {
      setPendingExample((current) => (current === message ? null : current));
      if (pendingResetRef.current) {
        clearTimeout(pendingResetRef.current);
        pendingResetRef.current = null;
      }
    });
  }, [isAuthenticated, onSendMessage, pendingExample, toast]);

  if (pendingExample) {
    return (
      <div className="flex flex-col space-y-8 pb-8 px-4 max-w-5xl mx-auto w-full h-full overflow-y-auto">
        <div className="pt-8 text-center">
          <h1 className="text-3xl font-bold mb-2">正在开始这轮对话</h1>
          <p className="text-muted-foreground">正在创建会话并等待 AI 开始回复。</p>
        </div>

        <div className="max-w-3xl mx-auto w-full space-y-4">
          <div className="ml-auto max-w-2xl rounded-3xl bg-primary/10 px-5 py-4 text-sm">
            {pendingExample}
          </div>
          <div className="max-w-2xl rounded-3xl border border-border/60 bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm">
            AI 正在准备回复...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-4 pb-32">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold text-foreground mb-8 text-center">
          今天我能帮你做什么？
        </h1>

        <div className="flex flex-wrap gap-2 justify-center">
          {randomExamples.map((example) => (
            <button
              key={example}
              onClick={() => handleExampleClick(example)}
              disabled={Boolean(pendingExample)}
              className="px-4 py-2 rounded-full border border-border text-sm text-muted-foreground
                         hover:bg-muted/60 hover:text-foreground hover:border-border
                         transition-colors cursor-pointer"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default memo(HomePage);
