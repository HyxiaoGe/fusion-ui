# 会话资料/文件体验 v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Fusion 会话页实现同会话资料面板、资料复用、后端 `file_id` 权限校验和刷新后的文件附件元数据保真。

**Architecture:** 后端继续以 `files` 和 `conversation_files` 作为权威数据源，不新增表。前端由会话页持有会话资料列表和本次提问已选资料，`ChatInput` 只负责 composer 附件渲染、上传状态和发送映射。消息发送仍走现有 `file_ids` 协议和 Redis Stream 两段式聊天链路。

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, unittest/pytest, Next.js 15, React 19, Vitest, Testing Library, Redux.

---

## 执行约束

- 不启动 `uvicorn`、`npm run dev*`、`next dev`、Electron 或本地 Docker。
- 每个行为变更先写失败测试，再实现。
- `fusion-api` 和 `fusion-ui` 是两个独立 git 仓；提交、push、CI 监控分别执行。
- 计划文档提交可以本地保留；最终代码完成后再一起 push。
- 真实 Chrome 回归只复用用户已经打开且匹配的 Fusion 标签；没有匹配标签时记录阻塞。

## 文件结构

### `fusion-api`

- Modify: `fusion-api/app/db/repositories.py`
  - 增加 `is_file_linked_to_conversation()`，供聊天发送校验确认 `file_id` 属于当前会话。
- Modify: `fusion-api/app/services/chat_service.py`
  - 增加 `_validate_message_files()`，集中校验用户、会话、处理状态和图片可用性。
  - 增加 `_build_file_block_from_record()`，从已校验文件构造持久化 `FileBlock`。
  - 在 `process_message()` 创建用户消息前调用校验，校验失败时不创建消息、不启动流。
- Modify: `fusion-api/app/services/file_service.py`
  - 对话文件摘要返回 `thumbnail_url`、`created_at`、`error_message`。
  - `get_conversation_files_for_user()`、`get_conversation_files()`、`get_files_by_user()` 改为 async。
- Modify: `fusion-api/app/api/files.py`
  - `get_user_files()` 和 `get_conversation_files()` 改为 async 并 await service。
- Test: `fusion-api/test/test_chat_service.py`
  - 覆盖同会话成功、跨用户拒绝、跨会话拒绝、未处理非图片拒绝、校验失败不创建消息。
- Test: `fusion-api/test/test_file_service.py`
  - 覆盖摘要字段、缩略图 URL、错误摘要和 async service 方法。
- Test: `fusion-api/test/services/chat/test_message_builder.py`
  - 覆盖图片文件仍能进入视觉模型消息构建路径。

### `fusion-ui`

- Modify: `fusion-ui/src/lib/api/files.ts`
  - 扩展 `FileInfo` 字段。
- Modify: `fusion-ui/src/lib/api/files.test.ts`
  - 覆盖新增字段。
- Modify: `fusion-ui/src/lib/chat/conversationHydration.ts`
  - hydration 时保留 file block 的 `thumbnail_url`、`width`、`height`。
- Modify: `fusion-ui/src/lib/chat/conversationHydration.test.ts`
  - 覆盖刷新历史附件元数据保真。
- Create: `fusion-ui/src/hooks/useConversationFiles.ts`
  - 按 `activeChatId` 拉取、刷新、局部移除会话资料。
- Create: `fusion-ui/src/hooks/useConversationFiles.test.tsx`
  - 覆盖加载、错误、刷新和局部移除。
- Create: `fusion-ui/src/components/chat/ConversationFilesPanel.tsx`
  - 右侧资料抽屉、空状态、错误状态、列表操作。
- Create: `fusion-ui/src/components/chat/ConversationFilesPanel.test.tsx`
  - 覆盖状态展示、加入本次提问、删除和禁用处理中文件。
- Create: `fusion-ui/src/components/chat/composerAttachments.ts`
  - 定义 composer 附件 union、状态判断、发送映射和去重。
- Create: `fusion-ui/src/components/chat/composerAttachments.test.ts`
  - 覆盖本地上传附件和既有资料映射。
- Create: `fusion-ui/src/components/chat/ComposerAttachmentList.tsx`
  - 统一渲染本地上传附件和既有资料。
- Create: `fusion-ui/src/components/chat/ComposerAttachmentList.test.tsx`
  - 覆盖移除本地附件不等于删除既有资料。
- Modify: `fusion-ui/src/components/chat/ChatInput.tsx`
  - 接收 `conversationAttachments`、`onRemoveConversationAttachment`、`onClearConversationAttachments`、`onUploadComplete`。
  - 使用 `ComposerAttachmentList` 替代内部附件 UI。
- Modify: `fusion-ui/src/components/chat/ChatInput.test.tsx`
  - 覆盖既有资料发送、不调用删除、发送后清空选择、上传后刷新资料。
- Modify: `fusion-ui/src/app/(app)/chat/[chatId]/page.tsx`
  - 接入 `useConversationFiles`、资料入口按钮、资料面板、选中资料状态和删除同步。
- Modify: `fusion-ui/src/app/(app)/chat/[chatId]/page.test.tsx`
  - 覆盖资料按钮、加入资料传入 ChatInput、发送结束刷新资料。

---

### Task 1: 后端 `file_id` 会话权限校验

**Files:**
- Modify: `fusion-api/app/db/repositories.py`
- Modify: `fusion-api/app/services/chat_service.py`
- Test: `fusion-api/test/test_chat_service.py`

- [ ] **Step 1: 写失败测试**

在 `fusion-api/test/test_chat_service.py` 增加 import：

```python
from app.schemas.response import ApiException
```

在 `ChatServiceTests` 内追加：

