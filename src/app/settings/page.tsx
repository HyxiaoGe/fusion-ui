"use client";

import MainLayout from "@/components/layouts/MainLayout";
import ModelSettings from "@/components/models/ModelSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppSelector } from "@/redux/hooks";
import { motion } from "framer-motion";
import { Database, ExternalLink, Globe, LayoutGrid, Server, Settings, Shield } from "lucide-react";
import AvatarSelector from "./AvatarSelector";
import DataManagement from "./DataManagement";
import SearchSettings from "./SearchSettings";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

// 定义动画变体
const variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function SettingsPage() {
  const { selectedModelId } = useAppSelector((state) => state.models);
  const [activeTab, setActiveTab] = useState("general");
  const [isAddModelOpen, setIsAddModelOpen] = useState(false);
  const searchParams = useSearchParams();
  
  useEffect(() => {
    // 检查URL参数
    const tab = searchParams?.get("tab");
    const action = searchParams?.get("action");
    
    if (tab) {
      setActiveTab(tab);
    }
    
    if (tab === "models" && action === "add") {
      setIsAddModelOpen(true);
    }
  }, [searchParams]);

  return (
    <MainLayout>
      <div className="w-full h-full px-6 pt-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 w-full flex-grow flex flex-col">
          <div className="bg-card/50 backdrop-blur-sm border rounded-lg shadow-sm p-1 sticky top-0 z-10 flex-shrink-0 dark:bg-slate-800/70 dark:border-slate-700 mt-0">
            <TabsList className="w-full grid grid-cols-3 gap-1 bg-transparent dark:bg-transparent">
              <TabsTrigger value="general" className="flex gap-2 items-center justify-center">
                <Settings className="h-4 w-4" />
                <span className="hidden md:inline">常规设置</span>
                <span className="md:hidden">常规</span>
              </TabsTrigger>
              <TabsTrigger value="models" className="flex gap-2 items-center justify-center">
                <Server className="h-4 w-4" />
                <span className="hidden md:inline">模型管理</span>
                <span className="md:hidden">模型</span>
              </TabsTrigger>
              <TabsTrigger value="data" className="flex gap-2 items-center justify-center">
                <Database className="h-4 w-4" />
                <span className="hidden md:inline">数据管理</span>
                <span className="md:hidden">数据</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 常规设置标签页 */}
          <TabsContent value="general" className="space-y-6 w-full flex-grow overflow-auto">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              <Card className="overflow-hidden border-muted shadow-md transition-all hover:shadow-lg">
                <CardHeader className="bg-muted/10 border-b pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    语言与区域设置
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h3 className="font-medium">界面语言</h3>
                      <select className="w-full p-2 rounded-md border border-input bg-transparent">
                        <option value="zh-CN">简体中文</option>
                        <option value="en-US">English (US)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-medium">时区</h3>
                      <select className="w-full p-2 rounded-md border border-input bg-transparent">
                        <option value="Asia/Shanghai">中国标准时间 (GMT+8)</option>
                        <option value="America/New_York">美国东部时间</option>
                      </select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <AvatarSelector />
            </motion.div>
          </TabsContent>

          {/* 模型管理标签页 */}
          <TabsContent value="models" className="space-y-6 w-full flex-grow overflow-auto">
            <ModelSettings modelId={selectedModelId || ''} initialAddModelOpen={isAddModelOpen} />
          </TabsContent>

          {/* 数据管理标签页 */}
          <TabsContent value="data" className="space-y-6 w-full flex-grow overflow-auto">
            <DataManagement />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}