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
import { generateChatTitle } from "@/lib/api/title";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { addMessage, createChat, endStreaming, endStreamingReasoning, setError, startStreaming, startStreamingReasoning, updateChatTitle, updateMessageReasoning, updateStreamingContent, updateStreamingReasoningContent } from "@/redux/slices/chatSlice";
import { store } from "@/redux/store";
import { FileText, Image, Lightbulb, MessageSquare, Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

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
    // 记录是否是第一条消息（用于后续生成标题）

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
          
          // 在消息流结束后自动生成对话标题（弹幕点击创建的对话总是新对话，所以可以直接生成标题）
          console.log('弹幕对话流处理完成，开始生成标题');
          // 延迟一小段时间确保服务器已处理完毕
          setTimeout(async () => {
            try {
              const generatedTitle = await generateChatTitle(
                chatId || conversationId || '', // 使用可能从服务器返回的新conversationId
                undefined, // 不传具体消息，让后端从对话ID获取完整消息链
                { max_length: 20 }
              );

              dispatch(updateChatTitle({
                chatId: chatId || conversationId || '',
                title: generatedTitle
              }));
            } catch (error) {
              console.error('生成标题失败:', error);
            }
          }, 1000); // 延迟1秒确保服务器已处理
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
    <Card className="bg-gradient-to-br from-primary/5 via-secondary/10 to-primary/5 border-none shadow-md h-full">
      <CardContent className="flex items-center h-full">
        <div className="flex flex-col items-center text-center space-y-4 w-full">
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

      <div className="flex flex-col h-full">
        <CardHeader>
          <CardTitle className="text-xl">开始新对话</CardTitle>
        </CardHeader>
        <CardContent className="relative z-10 space-y-4 flex-1">
          <div className="bg-muted/30 p-4 rounded-lg backdrop-blur-sm border border-border/50">
            <p className="text-sm font-medium mb-2">选择AI模型</p>
            <div className="relative">
              <ModelSelector />
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
      </div>
    </Card>
  );
};

// 对话示例数据
const dialogueExamples = [
  [
    {
      title: "智能写作",
      desc: "生成文章、报告",
      examples: ["写一篇科技新闻", "生成产品说明书", "编写商业计划书"]
    },
    {
      title: "代码助手",
      desc: "编程帮助、Debug",
      examples: ["React性能优化", "Python爬虫示例", "Vue组件开发"]
    },
    {
      title: "数据分析",
      desc: "数据处理分析",
      examples: ["分析销售数据", "生成数据报表", "市场趋势分析"]
    },
    {
      title: "知识问答",
      desc: "解答问题讲解",
      examples: ["量子计算原理", "机器学习基础", "区块链技术"]
    }
  ],
  [
    {
      title: "文案创作",
      desc: "营销内容生成",
      examples: ["产品推广文案", "社交媒体文案", "品牌故事"]
    },
    {
      title: "翻译助手",
      desc: "多语言翻译",
      examples: ["中英互译", "技术文档翻译", "本地化建议"]
    },
    {
      title: "教育辅导",
      desc: "学习解惑",
      examples: ["数学题解析", "物理概念讲解", "历史事件分析"]
    },
    {
      title: "创意激发",
      desc: "创意头脑风暴",
      examples: ["产品创新点子", "设计灵感启发", "剧情构思"]
    }
  ],
  [
    {
      title: "项目管理",
      desc: "项目规划建议",
      examples: ["项目进度规划", "风险评估", "团队协作建议"]
    },
    {
      title: "技术咨询",
      desc: "技术方案建议",
      examples: ["架构设计建议", "技术选型分析", "性能优化方案"]
    },
    {
      title: "研究助手",
      desc: "研究方法指导",
      examples: ["文献综述建议", "研究方法选择", "数据分析方法"]
    },
    {
      title: "生活助手",
      desc: "日常生活建议",
      examples: ["健康饮食建议", "运动计划制定", "时间管理技巧"]
    }
  ]
];

