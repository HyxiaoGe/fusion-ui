import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { avatarOptions, setAssistantAvatar, setUserAvatar } from '@/redux/slices/settingsSlice';
import React from 'react';

interface AvatarItemProps {
  id: string;
  emoji: string;
  label: string;
  isSelected: boolean;
  onClick: () => void;
}

const AvatarItem: React.FC<AvatarItemProps> = ({ id, emoji, label, isSelected, onClick }) => {
  return (
    <div 
      className={`cursor-pointer p-3 rounded-md transition-all ${
        isSelected ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-accent/50'
      }`}
      onClick={onClick}
    >
      <div className="flex flex-col items-center space-y-2">
        <div className="h-12 w-12 flex items-center justify-center text-2xl rounded-full bg-secondary/10 border">
          {emoji}
        </div>
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
};

const AvatarSelector: React.FC = () => {
  const dispatch = useAppDispatch();

  const { userAvatar, assistantAvatar } = useAppSelector(state => state.settings);

  return (
    <Card className="w-full h-full">
      <CardHeader>
        <CardTitle>头像设置</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="user">
          <TabsList className="w-full">
            <TabsTrigger value="user" className="flex-1">用户头像</TabsTrigger>
            <TabsTrigger value="assistant" className="flex-1">AI助手头像</TabsTrigger>
          </TabsList>
          
          <TabsContent value="user" className="mt-4">
            <div className="grid grid-cols-4 gap-4">
              {avatarOptions.user.map(avatar => (
                <AvatarItem 
                  key={avatar.id}
                  id={avatar.id}
                  emoji={avatar.emoji}
                  label={avatar.label}
                  isSelected={userAvatar === avatar.id}
                  onClick={() => dispatch(setUserAvatar(avatar.id))}
                />
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="assistant" className="mt-4">
            <div className="grid grid-cols-4 gap-4">
              {avatarOptions.assistant.map(avatar => (
                <AvatarItem 
                  key={avatar.id}
                  id={avatar.id}
                  emoji={avatar.emoji}
                  label={avatar.label}
                  isSelected={assistantAvatar === avatar.id}
                  onClick={() => dispatch(setAssistantAvatar(avatar.id))}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AvatarSelector;