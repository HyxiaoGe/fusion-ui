"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Github, Mail, Link as LinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { jwtDecode } from "jwt-decode";

interface GitHubUser {
  login: string;
  avatar_url: string;
}

// 模拟的服务列表
const services = [
  {
    id: "github",
    name: "GitHub",
    description: "连接后可用于同步代码片段、备份设置等。",
    icon: <Github className="w-6 h-6" />,
    authUrl: "/api/auth/login/github",
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "连接后可用于邮件提醒、发送调试日志等。",
    icon: <Mail className="w-6 h-6" />,
    authUrl: "#", // 暂未实现
  },
];

const ConnectedAccounts = () => {
  const [connectedUser, setConnectedUser] = useState<GitHubUser | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      try {
        const decoded: { user: GitHubUser } = jwtDecode(token);
        setConnectedUser(decoded.user);
      } catch (error) {
        console.error("Failed to decode token:", error);
        localStorage.removeItem("auth_token");
      }
    }
  }, []);

  const handleDisconnect = () => {
    localStorage.removeItem("auth_token");
    setConnectedUser(null);
    // 可选：刷新页面或通知其他组件
  };

  return (
    <Card className="overflow-hidden border-muted shadow-md transition-all hover:shadow-lg">
      <CardHeader className="bg-muted/10 border-b pb-3">
        <CardTitle className="flex items-center gap-2">
          <LinkIcon className="h-5 w-5 text-primary" />
          账号关联
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 px-0">
        <div className="flex flex-col">
          {services.map((service, index) => {
            const isConnected = service.id === 'github' && !!connectedUser;
            const isLast = index === services.length - 1;

            return (
              <div
                key={service.id}
                className={`flex items-center justify-between p-4 px-6 ${
                  !isLast ? "border-b" : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  {service.icon}
                  <div className="flex flex-col">
                    <h3 className="font-semibold">{service.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {service.description}
                    </p>
                  </div>
                </div>

                {isConnected && connectedUser ? (
                  // 已连接状态 (仅GitHub)
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={connectedUser.avatar_url} alt={connectedUser.login} />
                      <AvatarFallback>
                        {connectedUser.login.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{connectedUser.login}</span>
                    <Button variant="outline" size="sm" onClick={handleDisconnect}>
                      断开连接
                    </Button>
                  </div>
                ) : (
                  // 未连接状态
                   <Button asChild variant="default" size="sm" disabled={service.id === 'gmail'}>
                    <Link href={service.authUrl}>连接</Link>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default ConnectedAccounts; 