// 右侧：热门问题和对话示例
const DialogueExamplesCard = () => {
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [isRotating, setIsRotating] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const dispatch = useAppDispatch();
  const { selectedModelId, models } = useAppSelector((state) => state.models);

  const handleExampleClick = (example: string) => {
    if (!selectedModelId) return;

    dispatch(
      createChat({
        modelId: selectedModelId,
        title: example.length > 20 ? example.substring(0, 20) + "..." : example,
      })
    );

    const state = store.getState();
    const newChat = state.chat.chats[state.chat.chats.length - 1];
    if (!newChat) {
      dispatch(setError('创建对话失败'));
      return;
    }

    const chatId = newChat.id;

    dispatch(
      addMessage({
        chatId,
        message: {
          role: "user",
          content: example,
          status: "pending",
        }
      })
    );

    dispatch(startStreaming(chatId));

    const selectedModel = models.find(m => m.id === selectedModelId);
    if (!selectedModel) {
      dispatch(setError('找不到选中的模型信息'));
      return;
    }

    const { reasoningEnabled } = store.getState().chat;
    const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
    const useReasoning = reasoningEnabled && supportsReasoning;

    if (useReasoning) {
      dispatch(startStreamingReasoning());
    }

    sendMessageStream({
      provider: selectedModel.provider,
      model: selectedModel.id,
      message: example.trim(),
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
          
          setTimeout(async () => {
            try {
              const generatedTitle = await generateChatTitle(
                chatId || conversationId || '',
                undefined,
                { max_length: 20 }
              );

              dispatch(updateChatTitle({
                chatId: chatId || conversationId || '',
                title: generatedTitle
              }));
            } catch (error) {
              console.error('生成标题失败:', error);
            }
          }, 1000);
        }, 100);
      }
    }).catch(error => {
      console.error('发送消息失败:', error);
      dispatch(setError('发送消息失败，请重试'));
      dispatch(endStreamingReasoning());
      dispatch(endStreaming());
    });
  };

  const handleNextSet = () => {
    setIsRotating(true);
    setIsChanging(true);
    
    // 先淡出当前内容
    setTimeout(() => {
      setCurrentSetIndex((prev) => (prev + 1) % dialogueExamples.length);
      // 淡入新内容
      setTimeout(() => {
        setIsChanging(false);
      }, 150);
    }, 150);

    // 重置旋转动画
    setTimeout(() => {
      setIsRotating(false);
    }, 500);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            对话示例
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNextSet}
            className="h-8 px-2 hover:bg-muted/50 group"
            disabled={isRotating}
          >
            <span className="text-xs mr-1">换一批</span>
            <RefreshCw className={cn(
              "h-4 w-4 transition-transform duration-500",
              isRotating && "rotate-180"
            )} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn(
          "grid grid-cols-2 gap-4 transition-opacity duration-150",
          isChanging ? "opacity-0" : "opacity-100"
        )}>
          {dialogueExamples[currentSetIndex].map((item, index) => (
            <div 
              key={index} 
              className="p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors cursor-pointer"
              onClick={() => handleExampleClick(item.examples[0])}
            >
              <h3 className="font-medium text-sm mb-1">{item.title}</h3>
              <p className="text-xs text-muted-foreground mb-2">{item.desc}</p>
              <div className="space-y-2">
                {item.examples.slice(0, 1).map((example, i) => (
                  <div key={i} className="text-xs px-2 py-1.5 bg-muted/50 rounded-md hover:bg-muted">
                    {example}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
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
      icon: <Lightbulb className="h-8 w-8 text-amber-500" />,
    },
    {
      id: "vision",
      title: "视觉识别",
      description: "理解和分析图像内容",
      icon: <Image className="h-8 w-8 text-blue-500" />,
    },
    {
      id: "files",
      title: "文件处理",
      description: "处理各种类型的文件和数据",
      icon: <FileText className="h-8 w-8 text-green-500" />,
    },
    {
      id: "chatting",
      title: "智能对话",
      description: "自然流畅的多轮对话",
      icon: <MessageSquare className="h-8 w-8 text-purple-500" />,
    },
  ];

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-xl">AI 能力展示</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {modelCapabilities.map((capability) => (
            <div
              key={capability.id}
              className="flex flex-col items-center text-center p-3 bg-muted/20 rounded-lg 
                        hover:bg-accent/20 transition-all duration-300 transform hover:-translate-y-1 
                        border border-border/50 hover:border-primary/30"
            >
              <div className="p-2 rounded-full bg-background/50 backdrop-blur-sm">
                {capability.icon}
              </div>
              <h3 className="font-medium mt-2 text-sm">{capability.title}</h3>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
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
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex-1 p-4 md:p-6 grid grid-rows-[auto,1fr] gap-6">
        {/* 欢迎区域 */}
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1">
            <WelcomeCard />
          </div>
          <div className="w-full lg:w-[380px]">
            <QuickStartCard />
          </div>
        </div>

        {/* 主要内容区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
          {/* 左侧：能力展示 */}
          <div className="lg:col-span-5 grid grid-rows-[auto,1fr] gap-6">
            <ModelCapabilitiesSection />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  使用指南
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary font-medium">1</span>
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">选择合适的模型</h3>
                      <p className="text-xs text-muted-foreground">根据您的需求选择不同特点的AI模型。</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary font-medium">2</span>
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">描述您的需求</h3>
                      <p className="text-xs text-muted-foreground">清晰地描述问题，AI会给出相应解答。</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary font-medium">3</span>
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">多轮对话优化</h3>
                      <p className="text-xs text-muted-foreground">通过多轮对话逐步完善结果。</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 右侧：热门问题和对话示例 */}
          <div className="lg:col-span-7 grid grid-rows-[1fr,auto] gap-6">
            <HotTopicsCard />
            <DialogueExamplesCard />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
