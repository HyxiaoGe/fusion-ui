"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { closeSettingsDialog, setActiveSettingsTab } from "@/redux/slices/settingsSlice";
import { setThemeMode } from "@/redux/slices/themeSlice";
import { motion } from "framer-motion";
import { Database, Settings, Sun, Moon, Laptop } from "lucide-react";
import DataManagement from "@/app/settings/DataManagement";
import MemoryManagement from "@/app/settings/MemoryManagement";

export const SettingsDialog = () => {
  const dispatch = useAppDispatch();
  const { isSettingsDialogOpen, activeSettingsTab } = useAppSelector((state) => state.settings);
  const { mode } = useAppSelector((state) => state.theme);

  const handleClose = () => {
    dispatch(closeSettingsDialog());
  };

  const handleTabChange = (tab: string) => {
    dispatch(setActiveSettingsTab(tab));
  };

  const handleThemeChange = (themeMode: 'light' | 'dark' | 'system') => {
    dispatch(setThemeMode(themeMode));
  };

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
              <TabsList className="w-full grid grid-cols-2 gap-1 bg-transparent">
                <TabsTrigger value="general" className="flex gap-2 items-center justify-center">
                  <Settings className="h-4 w-4" />
                  <span className="hidden md:inline">常规设置</span>
                  <span className="md:hidden">常规</span>
                </TabsTrigger>
                <TabsTrigger value="data" className="flex gap-2 items-center justify-center">
                  <Database className="h-4 w-4" />
                  <span className="hidden md:inline">数据管理</span>
                  <span className="md:hidden">数据</span>
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
                      <Sun className="h-5 w-5 text-primary" />
                      主题设置
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <h3 className="font-medium">选择主题模式</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button
                          onClick={() => handleThemeChange('light')}
                          className={`p-4 rounded-lg border transition-all hover:shadow-md ${
                            mode === 'light'
                              ? 'border-primary bg-primary/5 shadow-md'
                              : 'border-muted hover:border-primary/50'
                          }`}
                        >
                          <div className="flex flex-col items-center gap-2">
                            <Sun className={`h-6 w-6 ${mode === 'light' ? 'text-amber-500' : 'text-muted-foreground'}`} />
                            <span className="font-medium">浅色模式</span>
                            <span className="text-xs text-muted-foreground">明亮清晰的界面</span>
                          </div>
                        </button>

                        <button
                          onClick={() => handleThemeChange('dark')}
                          className={`p-4 rounded-lg border transition-all hover:shadow-md ${
                            mode === 'dark'
                              ? 'border-primary bg-primary/5 shadow-md'
                              : 'border-muted hover:border-primary/50'
                          }`}
                        >
                          <div className="flex flex-col items-center gap-2">
                            <Moon className={`h-6 w-6 ${mode === 'dark' ? 'text-indigo-400' : 'text-muted-foreground'}`} />
                            <span className="font-medium">深色模式</span>
                            <span className="text-xs text-muted-foreground">护眼的深色界面</span>
                          </div>
                        </button>

                        <button
                          onClick={() => handleThemeChange('system')}
                          className={`p-4 rounded-lg border transition-all hover:shadow-md ${
                            mode === 'system'
                              ? 'border-primary bg-primary/5 shadow-md'
                              : 'border-muted hover:border-primary/50'
                          }`}
                        >
                          <div className="flex flex-col items-center gap-2">
                            <Laptop className={`h-6 w-6 ${mode === 'system' ? 'text-blue-500' : 'text-muted-foreground'}`} />
                            <span className="font-medium">跟随系统</span>
                            <span className="text-xs text-muted-foreground">自动跟随系统设置</span>
                          </div>
                        </button>
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
                <MemoryManagement />
              </motion.div>
            </TabsContent>

            {/* 数据管理标签页 */}
            <TabsContent value="data" className="flex-1 overflow-auto mt-4">
              <DataManagement />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 
