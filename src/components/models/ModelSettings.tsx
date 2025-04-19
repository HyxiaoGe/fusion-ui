"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { updateModelConfig } from "@/redux/slices/modelsSlice";
import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EyeIcon, EyeOffIcon, Server, Shield, Search, PlusCircle, Settings, Loader2, RefreshCw, ChevronRight, Copy, Check, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DateInput } from "@/components/ui/date-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";

interface ModelSettingsProps {
  modelId?: string;
  initialAddModelOpen?: boolean;
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

// 凭证接口
interface ModelCredential {
  id: number;
  model_id: string;
  name: string;
  is_default: boolean;
  credentials: {
    api_key: string;
    base_url?: string;
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}

// 模型详情接口
interface ModelDetail {
  name: string;
  modelId: string;
  provider: string;
  knowledgeCutoff?: string;
  capabilities: {
    deepThinking?: boolean;
    fileSupport?: boolean;
    imageGen?: boolean;
    [key: string]: boolean | undefined;
  };
  priority: number;
  enabled: boolean;
  description: string;
  pricing?: {
    input: number;
    output: number;
    unit: string;
  };
  auth_config: {
    fields: ModelField[];
    auth_type: string;
  };
  model_configuration: {
    params: ModelField[];
  };
}

// 基础模型信息接口
interface BasicModelInfo {
  name: string;
  modelId: string;
  provider: string;
  enabled: boolean;
  capabilities: {
    deepThinking?: boolean;
    fileSupport?: boolean;
    imageGen?: boolean;
    [key: string]: boolean | undefined;
  };
}

// 提供商接口
interface ProviderInfo {
  id: string;
  name: string;
  order: number;
  isConfigured?: boolean;
}

// 为提供商图标添加错误处理
const ProviderIcon: React.FC<{ providerId: string }> = ({ providerId }) => {
  const [error, setError] = useState(false);
  
  const handleError = () => {
    setError(true);
  };
  
  if (error) {
    return <Server className="h-5 w-5 mr-2 text-muted-foreground" />;
  }
  
  return (
    <img 
      src={`/assets/providers/${providerId.toLowerCase()}.svg`} 
      alt={providerId}
      className="h-5 w-5 mr-2"
      onError={handleError}
    />
  );
};

// 获取模型列表
const fetchModels = async () => {
  try {
    const url = `${process.env.NEXT_PUBLIC_API_BASE_URL || ''}/api/models`;
    console.log('获取模型列表:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store'
      }
    });
    
    if (!response.ok) {
      throw new Error(`获取模型列表失败: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('获取到的模型列表:', data);
    return data.models || [];
  } catch (error) {
    console.error("获取模型列表失败:", error);
    return Promise.reject(error);
  }
};

// 获取模型详情
const fetchModelDetail = async (modelId: string) => {
  try {
    const url = `${process.env.NEXT_PUBLIC_API_BASE_URL || ''}/api/models/${modelId}`;
    console.log('获取模型详情:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store'
      }
    });
    
    if (!response.ok) {
      throw new Error(`获取模型详情失败: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('获取到的模型详情:', data);
    return data;
  } catch (error) {
    console.error(`获取模型[${modelId}]详情失败:`, error);
    return Promise.reject(error);
  }
};

// 获取模型凭证
const fetchModelCredentials = async (modelId: string) => {
  try {
    const url = `${process.env.NEXT_PUBLIC_API_BASE_URL || ''}/api/credentials?model_id=${modelId}`;
    console.log('获取模型凭证:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store'
      }
    });
    