```python
    def test_validate_message_files_accepts_processed_same_conversation_file(self):
        service = object.__new__(ChatService)
        service.file_repo = MagicMock()
        file_record = SimpleNamespace(
            id="file-1",
            user_id="user-1",
            original_filename="note.txt",
            mimetype="text/plain",
            status="processed",
            storage_key="conv-1/file-1/note.txt",
            thumbnail_key=None,
        )
        service.file_repo.get_file_by_id.return_value = file_record
        service.file_repo.is_file_linked_to_conversation.return_value = True

        result = service._validate_message_files(["file-1"], "user-1", "conv-1")

        self.assertEqual(result, [file_record])
        service.file_repo.get_file_by_id.assert_called_once_with("file-1", user_id="user-1")
        service.file_repo.is_file_linked_to_conversation.assert_called_once_with("conv-1", "file-1")

    def test_validate_message_files_rejects_other_user_file(self):
        service = object.__new__(ChatService)
        service.file_repo = MagicMock()
        service.file_repo.get_file_by_id.return_value = None

        with self.assertRaises(ApiException) as context:
            service._validate_message_files(["file-1"], "user-1", "conv-1")

        self.assertEqual(context.exception.code, "INVALID_PARAM")
        self.assertEqual(context.exception.message, "文件不存在或无权访问")
        service.file_repo.is_file_linked_to_conversation.assert_not_called()

    def test_validate_message_files_rejects_same_user_file_from_other_conversation(self):
        service = object.__new__(ChatService)
        service.file_repo = MagicMock()
        service.file_repo.get_file_by_id.return_value = SimpleNamespace(
            id="file-2",
            user_id="user-1",
            original_filename="other.txt",
            mimetype="text/plain",
            status="processed",
            storage_key="conv-2/file-2/other.txt",
            thumbnail_key=None,
        )
        service.file_repo.is_file_linked_to_conversation.return_value = False

        with self.assertRaises(ApiException) as context:
            service._validate_message_files(["file-2"], "user-1", "conv-1")

        self.assertEqual(context.exception.code, "INVALID_PARAM")
        self.assertEqual(context.exception.message, "文件不属于当前会话")

    def test_validate_message_files_rejects_unprocessed_non_image_file(self):
        service = object.__new__(ChatService)
        service.file_repo = MagicMock()
        service.file_repo.get_file_by_id.return_value = SimpleNamespace(
            id="file-3",
            user_id="user-1",
            original_filename="draft.pdf",
            mimetype="application/pdf",
            status="parsing",
            storage_key="conv-1/file-3/draft.pdf",
            thumbnail_key=None,
        )
        service.file_repo.is_file_linked_to_conversation.return_value = True

        with self.assertRaises(ApiException) as context:
            service._validate_message_files(["file-3"], "user-1", "conv-1")

        self.assertEqual(context.exception.code, "INVALID_PARAM")
        self.assertEqual(context.exception.message, "文件仍在处理，请稍后再发送")

    def test_process_message_rejects_invalid_file_before_creating_message(self):
        db = MagicMock()
        service = ChatService(db)
        service.file_repo = MagicMock()
        service.file_repo.get_file_by_id.return_value = None
        service.conversation_service = MagicMock()
        service._get_or_create_conversation = MagicMock(
            return_value=(
                Conversation(
                    id="conv-1",
                    user_id="user-1",
                    title="继续分析",
                    model_id="qwen-max-latest",
                    messages=[],
                    created_at=datetime.now(),
                    updated_at=datetime.now(),
                ),
                False,
            )
        )

        with (
            patch(
                "app.services.chat_service.llm_manager.resolve_model",
                return_value=("openai/qwen-max-latest", "qwen", {}),
            ),
            patch(
                "app.services.chat_service.litellm_catalog.get_capabilities",
                return_value={"functionCalling": False, "agentTools": False, "vision": False},
            ),
        ):
            with self.assertRaises(ApiException):
                asyncio.run(
                    service.process_message(
                        model_id="qwen-max-latest",
                        message="继续分析",
                        user_id="user-1",
                        conversation_id="conv-1",
                        stream=True,
                        file_ids=["missing-file"],
                    )
                )

        service.conversation_service.create_message.assert_not_called()
        db.commit.assert_not_called()
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd /Users/sean/code/fusion/fusion-api
python3 -m pytest test/test_chat_service.py::ChatServiceTests::test_validate_message_files_accepts_processed_same_conversation_file \
  test/test_chat_service.py::ChatServiceTests::test_validate_message_files_rejects_other_user_file \
  test/test_chat_service.py::ChatServiceTests::test_validate_message_files_rejects_same_user_file_from_other_conversation \
  test/test_chat_service.py::ChatServiceTests::test_validate_message_files_rejects_unprocessed_non_image_file \
  test/test_chat_service.py::ChatServiceTests::test_process_message_rejects_invalid_file_before_creating_message -q
```

Expected: FAIL，包含 `AttributeError: 'ChatService' object has no attribute '_validate_message_files'`。

- [ ] **Step 3: 实现仓储方法**

在 `fusion-api/app/db/repositories.py` 的 `FileRepository` 中，放在 `get_conversation_files()` 后：

```python
    def is_file_linked_to_conversation(self, conversation_id: str, file_id: str) -> bool:
        """确认文件是否已经关联到指定对话。"""
        return (
            self.db.query(ConversationFile)
            .filter(ConversationFile.conversation_id == conversation_id, ConversationFile.file_id == file_id)
            .first()
            is not None
        )
```

- [ ] **Step 4: 实现 ChatService 校验和 FileBlock 构造**

在 `fusion-api/app/services/chat_service.py` 顶部 import 调整为：

```python
from app.core.config import settings
from app.services.file_service import FileService, is_image_mime
```

在 `ChatService` 内、`process_message()` 前新增：

```python
    def _validate_message_files(self, file_ids: List[str], user_id: str, conversation_id: str) -> List[Any]:
        """校验本次消息引用的文件，并按传入顺序返回文件记录。"""
        validated_files: List[Any] = []
        for file_id in file_ids:
            file_info = self.file_repo.get_file_by_id(file_id, user_id=user_id)
            if not file_info:
                raise ApiException.bad_request("文件不存在或无权访问")

            if not self.file_repo.is_file_linked_to_conversation(conversation_id, file_id):
                raise ApiException.bad_request("文件不属于当前会话")

            if is_image_mime(file_info.mimetype or ""):
                if not getattr(file_info, "storage_key", None):
                    raise ApiException.bad_request("图片文件不可用，请重新上传")
            elif file_info.status != "processed":
                raise ApiException.bad_request("文件仍在处理，请稍后再发送")

            validated_files.append(file_info)
        return validated_files

    async def _build_file_block_from_record(self, file_info: Any) -> FileBlock:
        block_kwargs = {
            "type": "file",
            "file_id": file_info.id,
            "filename": file_info.original_filename,
            "mime_type": file_info.mimetype,
        }
        if is_image_mime(file_info.mimetype or ""):
            if getattr(file_info, "thumbnail_key", None):
                try:
                    storage = get_storage()
                    thumb_url = await storage.get_url(
                        file_info.thumbnail_key,
                        expires=settings.MINIO_PRESIGN_EXPIRES,
                    )
                    block_kwargs["thumbnail_url"] = FileService._sign_local_url(
                        thumb_url,
                        file_info.id,
                        settings.MINIO_PRESIGN_EXPIRES,
                    )
                except Exception:
                    logger.warning("图片缩略图 URL 构造失败: file_id=%s", file_info.id)
            block_kwargs["width"] = getattr(file_info, "width", None)
            block_kwargs["height"] = getattr(file_info, "height", None)
        return FileBlock(**block_kwargs)
```

在 `process_message()` 中替换当前 `if file_ids:` 文件循环为：

```python
        validated_files = self._validate_message_files(file_ids or [], user_id, conversation.id)

        user_content = [TextBlock(type="text", text=message)]
        for file_info in validated_files:
            user_content.append(await self._build_file_block_from_record(file_info))
```

- [ ] **Step 5: 运行后端校验测试**

Run:

```bash
cd /Users/sean/code/fusion/fusion-api
python3 -m pytest test/test_chat_service.py::ChatServiceTests::test_validate_message_files_accepts_processed_same_conversation_file \
  test/test_chat_service.py::ChatServiceTests::test_validate_message_files_rejects_other_user_file \
  test/test_chat_service.py::ChatServiceTests::test_validate_message_files_rejects_same_user_file_from_other_conversation \
  test/test_chat_service.py::ChatServiceTests::test_validate_message_files_rejects_unprocessed_non_image_file \
  test/test_chat_service.py::ChatServiceTests::test_process_message_rejects_invalid_file_before_creating_message -q
```

Expected: PASS，5 passed。

- [ ] **Step 6: 提交后端校验改动**

