'use client';

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

// 添加标题动画组件
const TypingTitle = ({ title, className, onAnimationComplete }: { title: string; className?: string; onAnimationComplete?: () => void }) => {
  // 通过使用 useState 和初始 prop 值，我们"锁存"了标题。
  // 动画将使用这个标题完成，即使父组件的 `title` prop 在中途改变。
  // 只有当这个组件被重新挂载并带有新的初始`title`时，新的动画才会开始。
  const [latchedTitle] = useState(title);
  
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true); // 假设从挂载开始就处于打字状态
  
  useEffect(() => {
    if (!latchedTitle) {
      setIsTyping(false); // 没有标题，所以不打字
      return;
    }
    
    // 重置动画状态
    setDisplayedText('');
    setIsTyping(true);
    
    let index = 0;
    
    // 开始字符动画
    const intervalId = setInterval(() => {
      if (index < latchedTitle.length) {
        setDisplayedText(latchedTitle.substring(0, index + 1));
        index++;
      } else {
        clearInterval(intervalId);
        // 保持光标显示一段时间后完成动画
        setTimeout(() => {
          setIsTyping(false);
          // 通知动画完成
          if (onAnimationComplete) {
            onAnimationComplete();
          }
        }, 1000);
      }
    }, 200); // 固定速度，确保足够慢以便观察
    
    return () => clearInterval(intervalId);
  }, [latchedTitle, onAnimationComplete]); // Effect 依赖于稳定的锁存标题
  
  return (
    <div 
      className={cn(
        "inline-block relative px-3 py-1 rounded-md",
        isTyping && "bg-primary/5 ring-1 ring-primary/20",
        className
      )}
    >
      {displayedText}
      {isTyping && (
        <>
          <span className="inline-block ml-0.5 w-[2px] h-[1.2em] bg-primary animate-blink" />
          <span className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/15 to-primary/0 animate-shine bg-[length:200%_100%]" />
        </>
      )}
    </div>
  );
};

export default TypingTitle; 