    if (!response.ok) {
      throw new Error(`获取模型凭证失败: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('获取到的模型凭证:', data);
    return data.credentials || [];
  } catch (error) {
    console.error(`获取模型[${modelId}]凭证失败:`, error);
    return Promise.reject(error);
  }
};

// 测试模型凭证
const testModelCredential = async (modelId: string, credentials: any) => {
  try {
    const url = `${process.env.NEXT_PUBLIC_API_BASE_URL || ''}/api/credentials/test`;
    console.log('测试模型凭证:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model_id: modelId,
        credentials: credentials
      })
    });
    
    if (!response.ok) {
      throw new Error(`测试模型凭证失败: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`测试模型[${modelId}]凭证失败:`, error);
    return Promise.reject(error);
  }
};

// 保存模型凭证
const saveModelCredential = async (modelId: string, name: string, isDefault: boolean, credentials: any, credentialId?: number) => {
  try {
    let url = `${process.env.NEXT_PUBLIC_API_BASE_URL || ''}/api/credentials`;
    let method = 'POST';
    
    // 如果有凭证ID，则是更新操作
    if (credentialId) {
      url = `${url}/${credentialId}`;
      method = 'PUT';
    }
    
    console.log(`${credentialId ? '更新' : '创建'}模型凭证:`, url);
    
    const response = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model_id: modelId,
        name: name,
        is_default: isDefault,
        credentials: credentials
      })
    });
    
    if (!response.ok) {
      throw new Error(`${credentialId ? '更新' : '创建'}模型凭证失败: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`${credentialId ? '更新' : '创建'}模型[${modelId}]凭证失败:`, error);
    return Promise.reject(error);
  }
};

// 添加复制功能组件
const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = (e: React.MouseEvent) => {
    // 阻止事件冒泡，防止触发父元素的事件
    e.stopPropagation();
    
    // 直接使用DOM API复制文本，避免React状态更新
    try {
      navigator.clipboard.writeText(text);
      setCopied(true);
      
      // 显示复制成功的提示，但不使用toast避免重新渲染
      const notification = document.createElement('div');
      notification.className = 'fixed top-4 right-4 z-50 bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200 px-4 py-2 rounded shadow-lg';
      notification.textContent = '已复制到剪贴板';
      document.body.appendChild(notification);
      
      setTimeout(() => {
        document.body.removeChild(notification);
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <button 
      onClick={handleCopy} 
      className={`ml-2 p-1 rounded-md hover:bg-primary/10 transition-colors ${
        copied ? 'text-green-500' : 'text-muted-foreground hover:text-primary'
      }`}
      title="复制到剪贴板"
    >
      {copied ? (
        <Check className="h-4 w-4" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
};

const ModelSettings: React.FC<ModelSettingsProps> = ({ modelId, initialAddModelOpen = false }) => {
  const dispatch = useAppDispatch();
  const { providers } = useAppSelector((state) => state.models);
  const [searchTerm, setSearchTerm] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  
  // 新增状态
  const [selectedProviderIndex, setSelectedProviderIndex] = useState<number | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(modelId || null);
  const [models, setModels] = useState<BasicModelInfo[]>([]);
  const [modelDetail, setModelDetail] = useState<ModelDetail | null>(null);
  const [modelCredentials, setModelCredentials] = useState<ModelCredential[]>([]);
  const [selectedCredential, setSelectedCredential] = useState<ModelCredential | null>(null);
  const [formCredentials, setFormCredentials] = useState<Record<string, any>>({});
  
  // 用于表单
  const [credentialName, setCredentialName] = useState<string>('默认');
  const [isDefault, setIsDefault] = useState<boolean>(true);
  
  // 新增添加模型对话框状态
  const [isAddModelOpen, setIsAddModelOpen] = useState(initialAddModelOpen);
  
  // 新增添加模型相关状态
  const [newModel, setNewModel] = useState<{
    name: string;
    modelId: string;
    knowledgeCutoff: string;
    description: string;
    imageGen: boolean;
    deepThinking: boolean;
    fileSupport: boolean;
    priority: number;
    inputPrice: string;
    outputPrice: string;
    priceUnit: string;
  }>({
    name: '',
    modelId: '',
    knowledgeCutoff: '',
    description: '',
    imageGen: false,
    deepThinking: false,
    fileSupport: false,
    priority: 10,
    inputPrice: '0.0',
    outputPrice: '0.0',
    priceUnit: 'USD'
  });
  
  // 获取模型列表
  useEffect(() => {
    const loadModels = async () => {
      setIsLoading(true);
      try {
        const modelData = await fetchModels();
        setModels(modelData);
        
        // 如果传入了modelId，则自动选择对应的模型
        if (modelId) {
          setSelectedModelId(modelId);
          // 查找模型所属的提供商
          const model = modelData.find((m: BasicModelInfo) => m.modelId === modelId);
          if (model) {
            const providerIndex = providers.findIndex(p => p.id === model.provider);
            if (providerIndex !== -1) {
              setSelectedProviderIndex(providerIndex);
            }
          }
        }
      } catch (error) {
        console.error("Error loading models:", error);
        toast({
          message: "获取模型列表失败，请稍后再试",
          type: "error",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    loadModels();
  }, [providers, modelId, toast]);
  
  // 当选择了模型时，获取模型详情和凭证
  useEffect(() => {
    const loadModelDetail = async () => {
      if (!selectedModelId) return;
      
      // 如果已经有数据并且模型ID没变，则不重新加载
      if (modelDetail && modelDetail.modelId === selectedModelId) {
        return;
      }
      
      setIsLoading(true);
      try {
        // 并行获取模型详情和凭证
        const [detailData, credentialsData] = await Promise.all([
          fetchModelDetail(selectedModelId),
          fetchModelCredentials(selectedModelId)
        ]);
        
        setModelDetail(detailData);
        setModelCredentials(credentialsData);
        
        // 如果有凭证，则选择默认凭证
        if (credentialsData.length > 0) {
          const defaultCred = credentialsData.find((c: ModelCredential) => c.is_default) || credentialsData[0];
          setSelectedCredential(defaultCred);
          setFormCredentials(defaultCred.credentials);
          setCredentialName(defaultCred.name);
          setIsDefault(defaultCred.is_default);
        } else {
          // 没有凭证，初始化表单
          setSelectedCredential(null);
          setFormCredentials({});
          setCredentialName('默认');
          setIsDefault(true);
        }
      } catch (error) {
        console.error(`Error loading model(${selectedModelId}) detail:`, error);
        toast({
          message: "获取模型详情失败，请稍后再试",
          type: "error",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    loadModelDetail();
  }, [selectedModelId, toast]);
  
  // 刷新数据
  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      const modelData = await fetchModels();
      setModels(modelData);
      
      // 如果已选择了模型，则刷新模型详情和凭证
      if (selectedModelId) {
        const [detailData, credentialsData] = await Promise.all([
          fetchModelDetail(selectedModelId),
          fetchModelCredentials(selectedModelId)
        ]);
        
        setModelDetail(detailData);
        setModelCredentials(credentialsData);
        
        // 更新凭证状态
        if (credentialsData.length > 0) {
          if (selectedCredential) {
            // 尝试找回之前选择的凭证
            const prevCred = credentialsData.find((c: ModelCredential) => c.id === selectedCredential.id);
            if (prevCred) {
              setSelectedCredential(prevCred);
              setFormCredentials(prevCred.credentials);
              setCredentialName(prevCred.name);
              setIsDefault(prevCred.is_default);
            } else {
              // 找不到则选择默认凭证
              const defaultCred = credentialsData.find((c: ModelCredential) => c.is_default) || credentialsData[0];
              setSelectedCredential(defaultCred);
              setFormCredentials(defaultCred.credentials);
              setCredentialName(defaultCred.name);
              setIsDefault(defaultCred.is_default);
            }
          } else {
            // 之前没有选择凭证，选择默认凭证
            const defaultCred = credentialsData.find((c: ModelCredential) => c.is_default) || credentialsData[0];
            setSelectedCredential(defaultCred);
            setFormCredentials(defaultCred.credentials);
            setCredentialName(defaultCred.name);
            setIsDefault(defaultCred.is_default);
          }
        } else {
          // 没有凭证，初始化表单
          setSelectedCredential(null);
          setFormCredentials({});
          setCredentialName('默认');
          setIsDefault(true);
        }
      }
      
      toast({
        message: "数据已刷新",
        type: "success",
      });
    } catch (error) {
      console.error("Error refreshing data:", error);
      toast({
        message: "刷新数据失败，请稍后再试",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // 处理保存API凭证
  const handleSaveApiKey = async () => {
    if (!selectedModelId || !modelDetail) {
      toast({
        message: "未选择模型，无法保存凭证",
        type: "error",
      });
      return;
    }
    
    // 检查必填字段
    const missingFields = modelDetail.auth_config.fields
      .filter(field => field.required)
      .filter(field => !formCredentials[field.name]);
    
    if (missingFields.length > 0) {
      toast({
        message: `请填写必填字段: ${missingFields.map(f => f.display_name).join(', ')}`,
        type: "error",
      });
      return;
    }
    
    try {
      setIsLoading(true);
      await saveModelCredential(
        selectedModelId,
        credentialName,
        isDefault,
        formCredentials,
        selectedCredential?.id
      );
      
      // 刷新凭证列表
      const credentialsData = await fetchModelCredentials(selectedModelId);
      setModelCredentials(credentialsData);
      
      // 更新选中的凭证
      const newSelectedCred = credentialsData.find((c: ModelCredential) => c.name === credentialName) || 
                         (credentialsData.length > 0 ? credentialsData[0] : null);
      
      if (newSelectedCred) {
        setSelectedCredential(newSelectedCred);
        setFormCredentials(newSelectedCred.credentials);
        setCredentialName(newSelectedCred.name);
        setIsDefault(newSelectedCred.is_default);
      }
      
      toast({
        message: `${modelDetail.name}的凭证已保存`,
        type: "success",
      });
    } catch (error) {
      console.error("Error saving credential:", error);
      toast({
        message: "保存凭证失败，请稍后再试",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // 处理测试连接
  const handleTestConnection = async () => {
    if (!selectedModelId || !modelDetail) {
      toast({
        message: "未选择模型，无法测试连接",
        type: "error",
      });
      return;
    }
    
    // 检查必填字段
    const missingFields = modelDetail.auth_config.fields
      .filter(field => field.required)
      .filter(field => !formCredentials[field.name]);
    
    if (missingFields.length > 0) {
      toast({
        message: `请填写必填字段: ${missingFields.map(f => f.display_name).join(', ')}`,
        type: "error",
      });
      return;
    }
    
    try {
      setIsLoading(true);
      const result = await testModelCredential(selectedModelId, formCredentials);
      
      if (result.success) {
        toast({
          message: `连接测试成功: ${result.message || '凭证有效'}`,
          type: "success",
        });
      } else {
        toast({
          message: `连接测试失败: ${result.message || '凭证无效'}`,
          type: "error",
        });
      }
    } catch (error) {
      console.error("Error testing connection:", error);
      toast({
        message: "测试连接失败，请稍后再试",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // 更新凭证字段
  const handleCredentialChange = (name: string, value: any) => {
    setFormCredentials(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // 按提供商分组模型
  const modelsByProvider = providers
    .map((provider, index) => ({
      ...provider,
      models: models
        .filter((model: BasicModelInfo) => model.provider === provider.id)
        .filter((model: BasicModelInfo) => 
          model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          model.modelId.toLowerCase().includes(searchTerm.toLowerCase())
        ),
      isSelected: index === selectedProviderIndex,
      isConfigured: true // 这里先默认为true，实际项目中应该根据数据确定
    }))
    .filter((group) => searchTerm === '' || group.models.length > 0);
  
  // 当前选中的提供商
  const currentProvider = selectedProviderIndex !== null ? modelsByProvider[selectedProviderIndex] : null;
  
  // 处理添加模型
  const handleAddModel = async () => {
    if (!currentProvider) {
      toast({
        message: "请先选择一个提供商",
        type: "error",
      });
      return;
    }
    
    // 验证必填字段
    if (!newModel.name || !newModel.modelId) {
      toast({
        message: "模型名称和模型ID为必填项",
        type: "error",
      });
      return;
    }
    
    try {
      setIsLoading(true);
      
      // 构建请求数据
      const addModelData = {
        name: newModel.name,
        modelId: newModel.modelId,
        provider: currentProvider.id,
        knowledgeCutoff: newModel.knowledgeCutoff || new Date().getFullYear() + '-' + (new Date().getMonth() + 1).toString().padStart(2, '0'),
        capabilities: {
          imageGen: newModel.imageGen,
          deepThinking: newModel.deepThinking,
          fileSupport: newModel.fileSupport,
        },
        priority: newModel.priority,
        enabled: true,
        description: newModel.description,
        pricing: {
          input: parseFloat(newModel.inputPrice) || 0,
          output: parseFloat(newModel.outputPrice) || 0,
          unit: newModel.priceUnit
        }
        // auth_config和model_configuration将从提供商继承
      };
      
      console.log('添加模型数据:', addModelData);
      
      // 模拟API调用成功
      await new Promise(resolve => setTimeout(resolve, 500));
      
      toast({
        message: `模型"${newModel.name}"已添加`,
        type: "success",
      });
      
      // 重新加载模型列表
      await handleRefresh();
      
      // 关闭对话框
      setIsAddModelOpen(false);
      
      // 重置表单
      setNewModel({
        name: '',
        modelId: '',
        knowledgeCutoff: '',
        description: '',
        imageGen: false,
        deepThinking: false,
        fileSupport: false,
        priority: 10,
        inputPrice: '0.0',
        outputPrice: '0.0',
        priceUnit: 'USD'
      });
    } catch (error) {
      console.error("添加模型失败:", error);
      toast({
        message: "添加模型失败，请稍后再试",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // 如果数据正在加载或没有找到模型，显示加载状态
  if (isLoading && !modelDetail && !currentProvider) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载模型数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full h-full">
      {/* 左侧提供商列表 */}
      <Card className="lg:col-span-2 flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            模型提供商
            {isLoading && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
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
          <div className="mt-2 flex justify-end">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              {isLoading ? '加载中...' : '刷新'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-grow overflow-y-auto pt-0">
          {modelsByProvider.map((provider, index) => (
            <div key={provider.id} className="mb-4">
              <div 
                className={`p-3 rounded-md cursor-pointer border transition-all hover:border-primary
                  ${provider.isSelected ? 'border-primary bg-muted/20' : 'border-muted'}
                `}
                onClick={() => setSelectedProviderIndex(index)}
              >
                <div className="flex justify-between items-center">
                  <div className="font-medium flex items-center">
                    <ProviderIcon providerId={provider.id} />
                    {provider.name}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </div>
                  <Badge 
                    variant={provider.isConfigured ? "default" : "outline"}
                    className="text-xs"
                  >
                    {provider.isConfigured ? "已配置" : "未配置"}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {provider.models.length} 个模型可用
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      
      {/* 中间模型列表 */}
      <Card className="lg:col-span-3 flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <CardTitle className="flex items-center gap-2">
            {currentProvider ? currentProvider.name : '模型'} 列表
            {isLoading && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-grow overflow-y-auto pt-0">
          {currentProvider && currentProvider.models.length > 0 ? (
            <div className="space-y-2">
              {currentProvider.models.map((model) => (
                <div 
                  key={model.modelId}
                  className={`p-3 rounded-md cursor-pointer border transition-all hover:border-primary
                    ${selectedModelId === model.modelId ? 'border-primary bg-muted/20' : 'border-muted'}
                  `}
                  onClick={() => setSelectedModelId(model.modelId)}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium flex items-center">
                      <ProviderIcon providerId={model.provider} />
                      {model.name}
                    </span>
                    <Badge variant={model.enabled ? "default" : "outline"}>
                      {model.enabled ? "已启用" : "未启用"}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {model.capabilities.deepThinking && <Badge variant="outline" className="text-xs">深度思考</Badge>}
                    {model.capabilities.fileSupport && <Badge variant="outline" className="text-xs">文件支持</Badge>}
                    {model.capabilities.imageGen && <Badge variant="outline" className="text-xs">图像生成</Badge>}
                  </div>
                </div>
              ))}
              
              {/* 在模型列表中添加"添加自定义模型"按钮 */}
              <div 
                className="p-3 rounded-md cursor-pointer border border-dashed border-muted hover:border-primary transition-colors flex items-center justify-center"
                onClick={() => setIsAddModelOpen(true)}
              >
                <PlusCircle className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-muted-foreground">添加自定义模型</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {currentProvider ? (
                <div className="space-y-3">
                  <p>没有找到模型</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setIsAddModelOpen(true)}
                  >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    添加自定义模型
                  </Button>
                </div>
              ) : '请选择一个提供商'}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* 右侧配置区域 */}
      <Card className="lg:col-span-7 flex flex-col">
        {modelDetail ? (
          <>
            <CardHeader className="border-b flex-shrink-0">
              <div className="flex justify-between items-center">
                <CardTitle>{modelDetail.name}</CardTitle>
                <Switch 
                  checked={modelDetail.enabled}
                  onCheckedChange={(checked) => 
                    dispatch(updateModelConfig({
                      modelId: selectedModelId!,
                      config: { enabled: checked }
                    }))
                  }
                />
              </div>
              
              {/* 添加Model ID在名称下方 */}
              <div className="flex items-center mt-2 mb-1">
                <span className="text-xs text-muted-foreground mr-2">Model ID:</span>
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                  {modelDetail.modelId}
                </code>
                <CopyButton text={modelDetail.modelId} />
              </div>
              
              <div className="text-sm text-muted-foreground mt-1">
                <p>知识截止日期: {modelDetail.knowledgeCutoff || '未知'}</p>
                <p className="mt-1">{modelDetail.description}</p>
                
                {/* 添加定价信息 */}
                {modelDetail.pricing && (
                  <div className="mt-2 p-2 bg-muted/30 rounded-md border border-border flex items-center text-sm">
                    <DollarSign className="h-4 w-4 mr-1.5 text-green-500 flex-shrink-0" />
                    <div>
                      <span className="font-medium">模型定价:</span> 
                      <div className="flex flex-wrap gap-x-3 mt-0.5">
                        <span>输入: <strong>{modelDetail.pricing.input}</strong></span>
                        <span>输出: <strong>{modelDetail.pricing.output}</strong></span>
                        <span className="text-muted-foreground">{modelDetail.pricing.unit}/1K tokens</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* 添加模型参数 */}
                {modelDetail.model_configuration.params.length > 0 && (
                  <div className="mt-2 p-2 bg-muted/30 rounded-md border border-border text-sm">
                    <div className="flex items-center mb-1">
                      <Settings className="h-4 w-4 mr-1.5 text-blue-500 flex-shrink-0" />
                      <span className="font-medium">模型参数:</span>
                    </div>
                    <div className="space-y-2 mt-2">
                      {modelDetail.model_configuration.params.map(param => (
                        <div key={param.name} className="flex flex-wrap items-center gap-x-3">
                          <span className="font-medium">{param.display_name}:</span>
                          <code className="bg-background px-1.5 py-0.5 rounded text-xs font-mono">
                            {param.default}
                          </code>
                          {param.type === 'number' && param.min !== undefined && param.max !== undefined && (
                            <span className="text-xs text-muted-foreground">
                              范围: {param.min} - {param.max}
                            </span>
                          )}
                          {param.description && (
                            <span className="text-xs text-muted-foreground">
                              ({param.description})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>
            
            <CardContent className="pt-6 flex-grow overflow-y-auto">
              <Tabs defaultValue="credentials">
                <TabsList className="mb-4 w-full">
                  <TabsTrigger value="credentials" className="flex-1">
                    <Shield className="h-4 w-4 mr-2" />
                    凭证设置
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="credentials" className="space-y-4">
                  <div className="bg-muted/40 p-4 rounded-md mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-5 w-5 text-primary" />
                      <h3 className="font-medium">{modelDetail.name} 凭证设置</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      配置访问 {modelDetail.name} 所需的凭证信息。
                    </p>
                  </div>
                  
                  {/* 凭证选择器 */}
                  {modelCredentials.length > 0 && (
                    <div className="space-y-2 mb-4 pb-4 border-b">
                      <Label className="text-sm font-medium">选择凭证配置</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {modelCredentials.map((cred: ModelCredential) => (
                          <div 
                            key={cred.id}
                            className={`p-2 border rounded-md cursor-pointer transition-colors ${
                              selectedCredential?.id === cred.id ? 'border-primary bg-muted/20' : 'border-muted'
                            }`}
                            onClick={() => {
                              setSelectedCredential(cred);
                              setFormCredentials(cred.credentials);
                              setCredentialName(cred.name);
                              setIsDefault(cred.is_default);
                            }}
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-medium">{cred.name}</span>
                              {cred.is_default && (
                                <Badge variant="default" className="text-xs">默认</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              更新于 {new Date(cred.updated_at).toLocaleString()}
                            </p>
                          </div>
                        ))}
                        
                        <div 
                          className="p-2 border border-dashed border-muted rounded-md cursor-pointer flex items-center justify-center hover:border-primary transition-colors"
                          onClick={() => {
                            setSelectedCredential(null);
                            setFormCredentials({});
                            setCredentialName('新配置');
                            setIsDefault(false);
                          }}
                        >
                          <PlusCircle className="h-4 w-4 mr-2" />
                          <span>新建配置</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* 凭证名称 */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      配置名称
                    </Label>
                    <Input 
                      placeholder="请输入配置名称"
                      value={credentialName}
                      onChange={(e) => setCredentialName(e.target.value)}
                    />
                  </div>
                  
                  {/* 默认设置 */}
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="default-credential"
                      checked={isDefault}
                      onCheckedChange={setIsDefault}
                    />
                    <Label htmlFor="default-credential">设为默认凭证</Label>
                  </div>
                  
                  {/* 动态生成凭证字段 */}
                  {modelDetail.auth_config.fields.map(field => (
                    <div key={field.name} className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-sm font-medium">
                          {field.display_name}
                          {field.required && <span className="text-destructive">*</span>}
                        </Label>
                      </div>
                      <div className="relative">
                        {field.type === 'password' ? (
                          <>
                            <Input 
                              type={showApiKey ? "text" : "password"}
                              placeholder={`请输入${field.display_name}`}
                              value={formCredentials[field.name] || ''}
                              onChange={(e) => handleCredentialChange(field.name, e.target.value)}
                            />
                            <button 
                              type="button"
                              className="absolute right-2 top-1/2 transform -translate-y-1/2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowApiKey(!showApiKey);
                              }}
                            >
                              {showApiKey ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                            </button>
                          </>
                        ) : (
                          <Input 
                            type={field.type === 'number' ? 'number' : 'text'}
                            placeholder={`请输入${field.display_name}`}
                            value={formCredentials[field.name] || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === '') {
                                handleCredentialChange(field.name, '0.0');
                              } else {
                                const numValue = parseFloat(value);
                                if (!isNaN(numValue)) {
                                  handleCredentialChange(field.name, numValue.toFixed(1));
                                }
                              }
                            }}
                          />
                        )}
                      </div>
                      {field.description && (
                        <p className="text-xs text-muted-foreground">
                          {field.description}
                        </p>
                      )}
                    </div>
                  ))}
                  
                  <div className="flex justify-end gap-2 mt-6">
                    <Button onClick={handleTestConnection} variant="outline" disabled={isLoading}>
                      {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      测试连接
                    </Button>
                    <Button onClick={handleSaveApiKey} disabled={isLoading}>
                      {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      保存凭证
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </>
        ) : (
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <p className="text-muted-foreground">请选择一个模型查看详情</p>
            </div>
          </div>
        )}
      </Card>

      {/* 添加模型对话框 */}
      <Dialog open={isAddModelOpen} onOpenChange={setIsAddModelOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              添加{currentProvider ? currentProvider.name : ''}模型
            </DialogTitle>
            <DialogDescription>
              请填写以下信息以添加新的模型。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="provider" className="text-right">
                提供商
              </Label>
              <div className="col-span-3">
                <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-muted/50">
                  {currentProvider && (
                    <>
                      <ProviderIcon providerId={currentProvider.id} />
                      <span>{currentProvider.name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                模型名称 *
              </Label>
              <Input
                id="name"
                value={newModel.name}
                onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                className="col-span-3"
                placeholder="例如: GPT-4 Ultra"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="modelId" className="text-right">
                模型ID *
              </Label>
              <Input
                id="modelId"
                value={newModel.modelId}
                onChange={(e) => setNewModel({ ...newModel, modelId: e.target.value })}
                className="col-span-3"
                placeholder="例如: gpt-4-ultra"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="knowledgeCutoff" className="text-right">
                知识截止日期
              </Label>
              <div className="col-span-3 relative">
                <div className="flex">
                  <Input
                    id="knowledgeCutoff"
                    type="text"
                    value={newModel.knowledgeCutoff}
                    onChange={(e) => setNewModel({ ...newModel, knowledgeCutoff: e.target.value })}
                    className="pr-10"
                    placeholder="例如: 2023-06"
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                      >
                        <CalendarIcon className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <DateInput
                        value={newModel.knowledgeCutoff || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          setNewModel({ ...newModel, knowledgeCutoff: value });
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                描述
              </Label>
              <Input
                id="description"
                value={newModel.description}
                onChange={(e) => setNewModel({ ...newModel, description: e.target.value })}
                className="col-span-3"
                placeholder="模型描述"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="priority" className="text-right">
                优先级
              </Label>
              <div className="col-span-3 flex items-center">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-r-none"
                  onClick={() => {
                    if (newModel.priority > 0) {
                      setNewModel({ ...newModel, priority: newModel.priority - 1 });
                    }
                  }}
                >
                  -
                </Button>
                <Input
                  id="priority"
                  type="number"
                  value={newModel.priority}
                  onChange={(e) => setNewModel({ ...newModel, priority: parseInt(e.target.value) || 0 })}
                  className="h-8 rounded-none text-center"
                  min="0"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-l-none rounded-r-md"
                  onClick={() => setNewModel({ ...newModel, priority: newModel.priority + 1 })}
                >
                  +
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">
                能力
              </Label>
              <div className="col-span-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="imageGen"
                    checked={newModel.imageGen}
                    onCheckedChange={(checked) => setNewModel({ ...newModel, imageGen: checked })}
                  />
                  <Label htmlFor="imageGen" className="cursor-pointer">图像生成</Label>
                </div>
                
                <div className="flex items-center gap-2">
                  <Switch
                    id="deepThinking"
                    checked={newModel.deepThinking}
                    onCheckedChange={(checked) => setNewModel({ ...newModel, deepThinking: checked })}
                  />
                  <Label htmlFor="deepThinking" className="cursor-pointer">深度思考</Label>
                </div>
                
                <div className="flex items-center gap-2">
                  <Switch
                    id="fileSupport"
                    checked={newModel.fileSupport}
                    onCheckedChange={(checked) => setNewModel({ ...newModel, fileSupport: checked })}
                  />
                  <Label htmlFor="fileSupport" className="cursor-pointer">文件支持</Label>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">
                价格设置
              </Label>
              <div className="col-span-3 grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="inputPrice" className="text-xs">输入价格</Label>
                  <div className="flex items-center mt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-r-none"
                      onClick={() => {
                        const current = parseFloat(newModel.inputPrice) || 0;
                        if (current >= 0.1) {
                          setNewModel({ ...newModel, inputPrice: (current - 0.1).toFixed(1) });
                        }
                      }}
                    >
                      -
                    </Button>
                    <Input
                      id="inputPrice"
                      type="number"
                      value={newModel.inputPrice}
                      step="0.1"
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '') {
                          setNewModel({ ...newModel, inputPrice: '0.0' });
                        } else {
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue)) {
                            setNewModel({ ...newModel, inputPrice: numValue.toFixed(1) });
                          }
                        }
                      }}
                      className="h-8 rounded-none text-center"
                      min="0"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-l-none rounded-r-md"
                      onClick={() => {
                        const current = parseFloat(newModel.inputPrice) || 0;
                        setNewModel({ ...newModel, inputPrice: (current + 0.1).toFixed(1) });
                      }}
                    >
                      +
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="outputPrice" className="text-xs">输出价格</Label>
                  <div className="flex items-center mt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-r-none"
                      onClick={() => {
                        const current = parseFloat(newModel.outputPrice) || 0;
                        if (current >= 0.1) {
                          setNewModel({ ...newModel, outputPrice: (current - 0.1).toFixed(1) });
                        }
                      }}
                    >
                      -
                    </Button>
                    <Input
                      id="outputPrice"
                      type="number"
                      value={newModel.outputPrice}
                      step="0.1"
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '') {
                          setNewModel({ ...newModel, outputPrice: '0.0' });
                        } else {
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue)) {
                            setNewModel({ ...newModel, outputPrice: numValue.toFixed(1) });
                          }
                        }
                      }}
                      className="h-8 rounded-none text-center"
                      min="0"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-l-none rounded-r-md"
                      onClick={() => {
                        const current = parseFloat(newModel.outputPrice) || 0;
                        setNewModel({ ...newModel, outputPrice: (current + 0.1).toFixed(1) });
                      }}
                    >
                      +
                    </Button>
                  </div>
                </div>
                <div className="col-span-2 mt-1">
                  <Label htmlFor="priceUnit" className="text-xs">价格单位</Label>
                  <div className="flex items-center mt-1">
                    <select
                      id="priceUnit"
                      value={newModel.priceUnit}
                      onChange={(e) => setNewModel({ ...newModel, priceUnit: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="USD">USD (美元)</option>
                      <option value="CNY">CNY (人民币)</option>
                    </select>
                    <span className="ml-2 text-xs text-muted-foreground">/1K tokens</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModelOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddModel} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              添加模型
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ModelSettings;
