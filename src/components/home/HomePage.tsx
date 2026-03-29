import { useCallback, memo, useState, useEffect, useRef } from "react";
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

const ROTATE_INTERVAL = 15000; // 15 秒轮换

interface HomePageProps {
  onNewChat?: () => void;
  onSendMessage: (content: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onSendMessage }) => {
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { toast } = useToast();
  const [examples, setExamples] = useState<string[]>(FALLBACK_EXAMPLES);
  const [loading, setLoading] = useState(true);
  const [flipping, setFlipping] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 拉取一批新问题（API 每次从 Redis 随机采样，返回不同组合）
  const loadExamples = useCallback(async (animate = false) => {
    try {
      if (animate) {
        setFlipping(true);
        // 等翻出动画完成后再换内容
        await new Promise((r) => setTimeout(r, 300));
      }
      const data = await fetchPromptExamples(9);
      if (data.examples.length > 0) {
        setExamples(data.examples.map((e) => e.question));
      }
    } catch {
      // 静默失败，保持当前内容
    } finally {
      setLoading(false);
      if (animate) {
        // 短暂延迟后触发翻入动画
        requestAnimationFrame(() => setFlipping(false));
      }
    }
  }, []);

  // 首次加载
  useEffect(() => {
    loadExamples(false);
  }, [loadExamples]);

  // 每 15 秒轮换
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      loadExamples(true);
    }, ROTATE_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadExamples]);

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

        <div
          className={`flex flex-wrap gap-3.5 justify-center transition-all duration-300 ease-in-out ${
            flipping ? 'opacity-0 scale-95 translate-y-2' : 'opacity-100 scale-100 translate-y-0'
          }`}
        >
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
                           shadow-[0_2px_8px_rgba(0,0,0,0.12)]
                           hover:bg-muted hover:text-foreground hover:shadow-[0_4px_12px_rgba(0,0,0,0.18)]
                           dark:shadow-[0_2px_8px_rgba(255,255,255,0.06)] dark:border dark:border-white/10
                           dark:hover:shadow-[0_4px_12px_rgba(255,255,255,0.1)] dark:hover:border-white/20
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