```bash
cd /Users/sean/code/fusion/fusion-api
git add app/db/repositories.py app/services/chat_service.py test/test_chat_service.py
git commit -m "fix: 校验会话文件引用权限" -m "背景：
- 会话资料复用会让前端重新提交已有 file_id，后端必须成为权限边界。
- 旧逻辑按 file_id 直接取文件，可能接受跨用户或跨会话文件引用。

改动：
- 增加 conversation_files 关联校验。
- 在聊天消息创建前校验文件归属、处理状态和图片可用性。
- 覆盖跨用户、跨会话、未处理文件和失败前不落消息场景。

Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

### Task 2: 后端会话文件摘要字段

**Files:**
- Modify: `fusion-api/app/services/file_service.py`
- Modify: `fusion-api/app/api/files.py`
- Test: `fusion-api/test/test_file_service.py`

- [ ] **Step 1: 写失败测试**

在 `fusion-api/test/test_file_service.py` 顶部 import 调整为：

```python
from datetime import datetime
```

把 `test_get_conversation_files_uses_shared_summary_serializer` 改成 async：

```python
    async def test_get_conversation_files_uses_shared_summary_serializer(self):
        self.service.storage.get_url = AsyncMock(return_value="/files/file-1/thumb.png")
        conversation_file = SimpleNamespace(
            file=SimpleNamespace(
                id="file-1",
                original_filename="diagram.png",
                mimetype="image/png",
                size=12,
                status="processed",
                processing_result=None,
                thumbnail_key="conv-1/file-1/thumbnail.jpg",
                width=640,
                height=480,
                created_at=datetime(2026, 7, 3, 10, 30, 0),
            )
        )
        self.service.file_repo.get_conversation_files.return_value = [conversation_file]

        result = await self.service.get_conversation_files("conv-1")

        thumbnail_url = result[0].pop("thumbnail_url")
        self.assertTrue(thumbnail_url.startswith("/files/file-1/thumb.png?token="))
        self.assertEqual(
            result,
            [
                {
                    "id": "file-1",
                    "filename": "diagram.png",
                    "mimetype": "image/png",
                    "size": 12,
                    "status": "processed",
                    "width": 640,
                    "height": 480,
                    "created_at": "2026-07-03T10:30:00",
                    "error_message": None,
                }
            ],
        )
```

把 `test_get_files_by_user_uses_shared_summary_serializer` 改成 async：

```python
    async def test_get_files_by_user_uses_shared_summary_serializer(self):
        file_record = SimpleNamespace(
            id="file-2",
            original_filename="report.pdf",
            mimetype="application/pdf",
            size=24,
            status="error",
            processing_result={"status": "error", "message": "解析失败"},
            thumbnail_key=None,
            width=None,
            height=None,
            created_at=datetime(2026, 7, 3, 11, 0, 0),
        )
        self.service.file_repo.get_files_by_user_id.return_value = [file_record]

        result = await self.service.get_files_by_user("user-1")

        self.assertEqual(
            result,
            [
                {
                    "id": "file-2",
                    "filename": "report.pdf",
                    "mimetype": "application/pdf",
                    "size": 24,
                    "status": "error",
                    "thumbnail_url": None,
                    "width": None,
                    "height": None,
                    "created_at": "2026-07-03T11:00:00",
                    "error_message": "解析失败",
                }
            ],
        )
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd /Users/sean/code/fusion/fusion-api
python3 -m pytest test/test_file_service.py::FileServiceTests::test_get_conversation_files_uses_shared_summary_serializer \
  test/test_file_service.py::FileServiceTests::test_get_files_by_user_uses_shared_summary_serializer -q
```

Expected: FAIL，包含 `TypeError: object list can't be used in 'await' expression` 或字段断言失败。

- [ ] **Step 3: 实现 async 文件摘要**

在 `fusion-api/app/services/file_service.py` 中替换 `_serialize_file_summary()` 和调用方：

```python
    async def _build_thumbnail_url(self, file_obj) -> Optional[str]:
        thumbnail_key = getattr(file_obj, "thumbnail_key", None)
        if not thumbnail_key:
            return None
        url = await self.storage.get_url(thumbnail_key, expires=settings.MINIO_PRESIGN_EXPIRES)
        return self._sign_local_url(url, file_obj.id, settings.MINIO_PRESIGN_EXPIRES)

    @staticmethod
    def _extract_error_message(file_obj) -> Optional[str]:
        if getattr(file_obj, "status", None) != "error":
            return None
        processing_result = getattr(file_obj, "processing_result", None) or {}
        if isinstance(processing_result, dict):
            message = processing_result.get("message")
            return str(message) if message else None
        return None

    @staticmethod
    def _serialize_created_at(file_obj) -> Optional[str]:
        created_at = getattr(file_obj, "created_at", None)
        return created_at.isoformat() if created_at else None

    async def _serialize_file_summary(self, file_obj) -> Dict[str, Any]:
        """统一序列化文件列表摘要。"""
        return {
            "id": file_obj.id,
            "filename": file_obj.original_filename,
            "mimetype": file_obj.mimetype,
            "size": file_obj.size,
            "status": file_obj.status,
            "thumbnail_url": await self._build_thumbnail_url(file_obj),
            "width": getattr(file_obj, "width", None),
            "height": getattr(file_obj, "height", None),
            "created_at": self._serialize_created_at(file_obj),
            "error_message": self._extract_error_message(file_obj),
        }

    async def get_conversation_files(self, conversation_id: str) -> List[Dict[str, Any]]:
        """获取对话关联的所有文件信息。"""
        files = self.file_repo.get_conversation_files(conversation_id)
        return [await self._serialize_file_summary(f.file) for f in files]

    async def get_conversation_files_for_user(self, conversation_id: str, user_id: str) -> Optional[List[Dict[str, Any]]]:
        """获取用户有权访问的对话文件列表。"""
        conv_repo = ConversationRepository(self.db)
        conversation = conv_repo.get_by_id(conversation_id, user_id)
        if not conversation:
            return None
        return await self.get_conversation_files(conversation_id)

    async def get_files_by_user(self, user_id: str) -> List[Dict[str, Any]]:
        """获取用户的所有文件。"""
        files = self.file_repo.get_files_by_user_id(user_id)
        return [await self._serialize_file_summary(file) for file in files]
```

在 `fusion-api/app/api/files.py` 中改 endpoint：

```python
@router.get("/")
async def get_user_files(
    request: Request,
    current_user: User = Depends(get_current_user),
    file_service: FileService = Depends(get_file_service),
):
    """获取当前用户的所有文件"""
    files = await file_service.get_files_by_user(current_user.id)
    return success(data={"files": files}, request_id=request.state.request_id)


@router.get("/conversation/{conversation_id}")
async def get_conversation_files(
    conversation_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    file_service: FileService = Depends(get_file_service),
):
    """获取对话关联的所有文件"""
    files = await file_service.get_conversation_files_for_user(conversation_id, current_user.id)
    if files is None:
        raise ApiException.not_found("对话不存在或无权访问")
    return success(data={"files": files}, request_id=request.state.request_id)
```

- [ ] **Step 4: 运行文件服务测试**

Run:

```bash
cd /Users/sean/code/fusion/fusion-api
python3 -m pytest test/test_file_service.py -q
```

Expected: PASS，所有 `FileServiceTests` 通过。

- [ ] **Step 5: 运行后端局部回归**

Run:

```bash
cd /Users/sean/code/fusion/fusion-api
python3 -m pytest test/test_file_service.py test/test_chat_service.py test/services/chat/test_message_builder.py -q
```

Expected: PASS。

- [ ] **Step 6: 提交后端摘要改动**

