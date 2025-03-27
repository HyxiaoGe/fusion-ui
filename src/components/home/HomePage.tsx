import ModelSelector from "@/components/models/ModelSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { sendMessageStream } from "@/lib/api/chat";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { addMessage, createChat, endStreaming, endStreamingReasoning, setError, startStreaming, startStreamingReasoning, updateMessageReasoning, updateStreamingContent, updateStreamingReasoningContent } from "@/redux/slices/chatSlice";
import { store } from "@/redux/store";
import { FileText, Image, Lightbulb, MessageSquare, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// 热门问题示例数据 - 后期可以通过API获取
const hotTopics = [
  "如何使用深度学习构建图像识别系统？",
  "请帮我分析最近的经济趋势和投资机会",
  "如何优化React应用的性能？",
  "解释量子计算的基本原理",
  "请帮我写一个Python爬虫程序",
  "如何使用GPT模型进行文本摘要？",
  "帮我写一封商务邮件模板",
  "解释什么是向量数据库及其应用场景",
  "帮我创建一个简单的网页设计",
  "如何使用TensorFlow构建神经网络？",
  "请分析莎士比亚《哈姆雷特》的主题",
  "简述人工智能在医疗领域的应用",
  "如何用JavaScript实现数据可视化？",
  "解释区块链技术的工作原理",
  "如何提高英语写作能力？",
  "帮我制定一个健身计划",
  "分析当前人工智能的伦理问题",
  "如何使用大语言模型改进产品体验？",
  "请帮我解释复杂系统理论",
  "如何在Next.js中实现服务端渲染？",
];

interface BulletTopic {
  text: string;
  style: React.CSSProperties;
  id: number;
  track: number;
  width?: number;
}

const BulletScreen = () => {
  const [visibleTopics, setVisibleTopics] = useState<BulletTopic[]>([]);
  const dispatch = useAppDispatch();
  const { selectedModelId, models } = useAppSelector((state) => state.models);

  // 轨道数量
  const TRACK_COUNT = 8;
  // 记录每个轨道上最后一个弹幕的信息
  const tracksInfo = useRef(
    Array(TRACK_COUNT)
      .fill(0)
      .map(() => ({
        lastUsedTime: 0, // 最后使用时间
        lastBulletWidth: 0, // 最后一个弹幕的宽度
        bulletInProgress: false, // 是否有弹幕正在通过起点
        lastBulletPosition: 0, // 最后一个弹幕的当前位置
      }))
  );

  // DOM引用，用于测量弹幕元素宽度
  const containerRef = useRef<HTMLDivElement>(null);
  const tempMeasureRef = useRef<HTMLDivElement>(null);

  // 测量文本宽度的函数
  const measureTextWidth = (text: string): number => {
    if (!tempMeasureRef.current) return 0;
    tempMeasureRef.current.textContent = text;
    return tempMeasureRef.current.offsetWidth + 24; // 加上padding
  };

  // 获取可用轨道，考虑水平间距
  const getAvailableTrack = (bulletWidth: number) => {
    const now = Date.now();
    const containerWidth = containerRef.current?.offsetWidth || 1000;
    const minSpacing = 50; // 最小间距
    const safetyMargin = 800; // 弹幕之间的最小时间间隔(毫秒)

    // 找出所有当前可用的轨道
    const availableTracks = [];
    for (let i = 0; i < TRACK_COUNT; i++) {
      const trackInfo = tracksInfo.current[i];
      const timeSinceLastUse = now - trackInfo.lastUsedTime;

      // 检查轨道是否可用
      if (!trackInfo.bulletInProgress && timeSinceLastUse > safetyMargin) {
        // 检查与同一轨道上的其他弹幕的间距
        const hasEnoughSpacing = visibleTopics.every(topic => {
          if (topic.track === i) {
            const bulletElement = document.getElementById(`bullet-${topic.id}`);
            if (bulletElement) {
              const rect = bulletElement.getBoundingClientRect();
              const spacing = rect.left - containerWidth;
              return spacing <= -bulletElement.offsetWidth - minSpacing;
            }
          }
          return true;
        });

        if (hasEnoughSpacing) {
          availableTracks.push(i);
        }
      }
    }

    // 如果有可用轨道，随机选择一个
    if (availableTracks.length > 0) {
      const selectedTrack =
        availableTracks[Math.floor(Math.random() * availableTracks.length)];

      // 更新轨道信息
      tracksInfo.current[selectedTrack] = {
        lastUsedTime: now,
        lastBulletWidth: bulletWidth,
        bulletInProgress: true,
        lastBulletPosition: containerWidth,
      };

      return selectedTrack;
    }

    // 如果没有理想的轨道，找一个最长时间未使用的
    let bestTrack = 0;
    let longestTime = 0;

    for (let i = 0; i < TRACK_COUNT; i++) {
      const timeSinceLastUse = now - tracksInfo.current[i].lastUsedTime;
      if (timeSinceLastUse > longestTime) {
        longestTime = timeSinceLastUse;
        bestTrack = i;
      }
    }

    // 更新该轨道信息
    tracksInfo.current[bestTrack] = {
      lastUsedTime: now,
      lastBulletWidth: bulletWidth,
      bulletInProgress: true,
      lastBulletPosition: containerWidth,
    };

    return bestTrack;
  };

  // 随机生成弹幕样式，基于轨道
  const generateBulletStyle = (track: number): React.CSSProperties => {
    const trackHeight = 100 / TRACK_COUNT;
    const basePosition = trackHeight * track;
    const randomOffset = Math.random() * trackHeight * 0.3 - trackHeight * 0.15;
    const topPosition = basePosition + randomOffset + trackHeight / 2;

    // 动态计算时间，让较长的文本有更长的动画时间
    const duration = 13 + Math.random() * 3;

    return {
      position: "absolute" as const,
      top: `${topPosition}%`,
      left: "100%",
      fontSize: `${14 + Math.floor(Math.random() * 3)}px`,
      opacity: 0.8 + Math.random() * 0.2,
      whiteSpace: "nowrap",
      animation: `bulletfly ${duration}s linear forwards`,
      cursor: "pointer",
      padding: "6px 12px",
      borderRadius: "20px",
      background: "rgba(100, 100, 255, 0.1)",
      backdropFilter: "blur(8px)",
      boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
      transform: "translateY(-50%)",
      zIndex: 10,
      border: "1px solid rgba(255, 255, 255, 0.1)",
      animationPlayState: "running",
    };
  };

  // 处理点击弹幕创建对话
  const handleTopicClick = (topic: string) => {
    if (!selectedModelId) return;

    // 先创建对话
    dispatch(
      createChat({
        modelId: selectedModelId,
        title: topic.length > 20 ? topic.substring(0, 20) + "..." : topic,
      })
    );

    // 获取最新创建的对话ID
    const state = store.getState();
    const newChat = state.chat.chats[state.chat.chats.length - 1];
    if (!newChat) {
      dispatch(setError('创建对话失败'));
      return;
    }

    const chatId = newChat.id;

    // 添加用户消息
    dispatch(
      addMessage({
        chatId,
        message: {
          role: "user",
          content: topic,
          status: "pending",
        }
      })
    );

    // 开始流式输出
    dispatch(startStreaming(chatId));

    // 获取选中的模型信息
    const selectedModel = models.find(m => m.id === selectedModelId);
    if (!selectedModel) {
      dispatch(setError('找不到选中的模型信息'));
      return;
    }

    // 检查推理功能
    const { reasoningEnabled } = store.getState().chat;
    const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
    const useReasoning = reasoningEnabled && supportsReasoning;

    if (useReasoning) {
      dispatch(startStreamingReasoning());
    }

    // 发送消息到服务器
    sendMessageStream({
      provider: selectedModel.provider,
      model: selectedModel.id,
      message: topic.trim(),
      conversation_id: chatId,
      stream: true,
      options: {
        use_reasoning: useReasoning,
        use_enhancement: store.getState().search.contextEnhancementEnabled
      }
    },
    (content, done, conversationId, reasoning) => {
      if (!done) {
        dispatch(updateStreamingContent({
          chatId,
          content
        }));

        if (useReasoning && reasoning) {
          dispatch(updateStreamingReasoningContent(reasoning));
        }
      } else {
        dispatch(updateStreamingContent({
          chatId,
          content
        }));

        setTimeout(() => {
          if (reasoning && reasoning.trim()) {
            const streamingMessageId = store.getState().chat.streamingMessageId;
            if (streamingMessageId) {
              dispatch(updateMessageReasoning({
                chatId,
                messageId: streamingMessageId,
                reasoning: reasoning,
                isVisible: true
              }));
            }
            dispatch(endStreamingReasoning());
          }
          dispatch(endStreaming());
        }, 100);
      }
    }).catch(error => {
      console.error('发送消息失败:', error);
      dispatch(setError('发送消息失败，请重试'));
      dispatch(endStreamingReasoning());
      dispatch(endStreaming());
    });
  };

  // 弹幕元素测量并更新信息
  const measureBullet = (element: HTMLDivElement | null, track: number, id: number) => {
    if (element && containerRef.current) {
      const width = element.offsetWidth;
      const container = containerRef.current as HTMLDivElement;

      // 更新弹幕宽度信息
      tracksInfo.current[track].lastBulletWidth = width;

      // 计算弹幕通过起点所需时间（毫秒）
      // 假设水平动画为20秒，整个屏幕宽度为容器宽度
      const containerWidth = container.offsetWidth;
      const passingTime = (width / containerWidth) * 20000; // 20秒动画

      // 设置一个定时器，在弹幕完全进入后标记轨道为可用
      setTimeout(() => {
        tracksInfo.current[track].bulletInProgress = false;
      }, passingTime + 100); // 额外100ms作为缓冲
    }
  };

  // 添加弹幕的逻辑
  useEffect(() => {
    // 限制同屏弹幕数量
    const MAX_BULLETS = 12;

    const addBullet = () => {
      // 动态控制生成频率，弹幕多时放慢生成
      if (visibleTopics.length >= MAX_BULLETS) return;

      const randomIndex = Math.floor(Math.random() * hotTopics.length);
      const topic = hotTopics[randomIndex];
      
      // 预先测量文本宽度
      const bulletWidth = measureTextWidth(topic);
      const track = getAvailableTrack(bulletWidth);

      if (track !== undefined) {
        const id = Date.now();
        setVisibleTopics((prev) => [
          ...prev,
          {
            text: topic,
            style: generateBulletStyle(track),
            id,
            track,
            width: bulletWidth,
          },
        ]);
      }
    };

    // 弹幕生成间隔时间随机化，但与屏幕上当前弹幕数量相关
    const dynamicInterval =
      1200 + visibleTopics.length * 200 + Math.random() * 800;
    const interval = setInterval(addBullet, dynamicInterval);

    // 清理过期弹幕
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setVisibleTopics((prev) =>
        prev.filter((topic) => {
          const keep = now - topic.id < 20000;
          if (!keep) {
            // 清理轨道信息
            tracksInfo.current[topic.track].bulletInProgress = false;
          }
          return keep;
        })
      );
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(cleanupInterval);
    };
  }, [visibleTopics.length]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      style={{ minHeight: "200px" }}
    >
      {/* 用于测量文本宽度的隐藏元素 */}
      <div
        ref={tempMeasureRef}
        style={{
          position: 'absolute',
          visibility: 'hidden',
          whiteSpace: 'nowrap',
          fontSize: '14px',
          padding: '6px 12px',
        }}
      />

      <style jsx global>{`
        @keyframes bulletfly {
          from {
            transform: translateX(0) translateY(-50%);
          }
          to {
            transform: translateX(-120vw) translateY(-50%);
          }
        }
        .bullet {
          animation-play-state: running;
        }
        .bullet:hover {
          animation-play-state: paused !important;
          background: rgba(100, 100, 255, 0.2) !important;
          border-color: rgba(255, 255, 255, 0.2) !important;
        }
      `}</style>

      {visibleTopics.map((topic) => (
        <div
          key={topic.id}
          id={`bullet-${topic.id}`}
          ref={(el) => measureBullet(el, topic.track, topic.id)}
          style={topic.style}
          onClick={() => handleTopicClick(topic.text)}
          className="bullet hover:bg-primary/20 transition-colors duration-300"
        >
          {topic.text}
        </div>
      ))}
    </div>
  );
};

