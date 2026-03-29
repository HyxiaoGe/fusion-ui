import { useCallback, memo, useState, useEffect } from "react";
import { useAppSelector } from "@/redux/hooks";
import { useToast } from "@/components/ui/toast";
import { fetchPromptExamples } from "@/lib/api/prompts";

// 冷启动 fallback（API 不可用时使用）
const FALLBACK_EXAMPLES = [
  '写一个 Python 快速排序函数',
  '帮我 review 这段代码',
  '如何用 Docker 部署 FastAPI 服务',
  '解释 React useEffect 的执行时机',
  '写一篇关于 AI 发展的短文',
  '帮我润色这段产品介绍',
  '写一封正式的商务邮件',
  '解释一下量子计算的基本原理',
  '对比 PostgreSQL 和 MongoDB 适用场景',
];

interface HomePageProps {
  onNewChat?: () => void;
  onSendMessage: (content: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onSendMessage }) => {
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { toast } = useToast();
  const [examples, setExamples] = useState<string[]>(FALLBACK_EXAMPLES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPromptExamples(9);
        if (!cancelled && data.examples.length > 0) {
          setExamples(data.examples.map((e) => e.question));
        }
      } catch {
        // API 不可用，保持 fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleExampleClick = useCallback((message: string) => {
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
    void Promise.resolve(onSendMessage(message));
  }, [isAuthenticated, onSendMessage, toast]);

  return (
    <div className="flex h-full items-center justify-center px-4 pb-32">
      <div className="w-full max-w-4xl mx-auto px-8">
        <h1 className="text-2xl font-bold text-foreground mb-12 text-center">
          有什么我能帮你的吗？
        </h1>

        <div className="flex flex-wrap gap-3.5 justify-center">
          {loading ? (
            Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="h-11 rounded-[20px] bg-muted/50 animate-pulse"
                style={{ width: `${140 + (i % 3) * 50}px` }}
              />
            ))
          ) : (
            examples.map((example, index) => (
              <button
                key={`${example}-${index}`}
                onClick={() => handleExampleClick(example)}
                className="px-5 py-2.5 rounded-[20px] bg-muted/50 text-[14px] leading-5 text-foreground/70 whitespace-nowrap
                           shadow-[0_1px_3px_rgba(0,0,0,0.06)]
                           hover:bg-muted hover:text-foreground hover:shadow-[0_2px_6px_rgba(0,0,0,0.1)]
                           transition-all duration-150 cursor-pointer"
              >
                {example}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(HomePage);
