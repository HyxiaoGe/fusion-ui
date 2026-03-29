import { useCallback, memo, useState, useEffect, useRef } from "react";
import { useAppSelector } from "@/redux/hooks";
import { useToast } from "@/components/ui/toast";
import { fetchPromptExamples } from "@/lib/api/prompts";

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

const PAGE_SIZE = 9;
const ROTATE_INTERVAL = 15000;

/** Fisher-Yates 洗牌 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface HomePageProps {
  onNewChat?: () => void;
  onSendMessage: (content: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onSendMessage }) => {
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { toast } = useToast();
  const [displayItems, setDisplayItems] = useState<string[]>(FALLBACK_EXAMPLES.slice(0, PAGE_SIZE));
  const [loading, setLoading] = useState(true);
  // 逐个翻牌状态：-1 表示无动画，0~8 表示正在翻第几张
  const [flippingIndex, setFlippingIndex] = useState(-1);

  // 洗牌池：shuffle 后按顺序取，用完再 reshuffle，保证不重复
  const poolRef = useRef<string[]>([]);
  const cursorRef = useRef(0);

  const getNextBatch = useCallback((): string[] => {
    const pool = poolRef.current;
    if (pool.length === 0) return FALLBACK_EXAMPLES.slice(0, PAGE_SIZE);

    // 剩余不够一批，reshuffle
    if (cursorRef.current + PAGE_SIZE > pool.length) {
      poolRef.current = shuffle(pool);
      cursorRef.current = 0;
    }

    const batch = poolRef.current.slice(cursorRef.current, cursorRef.current + PAGE_SIZE);
    cursorRef.current += PAGE_SIZE;
    return batch;
  }, []);

  // 首次加载：拿全量问题池
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 拿全量（limit 设大一些）
        const data = await fetchPromptExamples(50);
        if (!cancelled && data.examples.length > 0) {
          const all = data.examples.map((e) => e.question);
          poolRef.current = shuffle(all);
          cursorRef.current = 0;
          setDisplayItems(poolRef.current.slice(0, PAGE_SIZE));
          cursorRef.current = PAGE_SIZE;
        }
      } catch {
        // fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 逐个翻牌动画
  const doFlipTransition = useCallback(() => {
    const nextBatch = getNextBatch();

    // 依次翻出每张牌（每张间隔 80ms）
    for (let i = 0; i < PAGE_SIZE; i++) {
      setTimeout(() => {
        setFlippingIndex(i);
      }, i * 80);

      // 翻到一半时换内容，再翻回来
      setTimeout(() => {
        setDisplayItems((prev) => {
          const updated = [...prev];
          updated[i] = nextBatch[i] ?? prev[i];
          return updated;
        });
        setFlippingIndex((cur) => (cur === i ? -1 : cur));
      }, i * 80 + 200);
    }

    // 全部完成后重置
    setTimeout(() => {
      setFlippingIndex(-1);
    }, PAGE_SIZE * 80 + 300);
  }, [getNextBatch]);

  // 定时轮换
  useEffect(() => {
    if (loading) return;
    const timer = setInterval(doFlipTransition, ROTATE_INTERVAL);
    return () => clearInterval(timer);
  }, [loading, doFlipTransition]);

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

        <div className="flex flex-wrap gap-3.5 justify-center" style={{ perspective: '800px' }}>
          {loading ? (
            Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="h-11 rounded-[20px] bg-muted/50 animate-pulse"
                style={{ width: `${140 + (i % 3) * 50}px` }}
              />
            ))
          ) : (
            displayItems.map((example, index) => (
              <button
                key={`slot-${index}`}
                onClick={() => handleExampleClick(example)}
                className="px-5 py-2.5 rounded-[20px] bg-muted/50 text-[14px] leading-5 text-foreground/70 whitespace-nowrap
                           shadow-[0_2px_8px_rgba(0,0,0,0.12)]
                           hover:bg-muted hover:text-foreground hover:shadow-[0_4px_12px_rgba(0,0,0,0.18)]
                           dark:shadow-[0_2px_8px_rgba(255,255,255,0.06)] dark:border dark:border-white/10
                           dark:hover:shadow-[0_4px_12px_rgba(255,255,255,0.1)] dark:hover:border-white/20
                           cursor-pointer"
                style={{
                  transition: 'transform 0.4s ease, opacity 0.4s ease, background-color 0.15s, box-shadow 0.15s',
                  transform: flippingIndex === index ? 'rotateX(90deg)' : 'rotateX(0deg)',
                  opacity: flippingIndex === index ? 0 : 1,
                }}
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
