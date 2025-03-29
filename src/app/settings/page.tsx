"use client";

import MainLayout from "@/components/layouts/MainLayout";
import ModelSettings from "@/components/models/ModelSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppSelector } from "@/redux/hooks";
import { motion } from "framer-motion";
import { Database, ExternalLink, Globe, LayoutGrid, Moon, Server, Settings, Shield } from "lucide-react";
import AvatarSelector from "./AvatarSelector";
import DataManagement from "./DataManagement";
import SearchSettings from "./SearchSettings";
import ThemeSelector from "./ThemeSelector";

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
            <TabsList className="w-full grid grid-cols-3 md:grid-cols-6 gap-1">
              <TabsTrigger value="general" className="flex gap-2 items-center">
                <Settings className="h-4 w-4" />
                <span className="hidden md:inline">常规设置</span>
                <span className="md:hidden">常规</span>
              </TabsTrigger>
              <TabsTrigger value="appearance" className="flex gap-2 items-center">
                <Moon className="h-4 w-4" />
                <span className="hidden md:inline">外观</span>
                <span className="md:hidden">外观</span>
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
              <TabsTrigger value="apikeys" className="flex gap-2 items-center">
                <Shield className="h-4 w-4" />
                <span className="hidden md:inline">API密钥</span>
                <span className="md:hidden">API</span>
              </TabsTrigger>
              <TabsTrigger value="data" className="flex gap-2 items-center">
                <Database className="h-4 w-4" />
                <span className="hidden md:inline">数据管理</span>
                <span className="md:hidden">数据</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 常规设置 */}
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
              <Card className="overflow-hidden border-muted shadow-md transition-all hover:shadow-lg">
                <CardHeader className="bg-muted/10 border-b pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    应用设置
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">自动保存对话</h3>
                        <p className="text-sm text-muted-foreground">定期自动保存对话内容</p>
                      </div>
                      <div className="flex items-center h-6 w-11 rounded-full bg-muted relative cursor-pointer group">
                        <div className="absolute h-5 w-5 rounded-full bg-white shadow-sm left-0.5 transform transition-transform group-hover:bg-primary/10"></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">启动时自动开始新对话</h3>
                        <p className="text-sm text-muted-foreground">应用启动时自动创建新对话</p>
                      </div>
                      <div className="flex items-center h-6 w-11 rounded-full bg-primary relative cursor-pointer group">
                        <div className="absolute h-5 w-5 rounded-full bg-white shadow-sm right-0.5 transform transition-transform group-hover:bg-primary/10"></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* 外观标签页 */}
          <TabsContent value="appearance" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="overflow-hidden border-muted shadow-md transition-all hover:shadow-lg">
                <CardHeader className="bg-muted/10 border-b pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Moon className="h-5 w-5 text-primary" />
                    主题设置
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <ThemeSelector />
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
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex justify-between items-center"
            >
              <h2 className="text-xl font-bold">模型配置</h2>
              <Button variant="outline" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                <span>查看所有模型</span>
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              {selectedModelId && <ModelSettings modelId={selectedModelId} />}
            </motion.div>
          </TabsContent>

          {/* 搜索设置标签页 */}
          <TabsContent value="search" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <SearchSettings />
            </motion.div>
          </TabsContent>

          {/* API密钥标签页 */}
          <TabsContent value="apikeys" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>API密钥管理</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-6 flex flex-col items-center justify-center text-center">
                    <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Shield className="size-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">API密钥管理功能</h3>
                    <p className="text-muted-foreground max-w-md">
                      此功能正在开发中，即将上线。您将能够管理各种API提供商的密钥。
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* 数据管理标签页 */}
          <TabsContent value="data" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <DataManagement />
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}