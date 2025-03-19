"use client";

import MainLayout from "@/components/layouts/MainLayout";
import ModelSettings from "@/components/models/ModelSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppSelector } from "@/redux/hooks";
import { Link } from "lucide-react";
import AvatarSelector from "./AvatarSelector";
import DataManagement from "./DataManagement";
import SearchSettings from "./SearchSettings";
import ThemeSelector from "./ThemeSelector";

export default function SettingsPage() {
  const { selectedModelId } = useAppSelector((state) => state.models);

  return (
    <MainLayout>
      <div className="container py-6 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">设置</h1>

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">常规设置</TabsTrigger>
            <TabsTrigger value="appearance">外观</TabsTrigger>
            <TabsTrigger value="models">模型管理</TabsTrigger>
            <TabsTrigger value="search">搜索设置</TabsTrigger>
            <TabsTrigger value="apikeys">API密钥</TabsTrigger>
            <TabsTrigger value="data">数据管理</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>主题设置</CardTitle>
              </CardHeader>
              <CardContent>
                <ThemeSelector />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>外观</CardTitle>
              </CardHeader>
              <CardContent>
                <AvatarSelector />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="models" className="mt-4">
            <div className="flex justify-between mb-4">
              <h2 className="text-xl font-bold">模型配置</h2>
              <Button variant="outline" asChild>
                <Link href="/settings/models">查看所有模型</Link>
              </Button>
            </div>
            {selectedModelId && <ModelSettings modelId={selectedModelId} />}
          </TabsContent>

          <TabsContent value="apikeys" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>API密钥管理</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* API密钥设置将在后续实现 */}
                <p>此功能正在开发中...</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="mt-4">
            <DataManagement />
          </TabsContent>

          <TabsContent value="search" className="mt-4">
            <SearchSettings />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
