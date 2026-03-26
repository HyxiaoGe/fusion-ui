import { useCallback, memo, useMemo } from "react";
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

  const randomExamples = useMemo(() => {
    return [...ALL_EXAMPLES].sort(() => Math.random() - 0.5).slice(0, 8);
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
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold text-foreground mb-8 text-center">
          今天我能帮你做什么？
        </h1>

        <div className="flex flex-wrap gap-2 justify-center">
          {randomExamples.map((example) => (
            <button
              key={example}
              onClick={() => handleExampleClick(example)}
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
