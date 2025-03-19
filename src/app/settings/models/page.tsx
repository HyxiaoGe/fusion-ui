// src/app/settings/models/page.tsx
"use client";

import MainLayout from "@/components/layouts/MainLayout";
import ModelCard from "@/components/models/ModelCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppSelector } from "@/redux/hooks";
import { useState } from "react";

export default function ModelsPage() {
  const { models, providers } = useAppSelector((state) => state.models);
  const [searchTerm, setSearchTerm] = useState("");

  // 按提供商分组模型
  const modelsByProvider = [...providers] // 创建副本再排序
    .sort((a, b) => a.order - b.order)
    .map((provider) => ({
      ...provider,
      models: models
        .filter((model) => model.provider === provider.id)
        .filter(
          (model) =>
            model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            model.id.toLowerCase().includes(searchTerm.toLowerCase())
        ),
    }))
    .filter((group) => group.models.length > 0);

  return (
    <MainLayout>
      <div className="container py-6 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">可用模型</h1>

        <div className="mb-6">
          <Input
            placeholder="搜索模型..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
        </div>

        {modelsByProvider.map((provider) => (
          <div key={provider.id} className="mb-8">
            <h2 className="text-xl font-semibold mb-4">{provider.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {provider.models.map((model) => (
                <ModelCard key={model.id} model={model} />
              ))}
            </div>
          </div>
        ))}

        {modelsByProvider.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">没有找到匹配的模型</p>
            <Button
              variant="outline"
              onClick={() => setSearchTerm("")}
              className="mt-4"
            >
              清除搜索
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
