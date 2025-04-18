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

// 定义动画变体
const variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function SettingsPage() {
  const { selectedModelId } = useAppSelector((state) => state.models);

  return (
    <MainLayout>
      <div className="container py-6 max-w-5xl">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={variants}
          className="flex items-center justify-between mb-6"
        >
          <h1 className="text-3xl font-bold">设置</h1>
          <p className="text-sm text-muted-foreground">
            配置您的 AI 助手以获得更个性化的体验
          </p>
        </motion.div>

        <Tabs defaultValue="general" className="space-y-6">
          <div className="bg-card/50 backdrop-blur-sm border rounded-lg shadow-sm p-1 sticky top-16 z-10">
            <TabsList className="w-full grid grid-cols-2 md:grid-cols-5 gap-1">
              <TabsTrigger value="general" className="flex gap-2 items-center">
                <Settings className="h-4 w-4" />
                <span className="hidden md:inline">常规设置</span>
                <span className="md:hidden">常规</span>
              </TabsTrigger>
              <TabsTrigger value="models" className="flex gap-2 items-center">
                <Server className="h-4 w-4" />
                <span className="hidden md:inline">模型管理</span>
                <span className="md:hidden">模型</span>
              </TabsTrigger>
              <TabsTrigger value="search" className="flex gap-2 items-center">
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden md:inline">搜索设置</span>
                <span className="md:hidden">搜索</span>
              </TabsTrigger>
              <TabsTrigger value="data" className="flex gap-2 items-center">
                <Database className="h-4 w-4" />
                <span className="hidden md:inline">数据管理</span>
                <span className="md:hidden">数据</span>
              </TabsTrigger>
              <TabsTrigger value="security" className="flex gap-2 items-center">
                <Shield className="h-4 w-4" />
                <span className="hidden md:inline">安全设置</span>
                <span className="md:hidden">安全</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 常规设置标签页 */}
          <TabsContent value="general" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
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
          <TabsContent value="models" className="space-y-6">
            <ModelSettings modelId={selectedModelId || ''} />
          </TabsContent>

          {/* 搜索设置标签页 */}
          <TabsContent value="search" className="space-y-6">
            <SearchSettings />
          </TabsContent>

          {/* 数据管理标签页 */}
          <TabsContent value="data" className="space-y-6">
            <DataManagement />
          </TabsContent>

          {/* 安全设置标签页 */}
          <TabsContent value="security" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="overflow-hidden border-muted shadow-md transition-all hover:shadow-lg">
                <CardHeader className="bg-muted/10 border-b pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    API 密钥管理
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">OpenAI API 密钥</h3>
                        <p className="text-sm text-muted-foreground">用于访问 OpenAI 的 API 服务</p>
                      </div>
                      <Button variant="outline" size="sm" className="flex items-center gap-1">
                        <ExternalLink className="h-4 w-4" />
                        <span>配置</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}