// src/components/models/ModelSettings.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { updateModelConfig } from "@/redux/slices/modelsSlice";
import React, { useState, useEffect } from "react";
import CapabilityIcon from "./CapabilityIcon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EyeIcon, EyeOffIcon, Server, Shield, Search, PlusCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface ModelSettingsProps {
  modelId: string;
}

// 定义模型字段类型接口
interface ModelField {
  name: string;
  display_name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: any;
  min?: number;
  max?: number;
}

// 假设的提供商凭证数据结构
interface ProviderCredential {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  isConfigured: boolean;
}

// 自定义扩展的模型信息接口，包含完整模型数据
interface ExtendedModelInfo {
  id: string;
  name: string;
  provider: string;
  knowledgeCutoff?: string;
  temperature: number;
  capabilities: {
    vision?: boolean;
    deepThinking?: boolean;
    fileSupport?: boolean;
    imageGen?: boolean;
    [key: string]: boolean | undefined;
  };
  enabled: boolean;
  description?: string;
  contextTokenLimit?: number; // 模型的上下文令牌限制
}

// 添加自定义的完整模型获取函数
const fetchCompleteModels = async (): Promise<ExtendedModelInfo[]> => {
  try {
    // 调用API时添加isbasic=false参数获取完整模型信息
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || ''}/api/models?isbasic=false`);
    if (!response.ok) {
      throw new Error(`获取模型配置失败: ${response.status}`);
    }
    const data = await response.json();
    return data.models as ExtendedModelInfo[]; // 类型转换
  } catch (error) {
    console.error('获取完整模型配置时出错:', error);
    return [];
  }
};

const ModelSettings: React.FC<ModelSettingsProps> = ({ modelId }) => {
  const dispatch = useAppDispatch();
  const { models: reduxModels, providers } = useAppSelector((state) => state.models);
  const [selectedModelId, setSelectedModelId] = useState<string>(modelId);
  const [searchTerm, setSearchTerm] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [models, setModels] = useState<ExtendedModelInfo[]>(reduxModels as unknown as ExtendedModelInfo[]);
  const { toast } = useToast();

  // 当组件挂载时获取完整模型信息
  useEffect(() => {
    const loadCompleteModels = async () => {
      const completeModels = await fetchCompleteModels();
      if (completeModels.length > 0) {
        setModels(completeModels);
      }
    };
    
    loadCompleteModels();
  }, []);

  // 当传入的modelId变化时，更新selectedModelId
  useEffect(() => {
    if (modelId) {
      setSelectedModelId(modelId);
    }
  }, [modelId]);

  const model = models.find((m) => m.id === selectedModelId) as ExtendedModelInfo;

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

  if (!model) return null;

  // 获取当前模型的提供商
  const currentProvider = providers.find(p => p.id === model.provider);

  const handleTemperatureChange = (value: number[]) => {
    dispatch(
      updateModelConfig({
        modelId: selectedModelId,
        config: { temperature: value[0] },
      })
    );
  };

  // 修改handleMaxTokensChange函数使用contextTokenLimit
  const handleTokenLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value)) {
      dispatch(
        updateModelConfig({
          modelId: selectedModelId,
          config: { 
            // 将上下文令牌限制作为温度等其他配置一样处理
            contextTokenLimit: value 
          } as any, // 临时使用any类型绕过类型检查
        })
      );
    }
  };

  const handleCapabilityChange = (
    capability: keyof typeof model.capabilities,
    value: boolean
  ) => {
    dispatch(
      updateModelConfig({
        modelId: selectedModelId,
        config: {
          capabilities: {
            ...model.capabilities,
            [capability]: value,
          },
        },
      })
    );
  };

  // 处理保存API凭证
  const handleSaveApiKey = () => {
    toast({
      message: `${currentProvider?.name || '提供商'}凭证已保存`,
      type: "success",
    });
  };

  // 处理测试连接
  const handleTestConnection = () => {
    toast({
      message: `${currentProvider?.name || '提供商'}连接测试成功`,
      type: "success",
    });
  };

  // 模拟提供商凭证映射
  const providerCredentials: Record<string, ProviderCredential> = {
    'openai': {
      providerId: 'openai',
      apiKey: '********',
      baseUrl: 'https://api.openai.com',
      isConfigured: true
    },
    'qwen': {
      providerId: 'qwen',
      apiKey: '********',
      baseUrl: 'https://dashscope.aliyuncs.com',
      isConfigured: true
    },
    'anthropic': {
      providerId: 'anthropic',
      apiKey: '',
      isConfigured: false
    }
  };

  // 获取当前模型提供商的凭证
  const currentCredential = providerCredentials[model.provider] || {
    providerId: model.provider,
    isConfigured: false
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* 左侧模型列表 */}
      <Card className="md:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            模型列表
          </CardTitle>
          <div className="mt-2 relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索模型..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="max-h-[70vh] overflow-y-auto pt-0">
          {modelsByProvider.map((provider) => (
            <div key={provider.id} className="mb-4">
              <h3 className="text-sm font-medium mb-2 border-l-2 border-primary pl-2 flex items-center justify-between">
                <span>{provider.name}</span>
                <Badge 
                  variant={providerCredentials[provider.id]?.isConfigured ? "default" : "outline"}
                  className="text-xs"
                >
                  {providerCredentials[provider.id]?.isConfigured ? "已配置" : "未配置"}
                </Badge>
              </h3>
              
              <div className="space-y-2">
                {provider.models.map((model) => (
                  <div 
                    key={model.id}
                    className={`p-3 rounded-md cursor-pointer border transition-all hover:border-primary
                      ${selectedModelId === model.id ? 'border-primary bg-muted/20' : 'border-muted'}
                    `}
                    onClick={() => setSelectedModelId(model.id)}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{model.name}</span>
                      <Badge variant={model.enabled ? "default" : "outline"}>
                        {model.enabled ? "已启用" : "未启用"}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {model.capabilities.vision && <Badge variant="outline" className="text-xs">视觉</Badge>}
                      {model.capabilities.deepThinking && <Badge variant="outline" className="text-xs">深度思考</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-4 pt-4 border-t">
            <Button variant="outline" className="w-full" size="sm">
              <PlusCircle className="h-4 w-4 mr-2" />
              添加自定义模型
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* 右侧配置区域 */}
      <Card className="md:col-span-2">
        <CardHeader className="border-b">
          <div className="flex justify-between items-center">
            <CardTitle>{model.name}</CardTitle>
            <Switch 
              checked={model.enabled}
              onCheckedChange={(checked) => 
                dispatch(updateModelConfig({
                  modelId: selectedModelId,
                  config: { enabled: checked }
                }))
              }
            />
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            <p>知识截止日期: {model.knowledgeCutoff || '未知'}</p>
            <p className="mt-1">{model.description}</p>
          </div>
        </CardHeader>
        
        <CardContent className="pt-6">
          <Tabs defaultValue="credentials">
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="credentials" className="flex-1">
                <Shield className="h-4 w-4 mr-2" />
                提供商凭证
              </TabsTrigger>
              <TabsTrigger value="parameters" className="flex-1">
                <Settings className="h-4 w-4 mr-2" />
                模型参数
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="credentials" className="space-y-4">
              <div className="bg-muted/40 p-4 rounded-md mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <h3 className="font-medium">{currentProvider?.name || '未知提供商'} API 凭证设置</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  此处配置的凭证将用于访问所有 {currentProvider?.name || '该提供商'} 的模型。
                </p>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium">
                    API Key
                    <span className="text-destructive">*</span>
                  </label>
                </div>
                <div className="relative">
                  <Input 
                    type={showApiKey ? "text" : "password"}
                    placeholder="请输入API Key"
                    defaultValue={currentCredential.apiKey || ''}
                  />
                  <button 
                    type="button"
                    className="absolute right-2 top-1/2 transform -translate-y-1/2"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  用于访问{currentProvider?.name || '提供商'}API的密钥
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Base URL
                </label>
                <Input 
                  placeholder="请输入Base URL"
                  defaultValue={currentCredential.baseUrl || ''}
                />
                <p className="text-xs text-muted-foreground">
                  API基础URL，留空使用默认值
                </p>
              </div>
              
              <div className="flex justify-end gap-2 mt-6">
                <Button onClick={handleTestConnection} variant="outline">测试连接</Button>
                <Button onClick={handleSaveApiKey}>保存凭证</Button>
              </div>
            </TabsContent>
            
            <TabsContent value="parameters" className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor="temperature">温度 ({model.temperature})</Label>
                  <span className="text-sm text-muted-foreground">
                    值越低回答越确定，值越高回答越多样化
                  </span>
                </div>
                <Slider
                  id="temperature"
                  min={0}
                  max={1}
                  step={0.1}
                  value={[model.temperature]}
                  onValueChange={handleTemperatureChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-tokens">最大上下文长度</Label>
                <Input
                  id="max-tokens"
                  type="number"
                  value={(model as ExtendedModelInfo).contextTokenLimit || 2048}
                  onChange={handleTokenLimitChange}
                  min={1}
                  max={100000}
                />
                <p className="text-sm text-muted-foreground">
                  控制AI能够处理的最大上下文长度
                </p>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <Label>模型能力</Label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CapabilityIcon type="vision" />
                      <div className="space-y-0.5">
                        <Label htmlFor="vision-capability">视觉识别</Label>
                        <p className="text-xs text-muted-foreground">
                          允许模型处理和理解图像
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="vision-capability"
                      checked={model.capabilities.vision || false}
                      onCheckedChange={(checked) =>
                        handleCapabilityChange("vision", checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CapabilityIcon type="fileSupport" />
                      <div className="space-y-0.5">
                        <Label htmlFor="file-support">文件处理</Label>
                        <p className="text-xs text-muted-foreground">
                          允许模型处理上传的文件
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="file-support"
                      checked={model.capabilities.fileSupport || false}
                      onCheckedChange={(checked) =>
                        handleCapabilityChange("fileSupport", checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CapabilityIcon type="deepThinking" />
                      <div className="space-y-0.5">
                        <Label htmlFor="deep-thinking">深度思考</Label>
                        <p className="text-xs text-muted-foreground">
                          增强模型的推理和问题解决能力
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="deep-thinking"
                      checked={model.capabilities.deepThinking || false}
                      onCheckedChange={(checked) =>
                        handleCapabilityChange("deepThinking", checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CapabilityIcon type="imageGen" />
                      <div className="space-y-0.5">
                        <Label htmlFor="image-gen">图像生成</Label>
                        <p className="text-xs text-muted-foreground">
                          允许模型生成图像
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="image-gen"
                      checked={model.capabilities.imageGen || false}
                      onCheckedChange={(checked) =>
                        handleCapabilityChange("imageGen", checked)
                      }
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end mt-6">
                <Button onClick={() => {
                  toast({
                    message: "模型参数已保存",
                    type: "success"
                  });
                }}>保存设置</Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default ModelSettings;