```bash
cd /Users/sean/code/fusion/fusion-api
git add app/services/file_service.py app/api/files.py test/test_file_service.py
git commit -m "feat: 返回会话资料摘要字段" -m "背景：
- 会话资料面板需要直接消费文件状态、缩略图、创建时间和错误摘要。
- 旧摘要只返回 thumbnail_key，前端无法稳定展示资料列表。

改动：
- 文件摘要补齐 thumbnail_url、created_at 和 error_message。
- 文件列表接口改为 async，统一构造签名缩略图 URL。
- 更新文件服务测试覆盖图片和错误文件摘要。

Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

### Task 3: 前端 API 类型和历史 hydration

**Files:**
- Modify: `fusion-ui/src/lib/api/files.ts`
- Modify: `fusion-ui/src/lib/api/files.test.ts`
- Modify: `fusion-ui/src/lib/chat/conversationHydration.ts`
- Modify: `fusion-ui/src/lib/chat/conversationHydration.test.ts`

- [ ] **Step 1: 写失败测试**

在 `fusion-ui/src/lib/api/files.test.ts` 的 `returns conversation files from the authenticated endpoint` 用例中，把 response 文件改为：

```ts
{
  id: 'file-1',
  filename: 'demo.png',
  mimetype: 'image/png',
  size: 12,
  created_at: '2026-03-13T00:00:00Z',
  status: 'processed',
  error_message: null,
  thumbnail_url: 'https://cdn.example.com/demo-thumb.png',
  width: 640,
  height: 480,
}
```

并补断言：

```ts
expect(files[0]).toMatchObject({
  filename: 'demo.png',
  thumbnail_url: 'https://cdn.example.com/demo-thumb.png',
  width: 640,
  height: 480,
  error_message: null,
});
```

在 `fusion-ui/src/lib/chat/conversationHydration.test.ts` 追加：

```ts
  it('preserves file block media metadata while hydrating user messages', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-file',
      title: 'Server chat',
      model_id: 'qwen-vl-max',
      messages: [
        {
          id: 'user-file',
          role: 'user',
          content: [
            {
              type: 'file',
              id: 'blk_file',
              file_id: 'file-1',
              filename: 'diagram.png',
              mime_type: 'image/png',
              thumbnail_url: 'https://cdn.example.com/thumb.png',
              width: 640,
              height: 480,
            },
          ],
          created_at: '2026-03-14T08:00:00Z',
        },
      ],
    });

    expect(chat.messages[0].content[0]).toMatchObject({
      type: 'file',
      file_id: 'file-1',
      filename: 'diagram.png',
      mime_type: 'image/png',
      thumbnail_url: 'https://cdn.example.com/thumb.png',
      width: 640,
      height: 480,
    });
  });
```

- [ ] **Step 2: 运行测试确认 hydration 失败**

Run:

```bash
cd /Users/sean/code/fusion/fusion-ui
npm test -- src/lib/api/files.test.ts src/lib/chat/conversationHydration.test.ts
```

Expected: FAIL，`conversationHydration` 用例缺少 `thumbnail_url`、`width`、`height`。

- [ ] **Step 3: 扩展前端类型和 hydration**

在 `fusion-ui/src/lib/api/files.ts` 中把 `FileInfo` 改为：

```ts
export interface FileInfo {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  created_at: string | null;
  status: FileProcessingStatus;
  error_message: string | null;
  thumbnail_url?: string | null;
  width?: number | null;
  height?: number | null;
}
```

在 `fusion-ui/src/lib/chat/conversationHydration.ts` 的 `ServerBlock` 增加：

```ts
  thumbnail_url?: string;
  width?: number | null;
  height?: number | null;
```

在 `buildContentBlocks()` 的 file block 映射中增加：

```ts
        thumbnail_url: b.thumbnail_url,
        width: b.width ?? undefined,
        height: b.height ?? undefined,
```

- [ ] **Step 4: 运行前端类型和 hydration 测试**

Run:

```bash
cd /Users/sean/code/fusion/fusion-ui
npm test -- src/lib/api/files.test.ts src/lib/chat/conversationHydration.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交前端协议改动**

```bash
cd /Users/sean/code/fusion/fusion-ui
git add src/lib/api/files.ts src/lib/api/files.test.ts src/lib/chat/conversationHydration.ts src/lib/chat/conversationHydration.test.ts
git commit -m "fix: 保留会话文件元数据" -m "背景：
- 会话资料面板和历史消息刷新都需要稳定的文件元数据。
- 旧 hydration 会丢掉图片缩略图和尺寸字段。

改动：
- 扩展 FileInfo 类型，接收后端新增摘要字段。
- Hydration 保留 file block 的 thumbnail_url、width 和 height。
- 增加 API 与 hydration 回归测试。

Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

### Task 4: 会话资料 hook 和资料面板

**Files:**
- Create: `fusion-ui/src/hooks/useConversationFiles.ts`
- Create: `fusion-ui/src/hooks/useConversationFiles.test.tsx`
- Create: `fusion-ui/src/components/chat/ConversationFilesPanel.tsx`
- Create: `fusion-ui/src/components/chat/ConversationFilesPanel.test.tsx`

- [ ] **Step 1: 写 hook 失败测试**

创建 `fusion-ui/src/hooks/useConversationFiles.test.tsx`：

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getConversationFilesMock } = vi.hoisted(() => ({
  getConversationFilesMock: vi.fn(),
}));

vi.mock('@/lib/api/files', () => ({
  getConversationFiles: getConversationFilesMock,
}));

import { useConversationFiles } from './useConversationFiles';

describe('useConversationFiles', () => {
  beforeEach(() => {
    getConversationFilesMock.mockReset();
  });

  it('loads files for the active conversation', async () => {
    getConversationFilesMock.mockResolvedValue([
      {
        id: 'file-1',
        filename: 'demo.png',
        mimetype: 'image/png',
        size: 120,
        created_at: '2026-07-03T10:00:00Z',
        status: 'processed',
        error_message: null,
        thumbnail_url: 'https://cdn.example.com/demo.png',
        width: 640,
        height: 480,
      },
    ]);

    const { result } = renderHook(() => useConversationFiles('chat-1'));

    await waitFor(() => {
      expect(result.current.files).toHaveLength(1);
    });
    expect(result.current.files[0].filename).toBe('demo.png');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('keeps an error message when loading fails', async () => {
    getConversationFilesMock.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useConversationFiles('chat-1'));

    await waitFor(() => {
      expect(result.current.error).toBe('network down');
    });
    expect(result.current.files).toEqual([]);
  });

  it('removes a deleted file from local state', async () => {
    getConversationFilesMock.mockResolvedValue([
      {
        id: 'file-1',
        filename: 'demo.png',
        mimetype: 'image/png',
        size: 120,
        created_at: '2026-07-03T10:00:00Z',
        status: 'processed',
        error_message: null,
      },
    ]);

    const { result } = renderHook(() => useConversationFiles('chat-1'));
    await waitFor(() => expect(result.current.files).toHaveLength(1));

    result.current.removeFile('file-1');

    expect(result.current.files).toEqual([]);
  });
});
```

- [ ] **Step 2: 写面板失败测试**

创建 `fusion-ui/src/components/chat/ConversationFilesPanel.test.tsx`：

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FileInfo } from '@/lib/api/files';

import ConversationFilesPanel from './ConversationFilesPanel';

const processedImage: FileInfo = {
  id: 'file-1',
  filename: 'diagram.png',
  mimetype: 'image/png',
  size: 2048,
  created_at: '2026-07-03T10:00:00Z',
  status: 'processed',
  error_message: null,
  thumbnail_url: 'https://cdn.example.com/thumb.png',
  width: 640,
  height: 480,
};

const parsingPdf: FileInfo = {
  id: 'file-2',
  filename: 'draft.pdf',
  mimetype: 'application/pdf',
  size: 4096,
  created_at: '2026-07-03T10:01:00Z',
  status: 'parsing',
  error_message: null,
};

