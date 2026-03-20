import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch } from '@/redux/hooks';
import { store } from '@/redux/store';
import {
  removeConversation,
  requestConversationListRefresh,
  setAnimatingTitleId,
  updateConversationTitle,
} from '@/redux/slices/conversationSlice';
import { deleteConversation, getConversation, renameConversation } from '@/lib/api/chat';
import { generateChatTitle } from '@/lib/api/title';
import { buildChatFromServerConversation } from '@/lib/chat/conversationHydration';
import { useToast } from '@/components/ui/toast';
import type { Message } from '@/types/conversation';

export function useSidebarActions() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { toast } = useToast();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const selectConversation = useCallback(
    (id: string) => router.push(`/chat/${id}`),
    [router]
  );

  const openDeleteDialog = useCallback((id: string) => setDeleteTargetId(id), []);
  const closeDeleteDialog = useCallback(() => setDeleteTargetId(null), []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTargetId) return;
    try {
      await deleteConversation(deleteTargetId);
      dispatch(removeConversation(deleteTargetId));
      toast({ message: '对话已删除', type: 'success' });
      router.push('/');
    } catch {
      toast({ message: '删除失败，请重试', type: 'error' });
    } finally {
      setDeleteTargetId(null);
    }
  }, [deleteTargetId, dispatch, router, toast]);

  const openRenameDialog = useCallback((id: string, currentTitle: string) => {
    setRenameTargetId(id);
    setRenameValue(currentTitle);
  }, []);

  const closeRenameDialog = useCallback(() => setRenameTargetId(null), []);

  const confirmRename = useCallback(
    async (newTitle: string) => {
      if (!renameTargetId || !newTitle.trim()) return;
      const id = renameTargetId;
      const trimmedTitle = newTitle.trim();
      setRenameTargetId(null);
      const originalTitle = store.getState().conversation.byId[id]?.title ?? '';
      dispatch(updateConversationTitle({ id, title: trimmedTitle }));
      try {
        await renameConversation(id, trimmedTitle);
      } catch {
        dispatch(updateConversationTitle({ id, title: originalTitle }));
        toast({ message: '重命名失败，已恢复原标题', type: 'error' });
      }
    },
    [dispatch, renameTargetId, toast]
  );

  const generateTitle = useCallback(
    async (conversationId: string, localMessages?: Message[]) => {
      let messages = localMessages;
      if (!messages || messages.length === 0) {
        const serverData = await getConversation(conversationId);
        messages = buildChatFromServerConversation(serverData).messages;
      }

      if (!messages || messages.length === 0) {
        toast({ message: '对话内容为空，无法生成标题', type: 'warning' });
        return;
      }

      dispatch(updateConversationTitle({ id: conversationId, title: '正在生成标题...' }));

      try {
        const title = await generateChatTitle(conversationId, undefined, { max_length: 20 });
        dispatch(updateConversationTitle({ id: conversationId, title }));
        dispatch(setAnimatingTitleId(conversationId));
        setTimeout(() => dispatch(setAnimatingTitleId(null)), title.length * 200 + 1000);
        dispatch(requestConversationListRefresh());
        toast({ message: '标题已更新', type: 'success' });
      } catch {
        toast({ message: '生成标题失败，请重试', type: 'error' });
      }
    },
    [dispatch, toast]
  );

  return {
    closeDeleteDialog,
    closeRenameDialog,
    confirmDelete,
    confirmRename,
    deleteTargetId,
    generateTitle,
    openDeleteDialog,
    openRenameDialog,
    renameTargetId,
    renameValue,
    selectConversation,
    setRenameValue,
  };
}
