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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 单个翻牌卡片
const FlipCard = memo(({
  frontText,
  backText,
  flipped,
  delay,
  onClick,
}: {
  frontText: string;
  backText: string;
  flipped: boolean;
  delay: number;
  onClick: () => void;
}) => (
  <div
    className="h-10"
    style={{ perspective: '800px' }}
  >
    <div
      onClick={onClick}
      className="relative h-full cursor-pointer"
      style={{
        transformStyle: 'preserve-3d',
        transition: `transform 0.5s ease ${delay}ms`,
        transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
      }}
    >
      {/* 正面 */}
      <div
        className="absolute inset-0 flex items-center px-5 rounded-[20px] bg-muted/50 text-[14px] leading-5 text-foreground/70 whitespace-nowrap
                   shadow-[0_2px_8px_rgba(0,0,0,0.12)]
                   hover:bg-muted hover:text-foreground hover:shadow-[0_4px_12px_rgba(0,0,0,0.18)]
                   dark:shadow-[0_2px_8px_rgba(255,255,255,0.06)] dark:border dark:border-white/10
                   dark:hover:shadow-[0_4px_12px_rgba(255,255,255,0.1)] dark:hover:border-white/20"
        style={{ backfaceVisibility: 'hidden' }}
      >
        {frontText}
      </div>
      {/* 背面 */}
      <div
        className="absolute inset-0 flex items-center px-5 rounded-[20px] bg-muted/50 text-[14px] leading-5 text-foreground/70 whitespace-nowrap
                   shadow-[0_2px_8px_rgba(0,0,0,0.12)]
                   dark:shadow-[0_2px_8px_rgba(255,255,255,0.06)] dark:border dark:border-white/10"
        style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
      >
        {backText}
      </div>
    </div>
  </div>
));

FlipCard.displayName = 'FlipCard';

interface HomePageProps {
  onNewChat?: () => void;
  onSendMessage: (content: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onSendMessage }) => {
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  // 双缓冲：current 是正面文字，next 是背面文字，翻转后交换
  const [currentItems, setCurrentItems] = useState<string[]>(FALLBACK_EXAMPLES.slice(0, PAGE_SIZE));
  const [nextItems, setNextItems] = useState<string[]>(FALLBACK_EXAMPLES.slice(0, PAGE_SIZE));
  const [flipped, setFlipped] = useState(false);

  const poolRef = useRef<string[]>([]);
  const cursorRef = useRef(0);

  const getNextBatch = useCallback((): string[] => {
    const pool = poolRef.current;
    if (pool.length === 0) return FALLBACK_EXAMPLES.slice(0, PAGE_SIZE);
    if (cursorRef.current + PAGE_SIZE > pool.length) {
      poolRef.current = shuffle(pool);
      cursorRef.current = 0;
    }
    const batch = poolRef.current.slice(cursorRef.current, cursorRef.current + PAGE_SIZE);
    cursorRef.current += PAGE_SIZE;
    return batch;
  }, []);

  // 首次加载
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPromptExamples(50);
        if (!cancelled && data.examples.length > 0) {
          const all = data.examples.map((e) => e.question);
          poolRef.current = shuffle(all);
          cursorRef.current = 0;
          const first = poolRef.current.slice(0, PAGE_SIZE);
          cursorRef.current = PAGE_SIZE;
          setCurrentItems(first);
          setNextItems(first);
        }
      } catch {
        // fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 定时翻牌
  useEffect(() => {
    if (loading) return;
    const timer = setInterval(() => {
      const batch = getNextBatch();
      if (flipped) {
        // 当前显示的是背面 → 准备新正面 → 翻回正面
        setCurrentItems(batch);
        setFlipped(false);
      } else {
        // 当前显示的是正面 → 准备新背面 → 翻到背面
        setNextItems(batch);
        setFlipped(true);
      }
    }, ROTATE_INTERVAL);
    return () => clearInterval(timer);
  }, [loading, flipped, getNextBatch]);

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

  const getVisibleText = (index: number) => flipped ? nextItems[index] : currentItems[index];

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
                className="h-10 rounded-[20px] bg-muted/50 animate-pulse"
                style={{ width: `${140 + (i % 3) * 50}px` }}
              />
            ))
          ) : (
            currentItems.map((_, index) => (
              <FlipCard
                key={`card-${index}`}
                frontText={currentItems[index]}
                backText={nextItems[index]}
                flipped={flipped}
                delay={index * 100}
                onClick={() => handleExampleClick(getVisibleText(index))}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(HomePage);
