"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { closeSettingsDialog, setActiveSettingsTab, resetAddModelFlag } from "@/redux/slices/settingsSlice";
import { motion } from "framer-motion";
import { Database, Globe, Rss, Server, Settings } from "lucide-react";
import { useEffect } from "react";
import ModelSettings from "@/components/models/ModelSettings";
import AvatarSelector from "@/app/settings/AvatarSelector";
import DataManagement from "@/app/settings/DataManagement";
import RssSettings from "@/app/settings/RssSettings";

export const SettingsDialog = () => {
  const dispatch = useAppDispatch();
  const { isSettingsDialogOpen, activeSettingsTab, shouldOpenAddModel } = useAppSelector((state) => state.settings);
  const { selectedModelId } = useAppSelector((state) => state.models);

  const handleClose = () => {
    dispatch(closeSettingsDialog());
  };

  const handleTabChange = (tab: string) => {
    dispatch(setActiveSettingsTab(tab));
  };

  // 当显示模型标签页且shouldOpenAddModel为true时，重置标志
  useEffect(() => {
    if (activeSettingsTab === 'models' && shouldOpenAddModel) {
      // 延迟重置，确保ModelSettings组件已经接收到了initialAddModelOpen参数
      setTimeout(() => {
        dispatch(resetAddModelFlag());
      }, 100);
    }
  }, [activeSettingsTab, shouldOpenAddModel, dispatch]);

  return (
    <Dialog open={isSettingsDialogOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] w-full h-[85vh] flex flex-col sm:max-w-[90vw] lg:max-w-6xl xl:max-w-7xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            设置
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          <Tabs value={activeSettingsTab} onValueChange={handleTabChange} className="h-full flex flex-col">
            <div className="bg-card/50 backdrop-blur-sm border rounded-lg shadow-sm p-1 flex-shrink-0">
              <TabsList className="w-full grid grid-cols-4 gap-1 bg-transparent">
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
                <TabsTrigger value="rss" className="flex gap-2 items-center justify-center">
                  <Rss className="h-4 w-4" />
                  <span className="hidden md:inline">RSS订阅</span>
                  <span className="md:hidden">RSS</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* 常规设置标签页 */}
            <TabsContent value="general" className="flex-1 overflow-auto mt-4 space-y-6">
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
            <TabsContent value="models" className="flex-1 overflow-auto mt-4">
              <ModelSettings 
                modelId={selectedModelId || ''} 
                initialAddModelOpen={shouldOpenAddModel}
              />
            </TabsContent>

            {/* 数据管理标签页 */}
            <TabsContent value="data" className="flex-1 overflow-auto mt-4">
              <DataManagement />
            </TabsContent>

            {/* RSS订阅标签页 */}
            <TabsContent value="rss" className="flex-1 overflow-auto mt-4">
              <RssSettings />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 