'use client';

import React from 'react';
import { useAppSelector } from '@/redux/hooks';
import MainLayout from '@/components/layouts/MainLayout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import ThemeSelector from './ThemeSelector';
import ModelSettings from '@/components/models/ModelSettings';
import AvatarSelector from './AvatarSelector';
import DataManagement from './DataManagement';

export default function SettingsPage() {
  const { selectedModelId } = useAppSelector(state => state.models);
  
  return (
    <MainLayout>
      <div className="container py-6 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">设置</h1>
        
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">常规设置</TabsTrigger>
            <TabsTrigger value="appearance">外观</TabsTrigger>
            <TabsTrigger value="models">模型配置</TabsTrigger>
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

        </Tabs>
      </div>
    </MainLayout>
  );
}