describe('ConversationFilesPanel', () => {
  it('renders an empty state when there are no files', () => {
    render(
      <ConversationFilesPanel
        open
        files={[]}
        isLoading={false}
        error={null}
        selectedFileIds={new Set()}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onAddFile={vi.fn()}
        onDeleteFile={vi.fn()}
      />,
    );

    expect(screen.getByText('当前会话还没有资料')).toBeInTheDocument();
  });

  it('allows adding processed files and blocks parsing files', () => {
    const onAddFile = vi.fn();
    render(
      <ConversationFilesPanel
        open
        files={[processedImage, parsingPdf]}
        isLoading={false}
        error={null}
        selectedFileIds={new Set()}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onAddFile={onAddFile}
        onDeleteFile={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '加入本次提问 diagram.png' }));

    expect(onAddFile).toHaveBeenCalledWith(processedImage);
    expect(screen.getByRole('button', { name: 'draft.pdf 正在处理' })).toBeDisabled();
  });

  it('deletes a file from the panel action', () => {
    const onDeleteFile = vi.fn();
    render(
      <ConversationFilesPanel
        open
        files={[processedImage]}
        isLoading={false}
        error={null}
        selectedFileIds={new Set()}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onAddFile={vi.fn()}
        onDeleteFile={onDeleteFile}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '删除资料 diagram.png' }));

    expect(onDeleteFile).toHaveBeenCalledWith('file-1');
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
cd /Users/sean/code/fusion/fusion-ui
npm test -- src/hooks/useConversationFiles.test.tsx src/components/chat/ConversationFilesPanel.test.tsx
```

Expected: FAIL，模块 `useConversationFiles` 和 `ConversationFilesPanel` 不存在。

- [ ] **Step 4: 实现 `useConversationFiles`**

创建 `fusion-ui/src/hooks/useConversationFiles.ts`：

```ts
import { useCallback, useEffect, useState } from 'react';
import { getConversationFiles, type FileInfo } from '@/lib/api/files';

export function useConversationFiles(conversationId: string | null) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!conversationId) {
      setFiles([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const nextFiles = await getConversationFiles(conversationId);
      setFiles(nextFiles);
      setError(null);
    } catch (err) {
      setFiles([]);
      setError(err instanceof Error ? err.message : '资料列表加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  const removeFile = useCallback((fileId: string) => {
    setFiles((current) => current.filter((file) => file.id !== fileId));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    files,
    isLoading,
    error,
    refresh,
    removeFile,
  };
}
```

- [ ] **Step 5: 实现资料面板**

创建 `fusion-ui/src/components/chat/ConversationFilesPanel.tsx`：

```tsx
'use client';

import { FileIcon, ImageIcon, Loader2, Plus, RefreshCcw, Trash2, X } from 'lucide-react';
import type { FileInfo } from '@/lib/api/files';
import { Button } from '@/components/ui/button';
import { formatFileSize } from '@/lib/utils/fileHelpers';
import { cn } from '@/lib/utils';

interface ConversationFilesPanelProps {
  open: boolean;
  files: FileInfo[];
  isLoading: boolean;
  error: string | null;
  selectedFileIds: Set<string>;
  onClose: () => void;
  onRefresh: () => void;
  onAddFile: (file: FileInfo) => void;
  onDeleteFile: (fileId: string) => void;
}

function getStatusLabel(file: FileInfo) {
  if (file.status === 'processed') return '已就绪';
  if (file.status === 'parsing' || file.status === 'uploading' || file.status === 'pending') return '处理中';
  if (file.status === 'error') return file.error_message || '处理失败';
  return file.status;
}

function isImage(file: FileInfo) {
  return file.mimetype.startsWith('image/');
}

export default function ConversationFilesPanel({
  open,
  files,
  isLoading,
  error,
  selectedFileIds,
  onClose,
  onRefresh,
  onAddFile,
  onDeleteFile,
}: ConversationFilesPanelProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-background/40 backdrop-blur-sm" role="presentation">
      <aside
        className="h-full w-full max-w-sm border-l border-border bg-background shadow-xl"
        aria-label="会话资料"
      >
        <div className="flex h-12 items-center justify-between border-b border-border px-3">
          <h2 className="text-sm font-medium">会话资料</h2>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onRefresh} aria-label="刷新资料">
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose} aria-label="关闭资料面板">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="h-[calc(100%-3rem)] overflow-y-auto p-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载资料
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {!isLoading && !error && files.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              当前会话还没有资料
            </div>
          ) : null}

          <div className="space-y-2">
            {files.map((file) => {
              const ready = file.status === 'processed';
              const selected = selectedFileIds.has(file.id);
              return (
                <div key={file.id} className="rounded-md border border-border p-2">
                  <div className="flex gap-2">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30">
                      {isImage(file) && file.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={file.thumbnail_url} alt={file.filename} className="h-full w-full object-cover" />
                      ) : isImage(file) ? (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <FileIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.filename}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                      <p className={cn('text-xs', file.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
                        {getStatusLabel(file)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2"
                      disabled={!ready || selected}
                      aria-label={ready ? `加入本次提问 ${file.filename}` : `${file.filename} 正在处理`}
                      onClick={() => onAddFile(file)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {selected ? '已加入' : '加入'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-destructive hover:text-destructive"
                      aria-label={`删除资料 ${file.filename}`}
                      onClick={() => onDeleteFile(file.id)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      删除
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 6: 运行 hook 和面板测试**

Run:

```bash
cd /Users/sean/code/fusion/fusion-ui
npm test -- src/hooks/useConversationFiles.test.tsx src/components/chat/ConversationFilesPanel.test.tsx
```

Expected: PASS。

- [ ] **Step 7: 提交资料面板基础**

```bash
cd /Users/sean/code/fusion/fusion-ui
git add src/hooks/useConversationFiles.ts src/hooks/useConversationFiles.test.tsx src/components/chat/ConversationFilesPanel.tsx src/components/chat/ConversationFilesPanel.test.tsx
git commit -m "feat: 增加会话资料面板" -m "背景：
- 用户需要查看当前会话已有资料，并把已处理资料加入本次提问。

改动：
- 新增会话资料 hook，负责加载、刷新和本地移除。
- 新增会话资料面板，展示空态、处理中、失败和已就绪文件。
- 覆盖资料加载、错误、加入和删除交互。

Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

### Task 5: Composer 附件模型和 ChatInput 复用既有资料

**Files:**
- Create: `fusion-ui/src/components/chat/composerAttachments.ts`
- Create: `fusion-ui/src/components/chat/composerAttachments.test.ts`
- Create: `fusion-ui/src/components/chat/ComposerAttachmentList.tsx`
- Create: `fusion-ui/src/components/chat/ComposerAttachmentList.test.tsx`
- Modify: `fusion-ui/src/components/chat/ChatInput.tsx`
- Modify: `fusion-ui/src/components/chat/ChatInput.test.tsx`

- [ ] **Step 1: 写 composer 模型失败测试**

创建 `fusion-ui/src/components/chat/composerAttachments.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { FileInfo } from '@/lib/api/files';

import {
  conversationFileToComposerAttachment,
  isComposerAttachmentProcessing,
  toFileAttachment,
} from './composerAttachments';

describe('composerAttachments', () => {
  it('maps a processed conversation file to the send attachment shape', () => {
    const file: FileInfo = {
      id: 'file-1',
      filename: 'diagram.png',
      mimetype: 'image/png',
      size: 1024,
      created_at: '2026-07-03T10:00:00Z',
      status: 'processed',
      error_message: null,
      thumbnail_url: 'https://cdn.example.com/thumb.png',
      width: 640,
      height: 480,
    };

    const attachment = conversationFileToComposerAttachment(file);

    expect(toFileAttachment(attachment)).toEqual({
      fileId: 'file-1',
      filename: 'diagram.png',
      mimeType: 'image/png',
      previewUrl: 'https://cdn.example.com/thumb.png',
    });
  });

  it('treats upload attachments without fileId as processing', () => {
    expect(isComposerAttachmentProcessing({
      source: 'upload',
      localId: 'local-1',
      file: new File(['hello'], 'hello.txt', { type: 'text/plain' }),
      status: 'uploading',
      previewUrl: '',
    })).toBe(true);
  });
});
```

- [ ] **Step 2: 实现 composer 模型**

创建 `fusion-ui/src/components/chat/composerAttachments.ts`：

```ts
import type { FileInfo } from '@/lib/api/files';
import type { FileAttachment } from '@/lib/utils/fileHelpers';
import type { FileProcessingStatus } from '@/redux/slices/fileUploadSlice';

export interface UploadComposerAttachment {
  source: 'upload';
  localId: string;
  file: File;
  fileId?: string;
  status: FileProcessingStatus;
  previewUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
}

export interface ConversationComposerAttachment {
  source: 'conversation';
  fileId: string;
  filename: string;
  mimetype: string;
  status: 'processed';
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
}

export type ComposerAttachment = UploadComposerAttachment | ConversationComposerAttachment;

export function conversationFileToComposerAttachment(file: FileInfo): ConversationComposerAttachment {
  return {
    source: 'conversation',
    fileId: file.id,
    filename: file.filename,
    mimetype: file.mimetype,
    status: 'processed',
    thumbnailUrl: file.thumbnail_url,
    width: file.width,
    height: file.height,
  };
}

export function isComposerAttachmentProcessing(attachment: ComposerAttachment): boolean {
  if (attachment.source === 'conversation') {
    return false;
  }
  return !attachment.fileId || attachment.status === 'pending' || attachment.status === 'uploading' || attachment.status === 'parsing';
}

export function isComposerAttachmentError(attachment: ComposerAttachment): boolean {
  return attachment.source === 'upload' && attachment.status === 'error';
}

export function toFileAttachment(attachment: ComposerAttachment): FileAttachment | null {
  if (attachment.source === 'conversation') {
    return {
      fileId: attachment.fileId,
      filename: attachment.filename,
      mimeType: attachment.mimetype,
      previewUrl: attachment.thumbnailUrl || undefined,
    };
  }

  if (!attachment.fileId) {
    return null;
  }

  return {
    fileId: attachment.fileId,
    filename: attachment.file.name,
    mimeType: attachment.file.type || 'application/octet-stream',
    previewUrl: attachment.previewUrl || attachment.thumbnailUrl || undefined,
  };
}
```

- [ ] **Step 3: 写附件列表测试并实现组件**

创建 `fusion-ui/src/components/chat/ComposerAttachmentList.test.tsx`：

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ComposerAttachment } from './composerAttachments';

import ComposerAttachmentList from './ComposerAttachmentList';

describe('ComposerAttachmentList', () => {
  it('removes a conversation attachment without requesting backend deletion', () => {
    const onRemoveConversationAttachment = vi.fn();
    const onRemoveUploadAttachment = vi.fn();
    const attachments: ComposerAttachment[] = [
      {
        source: 'conversation',
        fileId: 'file-1',
        filename: 'diagram.png',
        mimetype: 'image/png',
        status: 'processed',
        thumbnailUrl: 'https://cdn.example.com/thumb.png',
      },
    ];

    render(
      <ComposerAttachmentList
        attachments={attachments}
        onRemoveUploadAttachment={onRemoveUploadAttachment}
        onRemoveConversationAttachment={onRemoveConversationAttachment}
        onRetryUploadAttachment={vi.fn()}
        onViewImage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '移除资料 diagram.png' }));

    expect(onRemoveConversationAttachment).toHaveBeenCalledWith('file-1');
    expect(onRemoveUploadAttachment).not.toHaveBeenCalled();
  });
});
```

创建 `fusion-ui/src/components/chat/ComposerAttachmentList.tsx`，先迁移 `ChatInput` 现有附件 UI。组件 props：

```tsx
import { Loader2, PaperclipIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ComposerAttachment } from './composerAttachments';

interface ComposerAttachmentListProps {
  attachments: ComposerAttachment[];
  onRemoveUploadAttachment: (localId: string) => void;
  onRemoveConversationAttachment: (fileId: string) => void;
  onRetryUploadAttachment: (localId: string) => void;
  onViewImage: (url: string) => void;
}
```

实现规则：

- `attachment.source === 'upload'` 使用现有 `file.name`、`file.size`、`previewUrl`、`thumbnailUrl`、`status`、`errorMessage`。
- `attachment.source === 'conversation'` 使用 `filename`、`mimetype`、`thumbnailUrl`。
- 图片移除按钮 aria-label：上传文件用 `移除 ${file.name}`，既有资料用 `移除资料 ${filename}`。
- 非图片既有资料移除按钮 aria-label：`移除资料 ${filename}`。
- 上传失败仍显示 `重试上传`，既有资料不显示重试按钮。

- [ ] **Step 4: 改 ChatInput 测试**

在 `fusion-ui/src/components/chat/ChatInput.test.tsx` 追加：

```tsx
  it('sends selected conversation files without uploading them again', () => {
    currentState.auth.isAuthenticated = true;
    currentState.models.selectedModelId = 'model-1';
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: { vision: true, deepThinking: true },
      },
    ];
    const onSendMessage = vi.fn();
    const onClearConversationAttachments = vi.fn();

    render(
      <ChatInput
        onSendMessage={onSendMessage}
        activeChatId="chat-1"
        conversationAttachments={[
          {
            source: 'conversation',
            fileId: 'file-1',
            filename: 'diagram.png',
            mimetype: 'image/png',
            status: 'processed',
            thumbnailUrl: 'https://cdn.example.com/thumb.png',
          },
        ]}
        onRemoveConversationAttachment={vi.fn()}
        onClearConversationAttachments={onClearConversationAttachments}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）'), {
      target: { value: '继续分析这张图' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));

    expect(uploadFilesMock).not.toHaveBeenCalled();
    expect(onSendMessage).toHaveBeenCalledWith(
      '继续分析这张图',
      [
        {
          fileId: 'file-1',
          filename: 'diagram.png',
          mimeType: 'image/png',
          previewUrl: 'https://cdn.example.com/thumb.png',
        },
      ],
      undefined,
    );
    expect(onClearConversationAttachments).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 5: 改 ChatInput 实现**

在 `ChatInputProps` 增加：

```ts
  conversationAttachments?: ConversationComposerAttachment[];
  onRemoveConversationAttachment?: (fileId: string) => void;
  onClearConversationAttachments?: () => void;
  onUploadComplete?: () => void;
```

在 imports 增加：

```ts
import ComposerAttachmentList from './ComposerAttachmentList';
import {
  isComposerAttachmentError,
  isComposerAttachmentProcessing,
  toFileAttachment,
  type ConversationComposerAttachment,
  type UploadComposerAttachment,
} from './composerAttachments';
```

把 `LocalFileWithStatus` 改名为 `UploadComposerAttachment` 使用的本地状态，保留字段语义：

```ts
const uploadAttachments: UploadComposerAttachment[] = localFiles.map((file) => ({
  source: 'upload',
  localId: file.id,
  file: file.file,
  fileId: file.fileId,
  status: file.status,
  previewUrl: file.previewUrl,
  thumbnailUrl: file.thumbnailUrl,
  errorMessage: file.errorMessage,
}));
const composerAttachments = [...uploadAttachments, ...conversationAttachments];
```

发送时替换 attachments 构造为：

```ts
const attachments: FileAttachment[] = composerAttachments
  .map(toFileAttachment)
  .filter((attachment): attachment is FileAttachment => attachment !== null);
```

发送成功清理：

```ts
dispatch(clearFiles(chatId));
onClearConversationAttachments?.();
```

上传完成处调用：

```ts
onUploadComplete?.();
```

在 JSX 中用 `ComposerAttachmentList` 替换内联附件区。

- [ ] **Step 6: 运行 composer 与 ChatInput 测试**

Run:

```bash
cd /Users/sean/code/fusion/fusion-ui
npm test -- src/components/chat/composerAttachments.test.ts \
  src/components/chat/ComposerAttachmentList.test.tsx \
  src/components/chat/ChatInput.test.tsx
```

Expected: PASS。

- [ ] **Step 7: 提交 composer 改动**

```bash
cd /Users/sean/code/fusion/fusion-ui
git add src/components/chat/composerAttachments.ts src/components/chat/composerAttachments.test.ts src/components/chat/ComposerAttachmentList.tsx src/components/chat/ComposerAttachmentList.test.tsx src/components/chat/ChatInput.tsx src/components/chat/ChatInput.test.tsx
git commit -m "feat: 支持复用会话资料发送" -m "背景：
- 会话资料面板加入的既有文件需要进入 composer，并复用原 file_id 发送。
- 旧 ChatInput 只支持本地 File 上传状态。

改动：
- 新增 composer 附件 union 和发送映射。
- 抽出附件列表组件，统一展示本地上传和既有资料。
- ChatInput 支持既有资料发送、移除和发送后清空。

Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

### Task 6: 会话页 wiring 和删除同步

**Files:**
- Modify: `fusion-ui/src/app/(app)/chat/[chatId]/page.tsx`
- Modify: `fusion-ui/src/app/(app)/chat/[chatId]/page.test.tsx`

- [ ] **Step 1: 写页面 wiring 失败测试**

在 `fusion-ui/src/app/(app)/chat/[chatId]/page.test.tsx` hoisted mock 增加：

```ts
  useConversationFilesState: {
    files: [] as any[],
    isLoading: false,
    error: null as string | null,
    refresh: vi.fn(),
    removeFile: vi.fn(),
  },
  deleteFileMock: vi.fn(),
```

增加 mocks：

```tsx
vi.mock('@/hooks/useConversationFiles', () => ({
  useConversationFiles: () => useConversationFilesState,
}));

vi.mock('@/lib/api/files', () => ({
  deleteFile: deleteFileMock,
}));

vi.mock('@/components/chat/ConversationFilesPanel', () => ({
  default: function MockConversationFilesPanel(props: any) {
    if (!props.open) return null;
    return (
      <div data-testid="conversation-files-panel">
        <button type="button" onClick={() => props.onAddFile(props.files[0])}>加入资料</button>
        <button type="button" onClick={() => props.onDeleteFile(props.files[0].id)}>删除资料</button>
      </div>
    );
  },
}));
```

把 `MockChatInput` props 增加：

```tsx
    conversationAttachments = [],
    onClearConversationAttachments,
  }: {
    activeChatId?: string;
    resetSignal?: string;
    onStopStreaming?: () => void;
    conversationAttachments?: any[];
    onClearConversationAttachments?: () => void;
  }) {
```

在 mock JSX 中增加：

```tsx
        data-attachment-count={conversationAttachments.length}
        <button type="button" onClick={onClearConversationAttachments}>清空已选资料</button>
```

在 `beforeEach()` 重置：

```ts
    useConversationFilesState.files = [];
    useConversationFilesState.isLoading = false;
    useConversationFilesState.error = null;
    useConversationFilesState.refresh.mockClear();
    useConversationFilesState.removeFile.mockClear();
    deleteFileMock.mockReset();
    deleteFileMock.mockResolvedValue(undefined);
```

追加用例：

```tsx
  it('opens the conversation files panel and passes selected files to ChatInput', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });
    useConversationFilesState.files = [
      {
        id: 'file-1',
        filename: 'diagram.png',
        mimetype: 'image/png',
        size: 100,
        created_at: '2026-07-03T10:00:00Z',
        status: 'processed',
        error_message: null,
      },
    ];

    render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '打开会话资料' }));
    fireEvent.click(screen.getByText('加入资料'));

    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '1');
  });

  it('deletes a conversation file and removes it from selected composer files', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });
    useConversationFilesState.files = [
      {
        id: 'file-1',
        filename: 'diagram.png',
        mimetype: 'image/png',
        size: 100,
        created_at: '2026-07-03T10:00:00Z',
        status: 'processed',
        error_message: null,
      },
    ];

    render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '打开会话资料' }));
    fireEvent.click(screen.getByText('加入资料'));
    fireEvent.click(screen.getByText('删除资料'));

    await waitFor(() => {
      expect(deleteFileMock).toHaveBeenCalledWith('file-1');
    });
    expect(useConversationFilesState.removeFile).toHaveBeenCalledWith('file-1');
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '0');
  });
```

- [ ] **Step 2: 运行页面测试确认失败**

Run:

```bash
cd /Users/sean/code/fusion/fusion-ui
npm test -- "src/app/(app)/chat/[chatId]/page.test.tsx"
```

Expected: FAIL，缺少 `打开会话资料` 按钮或 props 未传入。

- [ ] **Step 3: 实现页面 wiring**

在 `page.tsx` import 增加：

```ts
import { Files } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConversationFilesPanel from '@/components/chat/ConversationFilesPanel';
import { useConversationFiles } from '@/hooks/useConversationFiles';
import { deleteFile, type FileInfo } from '@/lib/api/files';
import { conversationFileToComposerAttachment, type ConversationComposerAttachment } from '@/components/chat/composerAttachments';
```

在组件 state 增加：

```ts
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const [conversationAttachments, setConversationAttachments] = useState<ConversationComposerAttachment[]>([]);
  const conversationFiles = useConversationFiles(chatId);
```

增加 handlers：

```ts
  const handleAddConversationFile = useCallback((file: FileInfo) => {
    if (file.status !== 'processed') return;
    setConversationAttachments((current) => {
      if (current.some((item) => item.fileId === file.id)) {
        return current;
      }
      return [...current, conversationFileToComposerAttachment(file)];
    });
  }, []);

  const handleRemoveConversationAttachment = useCallback((fileId: string) => {
    setConversationAttachments((current) => current.filter((item) => item.fileId !== fileId));
  }, []);

  const handleClearConversationAttachments = useCallback(() => {
    setConversationAttachments([]);
  }, []);

  const handleDeleteConversationFile = useCallback(async (fileId: string) => {
    await deleteFile(fileId);
    conversationFiles.removeFile(fileId);
    setConversationAttachments((current) => current.filter((item) => item.fileId !== fileId));
  }, [conversationFiles]);
```

在 `handleSendMessage` 的 `onStreamEnd` 中增加资料刷新：

```ts
conversationFiles.refresh();
```

在 ChatInput 上方加入按钮：

```tsx
        <div className="flex items-center justify-end px-4 pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setFilesPanelOpen(true)}
            aria-label="打开会话资料"
          >
            <Files className="h-4 w-4" />
            资料
          </Button>
        </div>
```

给 `ChatInput` 增加 props：

```tsx
            conversationAttachments={conversationAttachments}
            onRemoveConversationAttachment={handleRemoveConversationAttachment}
            onClearConversationAttachments={handleClearConversationAttachments}
            onUploadComplete={conversationFiles.refresh}
```

在 return 末尾加入面板：

```tsx
      <ConversationFilesPanel
        open={filesPanelOpen}
        files={conversationFiles.files}
        isLoading={conversationFiles.isLoading}
        error={conversationFiles.error}
        selectedFileIds={new Set(conversationAttachments.map((file) => file.fileId))}
        onClose={() => setFilesPanelOpen(false)}
        onRefresh={conversationFiles.refresh}
        onAddFile={handleAddConversationFile}
        onDeleteFile={handleDeleteConversationFile}
      />
```

- [ ] **Step 4: 运行页面 wiring 测试**

Run:

```bash
cd /Users/sean/code/fusion/fusion-ui
npm test -- "src/app/(app)/chat/[chatId]/page.test.tsx"
```

Expected: PASS。

- [ ] **Step 5: 运行前端局部回归**

Run:

```bash
cd /Users/sean/code/fusion/fusion-ui
npm test -- src/lib/api/files.test.ts \
  src/lib/chat/conversationHydration.test.ts \
  src/hooks/useConversationFiles.test.tsx \
  src/components/chat/ConversationFilesPanel.test.tsx \
  src/components/chat/composerAttachments.test.ts \
  src/components/chat/ComposerAttachmentList.test.tsx \
  src/components/chat/ChatInput.test.tsx \
  "src/app/(app)/chat/[chatId]/page.test.tsx"
```

Expected: PASS。

- [ ] **Step 6: 提交页面 wiring**

```bash
cd /Users/sean/code/fusion/fusion-ui
git add "src/app/(app)/chat/[chatId]/page.tsx" "src/app/(app)/chat/[chatId]/page.test.tsx"
git commit -m "feat: 串联会话资料复用入口" -m "背景：
- 会话资料面板需要接入会话页，并把已选资料传给 composer。

改动：
- 会话页增加资料入口和右侧资料面板。
- 资料加入后进入 ChatInput，删除资料时同步移除 composer 选择。
- 发送完成和上传完成后刷新会话资料列表。

Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

### Task 7: 全量验证、执行台账和 CI/CD

**Files:**
- Modify: `fusion-api/docs/EXECUTION_LEDGER.md`
- Modify: `fusion-ui/docs/EXECUTION_LEDGER.md`

- [ ] **Step 1: 运行后端验证**

Run:

```bash
cd /Users/sean/code/fusion/fusion-api
python3 -m pytest test/test_file_service.py test/test_chat_service.py test/services/chat/test_message_builder.py -q
python3 -m ruff check app test
python3 -m ruff format --check app test
```

Expected: pytest PASS；ruff check PASS；ruff format check PASS。

- [ ] **Step 2: 运行前端验证**

Run:

```bash
cd /Users/sean/code/fusion/fusion-ui
npm test -- src/lib/api/files.test.ts \
  src/lib/chat/conversationHydration.test.ts \
  src/hooks/useConversationFiles.test.tsx \
  src/components/chat/ConversationFilesPanel.test.tsx \
  src/components/chat/composerAttachments.test.ts \
  src/components/chat/ComposerAttachmentList.test.tsx \
  src/components/chat/ChatInput.test.tsx \
  "src/app/(app)/chat/[chatId]/page.test.tsx"
npm test
npm run build
```

Expected: targeted Vitest PASS；full Vitest PASS；Next build PASS。

- [ ] **Step 3: 更新执行台账**

在两个文件都加入同一条最近发布记录：

- `fusion-api/docs/EXECUTION_LEDGER.md`
- `fusion-ui/docs/EXECUTION_LEDGER.md`

先取本地最终提交短哈希：

```bash
api_commit=$(git -C /Users/sean/code/fusion/fusion-api rev-parse --short HEAD)
ui_commit=$(git -C /Users/sean/code/fusion/fusion-ui rev-parse --short HEAD)
printf 'api:%s ui:%s\n' "$api_commit" "$ui_commit"
```

把命令输出中的两个短哈希写入台账 `commit` 列，写法示例为 `api:abc1234 / ui:def5678`，其中 `abc1234` 和 `def5678` 必须替换成上一步命令打印的真实值。台账记录其余列固定为：

- 日期：`2026-07-03`
- 仓库：`fusion-api` / `fusion-ui`
- 内容：`会话资料/文件体验 v1：同会话资料面板、资料复用、文件权限校验和历史附件元数据保真`
- 验证：``python3 -m pytest test/test_file_service.py test/test_chat_service.py test/services/chat/test_message_builder.py -q``、`npm test`、`npm run build`、CI/CD、真实 Chrome 回归

- [ ] **Step 4: 提交执行台账**

后端：

```bash
cd /Users/sean/code/fusion/fusion-api
git add docs/EXECUTION_LEDGER.md
git commit -m "docs: 记录会话资料体验发布" -m "背景：
- 会话资料/文件体验 v1 属于新的真实产品功能，需要进入 Fusion 执行台账。

改动：
- 记录后端文件权限校验和资料摘要相关发布证据。
- 保留 CI/CD 和真实 Chrome 回归验收项。

Co-Authored-By: Codex <noreply@anthropic.com>"
```

前端：

```bash
cd /Users/sean/code/fusion/fusion-ui
git add docs/EXECUTION_LEDGER.md
git commit -m "docs: 记录会话资料体验发布" -m "背景：
- 会话资料/文件体验 v1 已完成设计、前端入口和 composer 复用链路。

改动：
- 记录前端资料面板、历史附件元数据和回归证据。
- 与实现提交一起进入后续 CI/CD。

Co-Authored-By: Codex <noreply@anthropic.com>"
```

- [ ] **Step 5: 推送两个子仓**

```bash
cd /Users/sean/code/fusion/fusion-api
git push origin master

cd /Users/sean/code/fusion/fusion-ui
git push origin master
```

Expected: 两个 push 成功。

- [ ] **Step 6: 监控 GitHub Actions**

Run:

```bash
gh run list -R HyxiaoGe/fusion-api --branch master --limit 5
gh run list -R HyxiaoGe/fusion-ui --branch master --limit 5
```

读取本次 push 后最新 run 的 `databaseId` 并等待结果：

```bash
api_run_id=$(gh run list -R HyxiaoGe/fusion-api --branch master --limit 1 --json databaseId --jq '.[0].databaseId')
ui_run_id=$(gh run list -R HyxiaoGe/fusion-ui --branch master --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch -R HyxiaoGe/fusion-api "$api_run_id" --exit-status
gh run watch -R HyxiaoGe/fusion-ui "$ui_run_id" --exit-status
```

Expected: 两个仓本次 run 都 completed/success。

- [ ] **Step 7: 真实 Chrome 回归**

先查是否有用户已打开且匹配的 Fusion 部署标签。只允许复用既有匹配标签。

回归记录格式：

```markdown
| Case | 输入 | 页面 URL | 预期 | 实际 | console error | 刷新后结果 | 结论 |
|---|---|---|---|---|---|---|---|
| CF-01 | 上传一张新图片并发送第一问 | 写入浏览器地址栏完整 URL | 资料入口显示图片缩略图 | 写入观察到的资料面板和消息状态 | 写入无或错误摘要 | 写入刷新后的历史消息附件状态 | 写入 PASS 或 FAIL |
| CF-02 | 从资料面板把 CF-01 图片加入新提问并发送 | 写入浏览器地址栏完整 URL | 不重新上传，消息携带原 file_id | 写入观察到的发送和资料状态 | 写入无或错误摘要 | 写入刷新后的资料和消息状态 | 写入 PASS 或 FAIL |
| CF-03 | 删除 CF-01 资料 | 写入浏览器地址栏完整 URL | 资料列表和 composer 都移除该文件 | 写入观察到的删除后状态 | 写入无或错误摘要 | 写入刷新后的资料列表状态 | 写入 PASS 或 FAIL |
```

如果没有可复用标签，记录：

```markdown
真实 Chrome 回归阻塞：没有用户已打开且匹配的 Fusion 部署标签；未打开新标签、未启动本地服务、未使用 isolated context。
```

---

## Plan 自审清单

- Spec 目标 1-2：Task 4 和 Task 6 覆盖资料入口、资料列表、状态和缩略图。
- Spec 目标 3-5：Task 5 和 Task 6 覆盖复用原 `file_id`、处理中禁用、删除同步。
- Spec 目标 6：Task 3 覆盖历史 hydration 保留附件元数据。
- Spec 目标 7：Task 1 覆盖后端用户、会话和处理状态校验。
- 非目标：计划未新增表，未做跨会话库、知识库、项目空间、embedding 或 Redis Stream 改造。
- 验收：Task 7 固化 repo 测试、构建、CI/CD 和真实 Chrome 回归记录。
