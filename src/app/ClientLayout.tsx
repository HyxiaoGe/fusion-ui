'use client';

import { ToastProvider, setGlobalToast, useToast } from "@/components/ui/toast";
import { useEffect } from "react";
import { initializeModels } from "@/lib/config/modelConfig";
import { useDispatch } from "react-redux";
import { updateModels } from "@/redux/slices/modelsSlice";

function ToastInitializer() {
  const toastContext = useToast();
  
  useEffect(() => {
    setGlobalToast(toastContext);
  }, [toastContext]);
  
  return null;
}

function ModelConfigInitializer() {
  const dispatch = useDispatch();
  const { toast } = useToast();
  
  useEffect(() => {
    initializeModels().then((modelData) => {
      console.log('模型配置初始化完成', modelData);
      // 使用Redux更新模型数据
      dispatch(updateModels(modelData));
    }).catch(error => {
      console.error('模型配置初始化失败:', error);
      toast({
        message: "模型配置加载失败，请检查网络连接或刷新页面重试",
        type: "error",
      });
    });
  }, [dispatch, toast]);
  
  return null;
}

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <ToastInitializer />
      <ModelConfigInitializer />
      {children}
    </ToastProvider>
  );
}