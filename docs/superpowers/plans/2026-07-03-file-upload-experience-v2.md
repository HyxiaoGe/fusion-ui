# 上传/会话资料体验 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复图片/文件上传假失败和坏图 500，并让新会话上传后的文件也进入会话资料侧栏、以 `file_id` 引用加入本次提问。

**Architecture:** 前端保留现有 `file_ids` 发送协议，上传完成后把文件从本地上传态提升为会话资料引用；已有会话和新会话共用“资料列表 + composer 引用”模型。后端把图片解码/截断类错误转成用户可理解的 400。部署层为文件上传准备独立直达 API 的 nginx 路由，避免 multipart 继续走 Next rewrites 额外代理链。

**Tech Stack:** FastAPI, Pillow, pytest/unittest, Next.js 15, React 19, Vitest, Testing Library, nginx.

---

## 任务拆分

### Task 1: 前端上传请求不再 25s 假失败

**Files:**
- Modify: `fusion-ui/src/lib/api/files.ts`
- Test: `fusion-ui/src/lib/api/files.test.ts`

- [x] 写失败测试：2MB+ 单文件上传推进 25s 后 `AbortSignal` 仍未 abort。
- [x] 写失败测试：上传 AbortError 返回“文件上传超时，请检查网络后重试”，不暴露 `signal is aborted without reason`。
- [x] 实现大小感知上传超时：最小 120s，按总文件大小延长，上限 10 分钟。
- [x] 用 `finally` 清理 timeout，避免失败或重试路径遗留定时器。
- [x] 运行 `npm test -- src/lib/api/files.test.ts`。

### Task 2: 后端坏图返回 400 而不是服务器内部错误

**Files:**
- Modify: `fusion-api/app/processor/image_processor.py`
- Test: `fusion-api/test/test_image_processor.py`

- [x] 写失败测试：无效/截断图片 bytes 调 `ImageProcessor.process()` 时抛 `ValueError("图片文件损坏或无法读取，请重新保存后再上传")`。
- [x] 在 Pillow 打开、EXIF 转置、编码缩略图的整段处理外捕获 `UnidentifiedImageError` 和 `OSError`，统一转成上述 `ValueError`。
- [x] 确认 `main.py` 现有 `ValueError` handler 会返回 400 `INVALID_PARAM`。
- [x] 补路由级回归：`/api/files/upload` 收到服务层 `ValueError` 时返回 400 `INVALID_PARAM`，不返回“服务器内部错误”。
- [x] 运行 `.venv311/bin/python -m pytest test/test_image_processor.py test/test_file_service.py -q` 和相关 ruff。

### Task 3: 新会话页上传后打开会话资料并引用本次提问

**Files:**
- Modify: `fusion-ui/src/components/home/HomeChatSurface.tsx`
- Create: `fusion-ui/src/components/home/HomeChatSurface.test.tsx`

- [x] 写失败测试：`ChatInput.onUploadComplete(processed image, pendingChatId)` 后，新会话页打开资料面板并把该资料传回 `ChatInput.conversationAttachments`。
- [x] 写失败测试：从资料面板加入 processed 文件后，发送消息只传已有 `fileId`，不触发重新上传。
- [x] 写失败测试：新会话上传已处理图片后，本地上传附件被替换为单个会话资料引用，发送时不重复携带同一 `fileId`。
- [x] 写失败测试：删除资料时调用 `deleteFile(fileId)`，并同步移除 composer 里的同一资料。
- [x] 在 `HomeChatSurface` 持有 `pendingUploadChatId`、会话资料列表、已选资料状态和资料面板打开状态。
- [x] 上传完成时刷新资料、打开面板；processed 文件直接自动加入本次提问，parsing 文件等列表刷新为 processed 后再自动加入。
- [x] `handleSendMessage` 继续使用 `pendingConversationId`，确保上传、资料列表和发送落在同一临时会话 ID。
- [x] 运行 `npm test -- src/components/home/HomeChatSurface.test.tsx src/components/chat/ChatInput.test.tsx src/app/'(app)'/chat/'[chatId]'/page.test.tsx`。

### Task 4: 上传代理通道配置

**Files:**
- Investigate/modify durable ops location if present.
- If no tracked ops config exists, provide exact nginx patch for `/home/heyanxiao/project/nginx/conf.d/services.conf` and apply only after confirming it is the intended durable path.

- [x] 确认仓库内是否有 nginx 配置来源；没有则不要伪造本地持久化。
- [x] 配置 `/api/files/upload` 更具体 location：直达 `fusion-api:8000`，`proxy_request_buffering off`，`proxy_read_timeout`/`proxy_send_timeout` 至少 600s，保留鉴权头。
- [x] `nginx -t` 后 reload。
- [x] 用远端 access log 比较新上传的 `request_time` 与 `upstream_time`。

## 验收矩阵

- `U1`：2MB+ 图片上传 25s 内不被前端 abort。
- `U2`：网络/超时中断时用户看到中文可操作错误。
- `B1`：坏图上传返回 400，message 说明文件损坏或无法读取。
- `N1`：新会话页上传图片后自动打开资料面板。
- `N2`：新会话页上传后的图片以会话资料引用加入本次提问，发送时只传 `file_id`。
- `N3`：删除资料同时移除 composer 选中引用。
- `N4`：新会话上传完成后，本地上传附件移除，composer 中只保留同一文件的会话资料引用。
- `P1`：部署后 `/api/files/upload` 不再走 Next upstream，慢上传样本不再因 25s 前端 timeout 假失败。