// 欢迎卡片组件
const WelcomeCard = () => {
  return (
    <Card className="bg-gradient-to-br from-primary/5 via-secondary/10 to-primary/5 border-none shadow-md">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="relative">
            <h1 className="text-4xl font-bold tracking-tight">
              欢迎使用 <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span> 助手
            </h1>
            <div className="gradient-line"></div>
          </div>
          <style jsx global>{`
            .gradient-text {
              background: linear-gradient(
                90deg,
                hsl(var(--primary)) 0%,
                hsl(var(--secondary)) 50%,
                hsl(var(--primary)) 100%
              );
              background-size: 200% auto;
              color: transparent;
              -webkit-background-clip: text;
              background-clip: text;
              animation: shine 3s linear infinite;
            }

            .gradient-line {
              position: absolute;
              bottom: -4px;
              left: 50%;
              width: 100px;
              height: 2px;
              background: linear-gradient(
                90deg,
                transparent 0%,
                hsl(var(--primary)) 50%,
                transparent 100%
              );
              transform: translateX(-50%);
              opacity: 0.5;
              animation: pulse 2s ease-in-out infinite;
            }

            @keyframes shine {
              to {
                background-position: 200% center;
              }
            }

            @keyframes pulse {
              0%, 100% {
                opacity: 0.2;
                width: 60px;
              }
              50% {
                opacity: 0.5;
                width: 100px;
              }
            }
          `}</style>
          <p className="text-muted-foreground max-w-[600px]">
            强大的AI助手，支持多种大型语言模型，为您提供智能对话、文件处理、代码编写、文档分析等多种功能。
          </p>

          <div className="flex flex-wrap justify-center gap-3 mt-2">
            <Badge variant="secondary" className="px-3 py-1">
              多模型支持
            </Badge>
            <Badge variant="secondary" className="px-3 py-1">
              深度思考
            </Badge>
            <Badge variant="secondary" className="px-3 py-1">
              文件处理
            </Badge>
            <Badge variant="secondary" className="px-3 py-1">
              数据导入导出
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// 快捷开始卡片 - 科技感样式版本
const QuickStartCard = () => {
  const dispatch = useAppDispatch();
  const { models, selectedModelId } = useAppSelector((state) => state.models);

  const handleNewChat = () => {
    const modelToUse =
      selectedModelId || (models.length > 0 ? models[0].id : null);

    if (!modelToUse) {
      console.error("没有可用的模型，无法创建对话");
      return;
    }

    dispatch(createChat({ modelId: modelToUse }));
  };

  return (
    <Card className="border border-primary/20 bg-gradient-to-br from-background to-background/80 shadow-lg backdrop-blur overflow-hidden relative h-full">
      {/* 背景装饰 */}
      <div className="absolute -bottom-12 -right-12 w-40 h-40 bg-primary/5 rounded-full blur-xl"></div>
      <div className="absolute top-10 -left-10 w-20 h-20 bg-secondary/5 rounded-full blur-xl"></div>

      <CardHeader>
        <CardTitle className="text-xl">开始新对话</CardTitle>
      </CardHeader>
      <CardContent className="relative z-10 space-y-4">
        <div className="bg-muted/30 p-4 rounded-lg backdrop-blur-sm border border-border/50">
          <p className="text-sm font-medium mb-2">选择AI模型</p>
          <div className="relative">
            <ModelSelector />
            <style jsx global>{`
              :root {
                --select-dropdown-max-height: 400px;
              }
            `}</style>
          </div>
        </div>

        <Button
          onClick={handleNewChat}
          className="w-full h-10 text-sm gap-2 relative overflow-hidden group bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 hover:opacity-90 transition-opacity"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
          <Plus className="h-4 w-4 group-hover:rotate-90 transition-transform duration-300" />
          <span className="z-10">开始新对话</span>
        </Button>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground border-t border-border/50 pt-4 relative z-10">
        选择合适的模型开始智能对话，探索AI的无限可能
      </CardFooter>
    </Card>
  );
};

// 热点弹幕卡片
const HotTopicsCard = () => {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-xl flex items-center">
          <span className="relative mr-2">
            <span className="absolute -left-1 -top-1 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
            <span className="absolute -left-1 -top-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </span>
          热门问题
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden pb-4">
        <div className="text-sm text-muted-foreground mb-2">
          点击任意热门问题，开始一个新的对话
        </div>
        <div className="mt-2 h-[200px]">
          <BulletScreen />
        </div>
      </CardContent>
    </Card>
  );
};

// 模型能力展示
const ModelCapabilitiesSection = () => {
  const modelCapabilities = [
    {
      id: "reasoning",
      title: "深度思考",
      description: "先思考、逐步分析再回答问题",
      icon: <Lightbulb className="h-10 w-10 text-amber-500" />,
    },
    {
      id: "vision",
      title: "视觉识别",
      description: "理解和分析图像内容",
      icon: <Image className="h-10 w-10 text-blue-500" />,
    },
    {
      id: "files",
      title: "文件处理",
      description: "处理各种类型的文件和数据",
      icon: <FileText className="h-10 w-10 text-green-500" />,
    },
    {
      id: "chatting",
      title: "智能对话",
      description: "自然流畅的多轮对话",
      icon: <MessageSquare className="h-10 w-10 text-purple-500" />,
    },
  ];

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-xl">AI 能力展示</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="grid grid-cols-4 gap-4 h-full">
          {modelCapabilities.map((capability) => (
            <div
              key={capability.id}
              className="flex flex-col items-center text-center p-4 bg-muted/20 rounded-lg 
                        hover:bg-accent/20 transition-all duration-300 transform hover:-translate-y-1 
                        border border-border/50 hover:border-primary/30"
            >
              {capability.icon}
              <h3 className="font-medium mt-3">{capability.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {capability.description}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// 主页组件
const HomePage = () => {
  return (
    <div className="flex flex-col h-full p-6 overflow-hidden">
      <WelcomeCard />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 flex-1">
        <div className="lg:col-span-1 flex flex-col">
          <QuickStartCard />
        </div>
        <div className="lg:col-span-2 flex flex-col">
          <div className="grid grid-cols-1 gap-6 h-full">
            <ModelCapabilitiesSection />
            <HotTopicsCard />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
