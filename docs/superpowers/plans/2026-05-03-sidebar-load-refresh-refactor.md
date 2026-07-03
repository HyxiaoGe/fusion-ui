# Sidebar Load/Refresh Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 fusion-ui 侧边栏对话列表的加载/刷新/搜索机制，根因修复 4 个关联 bug：listIds 被覆盖、checkScrollbar 闪烁死循环、搜索只能搜已加载部分、`requestConversationListRefresh` 语义错配。

**Architecture:** 把"刷新元数据"和"分页拉取"两件事在前后端都拆开。后端新增 `GET /api/chat/conversations/metadata?ids=...`（按 ID 拉元数据，不涉及分页）和 `GET /api/chat/conversations/search?q=...`（按标题模糊搜索）。前端 reducer 新增 `updateConversationsMetadata` action 只动 byId 不动 listIds/pagination，`requestConversationListRefresh` 触发它而不是 `fetchList(1,10)`。ChatSidebar 用 IntersectionObserver + sentinel 取代按钮 + ResizeObserver 双轨制。搜索框 debounce 调后端 search 接口。

**Tech Stack:** FastAPI + SQLAlchemy + pytest + ruff（后端）；Next.js 15 + React 19 + Redux Toolkit + vitest（前端）

---

## File Structure

### 后端（fusion-api）

| 文件 | 责任 | 变更类型 |
|---|---|---|
| `app/db/repositories.py` | 数据访问：增 `get_metadata_by_ids` + `search_by_title` | Modify |
| `app/services/chat_service.py` | 业务逻辑：增 `get_conversations_metadata` + `search_conversations_by_title` | Modify |
| `app/api/chat.py` | 路由：增 `GET /conversations/metadata` + `GET /conversations/search` | Modify |
| `test/test_chat_metadata_search.py` | 新接口的集成测试 | Create |

### 前端（fusion-ui）

| 文件 | 责任 | 变更类型 |
|---|---|---|
| `src/lib/api/chat.ts` | API 调用：增 `getConversationsMetadata` + `searchConversations` | Modify |
| `src/redux/slices/conversationSlice.ts` | reducer：增 `updateConversationsMetadata` + search 字段；撤销 bug2 合并补丁 | Modify |
| `src/redux/slices/conversationSlice.test.ts` | reducer 测试 | Modify |
| `src/hooks/useConversationList.ts` | hook：增 `refreshLoadedMetadata` + `searchConversations`，改 version 监听 effect | Modify |
| `src/components/chat/sidebar/ChatList.tsx` | 列表底部加 sentinel slot | Modify |
| `src/components/chat/ChatSidebar.tsx` | 删 checkScrollbar/ResizeObserver/showLoadMoreButton/Button JSX；加 IntersectionObserver；搜索 debounce 后端 | Modify |

---

## 前置准备

- [ ] **Step 0.1: 创建 feat 分支**

```bash
cd /Users/sean/code/fusion/fusion-ui
git checkout master
git pull origin master
git checkout -b feat/sidebar-load-refactor
```

每个 commit 推 feat 分支会自动部署到 dev:3005 preview，方便逐步验证；fusion-api 改动用 ssh dev 直接重启容器验证，最终 merge master 时一起合。

- [ ] **Step 0.2: 后端也开 feat 分支**

```bash
cd /Users/sean/code/fusion/fusion-api
git checkout master
git pull origin master
git checkout -b feat/sidebar-metadata-search
```

---

## Task 1: 后端 repository 层 — 按 ID 拉元数据

**Files:**
- Modify: `fusion-api/app/db/repositories.py`（在 `ConversationRepository` 类内 `get_paginated` 方法之后插入新方法）

- [ ] **Step 1.1: 在 ConversationRepository 类内新增 get_metadata_by_ids 方法**

定位：`fusion-api/app/db/repositories.py` 第 234 行后（`get_paginated` 方法之后、`create_message` 之前）插入：

```python
    def get_metadata_by_ids(self, user_id: str, conversation_ids: List[str]) -> List[Conversation]:
        """按 ID 列表拉取对话元数据（不含 messages），仅返回属于当前用户的对话。

        用途：发完消息 / 重命名后只刷新已显示对话的标题等，避免重新拉取整个分页。
        """
        if not conversation_ids:
            return []
        try:
            db_conversations = (
                self.db.query(ConversationModel)
                .filter(
                    ConversationModel.user_id == user_id,
                    ConversationModel.id.in_(conversation_ids),
                )
                .all()
            )
            return [
                Conversation(
                    id=db_conv.id,
                    user_id=db_conv.user_id,
                    model_id=db_conv.model_id,
                    title=db_conv.title,
                    messages=[],
                    created_at=db_conv.created_at,
                    updated_at=db_conv.updated_at,
                )
                for db_conv in db_conversations
            ]
        except Exception as e:
            logger.error(f"按 ID 列表拉取对话元数据失败: {e}")
            return []
```

- [ ] **Step 1.2: 在 ConversationRepository 类内新增 search_by_title 方法**

紧接 Step 1.1 之后插入：

```python
    def search_by_title(self, user_id: str, query: str, limit: int = 50) -> List[Conversation]:
        """按标题模糊搜索当前用户的对话，按 updated_at 倒序，限 limit 条。"""
        if not query or not query.strip():
            return []
        try:
            pattern = f"%{query.strip()}%"
            db_conversations = (
                self.db.query(ConversationModel)
                .filter(
                    ConversationModel.user_id == user_id,
                    ConversationModel.title.ilike(pattern),
                )
                .order_by(ConversationModel.updated_at.desc())
                .limit(limit)
                .all()
            )
            return [
                Conversation(
                    id=db_conv.id,
                    user_id=db_conv.user_id,
                    model_id=db_conv.model_id,
                    title=db_conv.title,
                    messages=[],
                    created_at=db_conv.created_at,
                    updated_at=db_conv.updated_at,
                )
                for db_conv in db_conversations
            ]
        except Exception as e:
            logger.error(f"按标题搜索对话失败: {e}")
            return []
```

- [ ] **Step 1.3: ruff 检查**

```bash
cd /Users/sean/code/fusion/fusion-api
python -m ruff check app/db/repositories.py
python -m ruff format --check app/db/repositories.py
```

Expected: 全部 pass。如果 format 失败，跑 `python -m ruff format app/db/repositories.py` 修复。

---

## Task 2: 后端 service 层 — 包装 repository

**Files:**
- Modify: `fusion-api/app/services/chat_service.py`

- [ ] **Step 2.1: 找到 get_conversations_paginated 方法定位**

```bash
cd /Users/sean/code/fusion/fusion-api
grep -n "get_conversations_paginated\|def " app/services/chat_service.py | head -10
```

记下 `get_conversations_paginated` 方法的结束行号。

- [ ] **Step 2.2: 在 get_conversations_paginated 方法之后新增两个 service 方法**

```python
    def get_conversations_metadata(self, user_id: str, conversation_ids: List[str]) -> List[Dict[str, Any]]:
        """按 ID 列表返回对话元数据（前端用于刷新已显示对话的标题等）。"""
        repo = ConversationRepository(self.db)
        conversations = repo.get_metadata_by_ids(user_id, conversation_ids)
        return [
            {
                "id": conv.id,
                "title": conv.title,
                "model_id": conv.model_id,
                "created_at": conv.created_at,
                "updated_at": conv.updated_at,
            }
            for conv in conversations
        ]

    def search_conversations_by_title(self, user_id: str, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """按标题模糊搜索当前用户的对话。"""
        repo = ConversationRepository(self.db)
        conversations = repo.search_by_title(user_id, query, limit)
        return [
            {
                "id": conv.id,
                "title": conv.title,
                "model_id": conv.model_id,
                "created_at": conv.created_at,
                "updated_at": conv.updated_at,
            }
            for conv in conversations
        ]
```

注意：如果文件顶部还没 import `List, Dict, Any`，确保 `from typing import List, Dict, Any` 存在；如果 `ConversationRepository` 未在文件内可见，加 `from app.db.repositories import ConversationRepository`。先 grep 确认：

```bash
grep -n "from typing\|ConversationRepository" app/services/chat_service.py | head -5
```

按现状决定是否补 import。

- [ ] **Step 2.3: ruff 检查**

```bash
python -m ruff check app/services/chat_service.py
python -m ruff format --check app/services/chat_service.py
```

Expected: pass。

---

## Task 3: 后端 API 层 — 新增两个路由

**Files:**
- Modify: `fusion-api/app/api/chat.py`

- [ ] **Step 3.1: 找到现有 conversations 路由的 import 和位置**

```bash
cd /Users/sean/code/fusion/fusion-api
sed -n '1,30p;47,70p' app/api/chat.py
```

确认导入了哪些 typing / Query / Depends，以及 router 已有的 `get_conversations` 和 `get_conversation` 路由位置。

- [ ] **Step 3.2: 在 GET /conversations 路由之后插入两个新路由**

定位：`app/api/chat.py` 第 60 行（`get_conversation` 之前）插入：

```python
@router.get("/conversations/metadata")
def get_conversations_metadata(
    ids: str = Query(..., description="逗号分隔的对话 ID 列表，最多 100 个"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """按 ID 列表拉取对话元数据（标题/updated_at/model_id），不含消息内容。

    前端用于"发完消息后刷新当前侧边栏已显示对话"，避免重新拉取整个分页导致列表收起。
    """
    id_list = [s.strip() for s in ids.split(",") if s.strip()]
    if not id_list:
        return {"items": []}
    if len(id_list) > 100:
        raise HTTPException(status_code=400, detail="ids 数量不能超过 100")
    chat_service = ChatService(db)
    items = chat_service.get_conversations_metadata(current_user.id, id_list)
    return {"items": items}


@router.get("/conversations/search")
def search_conversations(
    q: str = Query(..., min_length=1, max_length=200, description="搜索关键词"),
    limit: int = Query(50, ge=1, le=100, description="结果上限"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """按标题模糊搜索当前用户的对话，按 updated_at 倒序。"""
    chat_service = ChatService(db)
    items = chat_service.search_conversations_by_title(current_user.id, q, limit)
    return {"items": items}
```

注意：必须放在 `GET /conversations/{conversation_id}` 路由 **之前**，否则 FastAPI 会把 `metadata` 和 `search` 当成 path param 匹配进 `{conversation_id}`。

- [ ] **Step 3.3: 验证 import 完整**

```bash
grep -n "from fastapi import\|HTTPException\|Query" app/api/chat.py | head -5
```

如果 `HTTPException` 或 `Query` 没在 import 里，补上：在 `from fastapi import ...` 那行加上缺的。

- [ ] **Step 3.4: ruff 检查**

```bash
python -m ruff check app/api/chat.py
python -m ruff format --check app/api/chat.py
```

Expected: pass。

---

## Task 4: 后端测试 — 集成测试覆盖两个新接口

**Files:**
- Create: `fusion-api/test/test_chat_metadata_search.py`

- [ ] **Step 4.1: 看一下现有测试如何 setUp client + 模拟用户**

```bash
cd /Users/sean/code/fusion/fusion-api
ls test/
cat test/test_core_surface.py 2>/dev/null | head -50
```

照着已有测试的 fixture 套路写新测试（`TestClient` + `override_dependency` 模式）。如果现有测试用的是其他模式，沿用它。

- [ ] **Step 4.2: 写测试文件**

```python
"""集成测试：GET /conversations/metadata + GET /conversations/search

覆盖：
- metadata: 空 ids、单 id、多 id、不属于当前用户的 id 被过滤、超过 100 个返回 400
- search: 空字符串走不通（min_length=1）、模糊匹配、limit 生效、user_id 隔离
"""
from fastapi.testclient import TestClient

# 按现有测试的 fixture 套路调整 import；下面是示意，按 test/test_core_surface.py 实际写法适配
from main import app
from app.api.deps import get_current_user, get_db
# 如果有现成的 fake user/db fixture，复用它

# 示意：根据现有测试套路完成 client + db + user fixture 的 setUp
# 然后逐个 test case：

def test_metadata_empty_ids_returns_empty(client, fake_user_token):
    resp = client.get(
        "/api/chat/conversations/metadata?ids=",
        headers={"Authorization": f"Bearer {fake_user_token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"items": []}


def test_metadata_returns_only_user_owned(client, fake_user_token, seed_conversations):
    # seed_conversations 应该插入 2 条属于当前用户 + 1 条属于其他用户
    own_id = seed_conversations["own"][0]
    other_id = seed_conversations["other"][0]
    resp = client.get(
        f"/api/chat/conversations/metadata?ids={own_id},{other_id}",
        headers={"Authorization": f"Bearer {fake_user_token}"},
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    ids = [it["id"] for it in items]
    assert own_id in ids
    assert other_id not in ids  # user_id 隔离


def test_metadata_too_many_ids_returns_400(client, fake_user_token):
    ids = ",".join([f"id-{i}" for i in range(101)])
    resp = client.get(
        f"/api/chat/conversations/metadata?ids={ids}",
        headers={"Authorization": f"Bearer {fake_user_token}"},
    )
    assert resp.status_code == 400


def test_search_returns_matching_titles(client, fake_user_token, seed_conversations):
    # seed: 标题包含 "Python" 的 2 条 + 不含的 3 条
    resp = client.get(
        "/api/chat/conversations/search?q=Python",
        headers={"Authorization": f"Bearer {fake_user_token}"},
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 2
    assert all("Python" in it["title"] for it in items)


def test_search_limit_enforced(client, fake_user_token, seed_many_conversations):
    # seed_many: 标题都含 "test" 的 60 条
    resp = client.get(
        "/api/chat/conversations/search?q=test&limit=10",
        headers={"Authorization": f"Bearer {fake_user_token}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 10


def test_search_isolates_users(client, fake_user_token, seed_conversations):
    # seed: 当前用户有 1 条 "shared keyword"，其他用户也有 2 条 "shared keyword"
    resp = client.get(
        "/api/chat/conversations/search?q=shared",
        headers={"Authorization": f"Bearer {fake_user_token}"},
    )
    items = resp.json()["items"]
    assert len(items) == 1  # 只看到自己的


def test_search_empty_query_rejected(client, fake_user_token):
    resp = client.get(
        "/api/chat/conversations/search?q=",
        headers={"Authorization": f"Bearer {fake_user_token}"},
    )
    assert resp.status_code == 422  # FastAPI Query(min_length=1) 校验
```

> **重要**：上面的 `client / fake_user_token / seed_conversations / seed_many_conversations` fixture **必须**根据 `test/test_core_surface.py` 等现有测试的实际 fixture 命名和实现方式适配。如果项目用的是 monkeypatch 模式而不是 fixture，照着改写。**不能照抄上面的代码，需要按现状落地**。

- [ ] **Step 4.3: 运行新测试**

```bash
cd /Users/sean/code/fusion/fusion-api
python -m pytest test/test_chat_metadata_search.py -v
```

Expected: 所有测试 pass。如果 fixture 不对，先修 fixture。

- [ ] **Step 4.4: 运行全量测试确保无回归**

```bash
python -m pytest test/ -v 2>&1 | tail -20
```

Expected: 旧测试全 pass + 新 7 个测试 pass。

- [ ] **Step 4.5: ruff 全项目检查**

```bash
python -m ruff check .
python -m ruff format --check .
```

Expected: pass。

- [ ] **Step 4.6: Commit + push 后端**

```bash
cd /Users/sean/code/fusion/fusion-api
git add app/db/repositories.py app/services/chat_service.py app/api/chat.py test/test_chat_metadata_search.py
git commit -m "$(cat <<'EOF'
feat(api): 新增对话元数据/搜索接口供前端侧边栏重构使用

- GET /api/chat/conversations/metadata?ids=...
  按 ID 列表返回元数据（title/updated_at/model_id），不含消息
  用途：发完消息/重命名后只刷已显示对话的标题，避免前端重拉分页导致列表收起
- GET /api/chat/conversations/search?q=...&limit=50
  按标题模糊搜索当前用户对话，updated_at 倒序，limit 默认 50 上限 100
  替代前端在已加载部分本地 filter 的临时实现
- repository / service / api 三层完整实现 + 集成测试覆盖
  user_id 隔离、ids 上限、limit 校验、空 query 拒绝

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
git push -u origin feat/sidebar-metadata-search
```

- [ ] **Step 4.7: 验证 dev 后端容器更新（如果 fusion-api 有 CI 自动部署，等部署；否则 ssh dev 手动重启）**

```bash
# 看 fusion-api 是否有 GitHub Actions
gh run list --branch feat/sidebar-metadata-search --limit 2 2>/dev/null
# 如果没有 workflow，手动操作：
# ssh dev "cd ~/project/fusion && docker compose -f <fusion-api-compose>.yml restart fusion-api"
```

或者先在本机 `curl` 验证（如果开了端口转发或 dev 直连）：

```bash
# 假设拿到一个有效 JWT token
TOKEN="..."
curl -sS -H "Authorization: Bearer $TOKEN" "http://192.168.1.10:8000/api/chat/conversations/metadata?ids=test1,test2"
curl -sS -H "Authorization: Bearer $TOKEN" "http://192.168.1.10:8000/api/chat/conversations/search?q=test"
```

Expected: 接口返回 `{"items": [...]}`，HTTP 200。

---

## Task 5: 前端 API 客户端 — 新增两个调用

**Files:**
- Modify: `fusion-ui/src/lib/api/chat.ts`

- [ ] **Step 5.1: 找现有的 getConversations 函数定位**

```bash
cd /Users/sean/code/fusion/fusion-ui
grep -n "export.*getConversations\|fetchWithAuth" src/lib/api/chat.ts | head -10
```

记下 `getConversations` 函数末尾行号，沿用其调用模式（fetchWithAuth + JSON 解析）。

- [ ] **Step 5.2: 在 getConversations 之后新增两个 API 函数**

```typescript
/**
 * 按 ID 列表拉取对话元数据（不含 messages）
 * 用于发完消息后只刷新已显示对话的标题等，避免重拉整个分页
 */
export async function getConversationsMetadata(ids: string[]): Promise<Array<{
  id: string;
  title: string;
  model_id: string;
  created_at: string;
  updated_at: string;
}>> {
  if (ids.length === 0) return [];
  const idsParam = encodeURIComponent(ids.join(','));
  const response = await fetchWithAuth(`/api/chat/conversations/metadata?ids=${idsParam}`);
  if (!response.ok) {
    throw new Error(`获取对话元数据失败: ${response.status}`);
  }
  const data = await response.json();
  return data.items || [];
}

/**
 * 按标题模糊搜索当前用户对话
 */
export async function searchConversations(query: string, limit = 50, signal?: AbortSignal): Promise<Array<{
  id: string;
  title: string;
  model_id: string;
  created_at: string;
  updated_at: string;
}>> {
  if (!query.trim()) return [];
  const params = new URLSearchParams({ q: query.trim(), limit: String(limit) });
  const response = await fetchWithAuth(`/api/chat/conversations/search?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`搜索对话失败: ${response.status}`);
  }
  const data = await response.json();
  return data.items || [];
}
```

> 注意：如果 `fetchWithAuth` 的签名不支持 `signal` 参数，先看其定义（`grep -n "export.*fetchWithAuth" src/lib/api/`），如有必要在 fetchWithAuth 上加 `init?: RequestInit` 透传 signal；如果改 fetchWithAuth 影响面大，则 `searchConversations` 临时去掉 signal 参数（不做请求取消，只 debounce 兜底）。

- [ ] **Step 5.3: 验证 build 通过**

```bash
npm run build 2>&1 | tail -8
```

Expected: build success。

---

## Task 6: 前端 reducer — 新增 updateConversationsMetadata 动作 + search state + 撤销 bug2 合并补丁

**Files:**
- Modify: `fusion-ui/src/redux/slices/conversationSlice.ts`
- Modify: `fusion-ui/src/redux/slices/conversationSlice.test.ts`

- [ ] **Step 6.1: 先写 reducer 失败测试 — updateConversationsMetadata 行为约束**

定位：`fusion-ui/src/redux/slices/conversationSlice.test.ts`，在 `describe('conversationSlice', () => {` 块内、最后一个 `it(...)` 之后新增：

```typescript
  it('updateConversationsMetadata only mutates byId entries that already exist, never touches listIds or pagination', () => {
    const initialState = {
      byId: {
        'conv-1': createConversation({ id: 'conv-1', title: 'Old 1', updatedAt: 1 }),
        'conv-2': createConversation({ id: 'conv-2', title: 'Old 2', updatedAt: 2 }),
      },
      listIds: ['conv-1', 'conv-2'],
      pagination: {
        currentPage: 2, pageSize: 10, totalPages: 2, totalCount: 12, hasNext: false, hasPrev: true,
      },
      isLoadingList: false,
      isLoadingMore: false,
      listError: null,
      conversationListVersion: 5,
      hydrationStatus: {},
      hydrationError: {},
      pendingConversationId: null,
      animatingTitleId: null,
      reasoningEnabled: true,
      globalError: null,
      searchResults: null,
      isSearching: false,
      searchError: null,
    };

    const next = reducer(
      initialState as ReturnType<typeof reducer>,
      updateConversationsMetadata([
        { id: 'conv-1', title: 'New 1', model_id: 'gpt-4', updated_at: 100 },
        { id: 'conv-99', title: 'Should not appear', model_id: 'gpt-4', updated_at: 999 }, // 不存在的 ID 应被忽略
      ])
    );

    // listIds 不变
    expect(next.listIds).toEqual(['conv-1', 'conv-2']);
    // pagination 不变
    expect(next.pagination?.currentPage).toBe(2);
    expect(next.pagination?.totalCount).toBe(12);
    // 已存在的元数据更新
    expect(next.byId['conv-1'].title).toBe('New 1');
    expect(next.byId['conv-1'].updatedAt).toBe(100);
    // 不存在的 ID 不会被加入
    expect(next.byId['conv-99']).toBeUndefined();
    // 未提及的 conversation 完全不变
    expect(next.byId['conv-2'].title).toBe('Old 2');
  });
```

同时在文件顶部 import 加上：

```typescript
import reducer, {
  materializeConversation,
  setConversationList,
  updateConversationsMetadata,  // 新增
} from './conversationSlice';
```

- [ ] **Step 6.2: 跑测试看到失败**

```bash
cd /Users/sean/code/fusion/fusion-ui
npx vitest run src/redux/slices/conversationSlice.test.ts 2>&1 | tail -10
```

Expected: 至少一个测试失败（updateConversationsMetadata 还没导出）。

- [ ] **Step 6.3: 修改 conversationSlice.ts —— 加新 state 字段**

定位：`src/redux/slices/conversationSlice.ts` 的 `interface ConversationState` 定义处，新增 3 个字段：

```typescript
export interface ConversationState {
  // ... 已有字段 ...
  searchResults: Conversation[] | null;  // null = 未搜索；[] = 搜了但无结果
  isSearching: boolean;
  searchError: string | null;
}
```

`initialState`：

```typescript
const initialState: ConversationState = {
  // ... 已有字段 ...
  searchResults: null,
  isSearching: false,
  searchError: null,
};
```

- [ ] **Step 6.4: 撤销 bug 2 的合并补丁，setConversationList 改回直接覆盖**

定位：`src/redux/slices/conversationSlice.ts` 的 `setConversationList` reducer。把 Task 9（之前的）合并逻辑改回原始：

```typescript
    setConversationList(
      state,
      action: PayloadAction<{ conversations: Conversation[]; pagination: Pagination }>
    ) {
      const { conversations, pagination } = action.payload;
      state.listIds = conversations.map((conversation) => conversation.id);
      conversations.forEach((conversation) => {
        const existing = state.byId[conversation.id];
        if (existing) {
          // 只更新元数据，永远不覆盖已有消息（保留 hydrated messages）
          state.byId[conversation.id] = {
            ...existing,
            title: conversation.title,
            updatedAt: conversation.updatedAt,
            model_id: conversation.model_id,
            createdAt: conversation.createdAt,
          };
        } else {
          state.byId[conversation.id] = conversation;
        }
      });
      state.pagination = pagination;
      state.isLoadingList = false;
      state.listError = null;
    },
```

> 之所以可以放心改回，是因为 Task 7 后 `requestConversationListRefresh` 不再触发 `fetchList(1)`，setConversationList 只在初始化和 loadMore 后被替换性场景调用。bug 2 的"列表收起"根因消失。

- [ ] **Step 6.5: 新增 updateConversationsMetadata reducer**

定位：在 `requestConversationListRefresh` reducer 之后新增：

```typescript
    updateConversationsMetadata(
      state,
      action: PayloadAction<Array<{
        id: string;
        title: string;
        model_id: string;
        updated_at: number | string;
        created_at?: number | string;
      }>>
    ) {
      // 仅更新 byId 中已存在的对话的元数据，不动 listIds / pagination / messages
      action.payload.forEach((item) => {
        const existing = state.byId[item.id];
        if (!existing) return;  // 不存在的 ID 直接忽略
        state.byId[item.id] = {
          ...existing,
          title: item.title,
          model_id: item.model_id,
          updatedAt: typeof item.updated_at === 'number' ? item.updated_at : Date.parse(item.updated_at),
        };
      });
    },
```

注意 `updated_at` 后端可能返回 ISO string 或 timestamp number，做兼容处理。如果后端用的是 SQLAlchemy datetime 默认序列化（ISO string），`Date.parse` 路径生效。如果实际格式不同，看 `mapServerItem`（在 useConversationList.ts）怎么处理的，沿用相同逻辑（`parseTimestamp`）。

> 改进版（如果项目有 `parseTimestamp` 工具）：
>
> ```typescript
> import { parseTimestamp } from '@/lib/utils/parseTimestamp';
> // ...
> updatedAt: parseTimestamp(item.updated_at),
> ```
>
> 先 grep `parseTimestamp` 看是不是合适。

- [ ] **Step 6.6: 同时新增 search 相关 reducer**

```typescript
    setSearchLoading(state, action: PayloadAction<boolean>) {
      state.isSearching = action.payload;
      if (action.payload) {
        state.searchError = null;
      }
    },
    setSearchResults(state, action: PayloadAction<Conversation[] | null>) {
      state.searchResults = action.payload;
      state.isSearching = false;
      state.searchError = null;
    },
    setSearchError(state, action: PayloadAction<string | null>) {
      state.searchError = action.payload;
      state.isSearching = false;
    },
    clearSearch(state) {
      state.searchResults = null;
      state.isSearching = false;
      state.searchError = null;
    },
```

- [ ] **Step 6.7: 在文件底部 export 新 actions**

定位：`src/redux/slices/conversationSlice.ts` 末尾的 `export const { ... } = conversationSlice.actions`，加上：

```typescript
export const {
  // ... 已有 actions ...
  updateConversationsMetadata,
  setSearchLoading,
  setSearchResults,
  setSearchError,
  clearSearch,
} = conversationSlice.actions;
```

- [ ] **Step 6.8: 跑测试 + 删除 bug 2 的旧测试**

之前给 bug 2 加的 `preserves previously loaded pages when refreshing the first page` 测试现在跟新行为冲突（reducer 改回直接覆盖），需要删除：

打开 `src/redux/slices/conversationSlice.test.ts`，找到 `it('preserves previously loaded pages when refreshing the first page', ...)`，**整个 it 块删除**。

```bash
npx vitest run src/redux/slices/conversationSlice.test.ts 2>&1 | tail -15
```

Expected: 新增的 `updateConversationsMetadata only mutates...` 测试 PASS，原有 2 个测试（`keeps hydrated messages`、`materializes a pending conversation`）继续 PASS，删掉的 bug 2 测试不再出现。共 3 个测试 pass。

- [ ] **Step 6.9: 全量测试确保无回归**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: 22 fail（baseline）/ 81 pass。pass 数应跟修复 bug 2 时一致（一个新增 metadata 测试 + 删一个 bug2 测试 = 0 净变化）。

- [ ] **Step 6.10: build 确保 type 通过**

```bash
npm run build 2>&1 | tail -5
```

Expected: build success。

- [ ] **Step 6.11: Commit**

```bash
git add src/redux/slices/conversationSlice.ts src/redux/slices/conversationSlice.test.ts src/lib/api/chat.ts
git commit -m "$(cat <<'EOF'
feat(redux): 新增 updateConversationsMetadata + search state；撤销 bug2 合并补丁

- 新 action updateConversationsMetadata：仅更新 byId 中已存在 conversation 的
  title/updatedAt/model_id，永远不动 listIds/pagination；不存在的 ID 忽略
- 新增 search 三态字段（searchResults/isSearching/searchError）+ 配套 reducers
  （setSearchLoading/setSearchResults/setSearchError/clearSearch）
- setConversationList 改回直接覆盖 listIds（撤销 8e89891 的合并补丁）：
  refresh 路径将由 Task 7 的 refreshLoadedMetadata 接管，不再调 fetchList(1)，
  setConversationList 只服务初始化场景，覆盖语义更清晰
- 删除 bug2 时加的 preserves previously loaded pages 测试（与新设计冲突）
- 新增 updateConversationsMetadata 行为测试覆盖：listIds/pagination 不动 + 不存在 ID 忽略
- chat.ts 新增 getConversationsMetadata + searchConversations API 调用

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 前端 hook — refreshLoadedMetadata + searchConversations

**Files:**
- Modify: `fusion-ui/src/hooks/useConversationList.ts`

- [ ] **Step 7.1: 改 imports + dispatch 新 actions**

定位：`src/hooks/useConversationList.ts` 顶部 imports：

```typescript
import { useCallback, useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  appendConversationList,
  setConversationList,
  setListError,
  setLoadingList,
  setLoadingMore,
  updateConversationsMetadata,  // 新增
  setSearchLoading,             // 新增
  setSearchResults,             // 新增
  setSearchError,               // 新增
  clearSearch,                  // 新增
} from '@/redux/slices/conversationSlice';
import {
  getConversations,
  getConversationsMetadata,  // 新增
  searchConversations as searchConversationsApi,  // 新增（避免与 hook 内函数同名）
} from '@/lib/api/chat';
```

- [ ] **Step 7.2: 新增 refreshLoadedMetadata 函数（带 in-flight 锁）**

在 `loadMore` 函数定义之前新增：

```typescript
  // in-flight 锁：同时只允许一个 metadata refresh 请求
  const metadataRefreshInFlightRef = useRef(false);

  const refreshLoadedMetadata = useCallback(async () => {
    if (!isAuthenticated) return;
    if (metadataRefreshInFlightRef.current) return;
    if (listIds.length === 0) return;

    metadataRefreshInFlightRef.current = true;
    try {
      const items = await getConversationsMetadata(listIds);
      // 把后端返回的 items 转换成 reducer 期望的形状（updated_at 用 parseTimestamp 处理）
      dispatch(
        updateConversationsMetadata(
          items.map((item) => ({
            id: item.id,
            title: item.title || '新对话',
            model_id: item.model_id || 'unknown',
            updated_at: parseTimestamp(item.updated_at),
          }))
        )
      );
    } catch (error) {
      // 失败 silent ignore：标题刷新不是关键路径，不能因此破坏列表
      console.warn('刷新对话元数据失败', error);
    } finally {
      metadataRefreshInFlightRef.current = false;
    }
  }, [dispatch, isAuthenticated, listIds]);
```

- [ ] **Step 7.3: 改 conversationListVersion 监听 effect — 调 refreshLoadedMetadata 而非 fetchList**

定位：现有的 useEffect：

```typescript
  useEffect(() => {
    if (!isAuthenticated || conversationListVersion === 0) return;
    void fetchList(1, 10);  // <-- 改这行
  }, [conversationListVersion]);
```

改为：

```typescript
  useEffect(() => {
    if (!isAuthenticated || conversationListVersion === 0) return;
    void refreshLoadedMetadata();
  }, [conversationListVersion]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 7.4: 新增 searchConversations + cancelSearch（带 AbortController）**

在 `refreshLoadedMetadata` 之后新增：

```typescript
  // 当前进行中的搜索请求 controller，用于取消旧请求
  const searchAbortRef = useRef<AbortController | null>(null);

  const searchConversations = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      // 空 query：清空 search state，回到正常列表显示
      if (!trimmed) {
        if (searchAbortRef.current) {
          searchAbortRef.current.abort();
          searchAbortRef.current = null;
        }
        dispatch(clearSearch());
        return;
      }

      // 取消上一次未完成的搜索
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      const controller = new AbortController();
      searchAbortRef.current = controller;

      dispatch(setSearchLoading(true));
      try {
        const items = await searchConversationsApi(trimmed, 50, controller.signal);
        // 如果当前 controller 已被取消，结果作废
        if (controller.signal.aborted) return;
        const conversations: Conversation[] = items.map((item) => ({
          id: item.id,
          title: item.title || '新对话',
          model_id: item.model_id || 'unknown',
          messages: [],
          createdAt: parseTimestamp(item.created_at),
          updatedAt: parseTimestamp(item.updated_at),
        }));
        dispatch(setSearchResults(conversations));
      } catch (error: any) {
        if (error?.name === 'AbortError') return;  // 被取消的请求不算错误
        const message = error instanceof Error ? error.message : '搜索失败';
        dispatch(setSearchError(message));
      }
    },
    [dispatch]
  );
```

> 如果 Task 5 中 `searchConversations` API 没支持 signal，去掉 `controller.signal` 相关行，仅保留 dispatch 逻辑。

- [ ] **Step 7.5: 在 hook 返回值里 export 新方法**

定位 hook 末尾的 return：

```typescript
  return {
    conversations: listIds.map((id) => byId[id]).filter(Boolean),
    pagination,
    isLoadingList,
    isLoadingMore,
    loadMore,
    refreshLoadedMetadata,         // 新增
    searchConversations,           // 新增
    searchResults: useAppSelector((state) => state.conversation.searchResults),
    isSearching: useAppSelector((state) => state.conversation.isSearching),
    searchError: useAppSelector((state) => state.conversation.searchError),
  };
```

> ❌ 上面写法错误：useSelector 不能在普通函数返回对象时调用。改成在 hook 顶部用 selector 提前取：

定位 hook 顶部的 useAppSelector 调用，改为：

```typescript
  const {
    byId,
    conversationListVersion,
    isLoadingList,
    isLoadingMore,
    listIds,
    pagination,
    searchResults,    // 新增
    isSearching,      // 新增
    searchError,      // 新增
  } = useAppSelector((state) => state.conversation);
```

然后 return：

```typescript
  return {
    conversations: listIds.map((id) => byId[id]).filter(Boolean),
    pagination,
    isLoadingList,
    isLoadingMore,
    loadMore,
    refreshLoadedMetadata,
    searchConversations,
    searchResults,
    isSearching,
    searchError,
  };
```

- [ ] **Step 7.6: build 确保 type 通过**

```bash
npm run build 2>&1 | tail -5
```

Expected: build success。

- [ ] **Step 7.7: Commit**

```bash
git add src/hooks/useConversationList.ts
git commit -m "$(cat <<'EOF'
feat(hook): useConversationList 用 metadata 接口替代 fetchList(1) 做刷新

- 新增 refreshLoadedMetadata：按当前 listIds 调 metadata 接口，
  仅 dispatch updateConversationsMetadata 更新 byId，不动 listIds/pagination
- conversationListVersion 监听 effect 改调 refreshLoadedMetadata（之前是 fetchList(1,10)
  导致列表收起 + 闪烁的根因）
- 新增 searchConversations：debounce 由调用方处理；内部 AbortController 取消旧请求；
  空 query → clearSearch 回到正常列表
- in-flight 锁防 metadata refresh 并发；空 listIds 跳过；失败 silent 不破坏列表
- hook 暴露 searchResults/isSearching/searchError 供 UI 渲染

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 前端 ChatList —  在列表底部加 sentinel slot

**Files:**
- Modify: `fusion-ui/src/components/chat/sidebar/ChatList.tsx`

- [ ] **Step 8.1: 在 ChatListProps 加 sentinelRef 可选 prop**

```typescript
interface ChatListProps {
  // ... 已有字段 ...
  sentinelRef?: React.RefObject<HTMLDivElement | null>;
}
```

并在解构里加上 `sentinelRef`：

```typescript
const ChatList: React.FC<ChatListProps> = ({
  // ... 已有 props ...
  sentinelRef,
}) => {
```

- [ ] **Step 8.2: 在 ChatList JSX 末尾的 isLoadingMore 条件块下加 sentinel**

定位：`src/components/chat/sidebar/ChatList.tsx` 现有的 `{isLoadingMore && <div>加载更多...</div>}` 之后插入：

```tsx
      {sentinelRef && (
        <div ref={sentinelRef} className="h-4" aria-hidden="true" />
      )}
```

- [ ] **Step 8.3: build 确保 type 通过**

```bash
npm run build 2>&1 | tail -5
```

Expected: build success（ChatSidebar 还没传 sentinelRef 也没问题，因为 prop 是可选的）。

- [ ] **Step 8.4: 此 commit 跟 Task 9 一起提交**（不单独 commit，避免半途无效状态）

---

## Task 9: 前端 ChatSidebar — IntersectionObserver + sentinel + 搜索后端化

**Files:**
- Modify: `fusion-ui/src/components/chat/ChatSidebar.tsx`

- [ ] **Step 9.1: 解构 hook 新返回值**

定位：第 28 行 `const { conversations, isLoadingList, isLoadingMore, loadMore, pagination } = useConversationList();`，改为：

```typescript
  const {
    conversations,
    isLoadingList,
    isLoadingMore,
    loadMore,
    pagination,
    refreshLoadedMetadata,
    searchConversations,
    searchResults,
    isSearching,
    searchError,
  } = useConversationList();
```

> 注意：`refreshLoadedMetadata` 在这个组件里**不直接调用**（监听由 hook 内部的 useEffect 完成），导出仅为 future use。可不解构，按需保留。如果不用就移除它，避免 unused 警告。

- [ ] **Step 9.2: 删除 showLoadMoreButton + checkScrollbar + ResizeObserver 相关代码**

定位：第 58 行附近开始的：

```typescript
const [showLoadMoreButton, setShowLoadMoreButton] = useState(false);
// ...
const checkScrollbar = useCallback(() => { ... }, [isLoadingMore, pagination?.hasNext]);
useEffect(() => {
  checkScrollbar();
  const resizeObserver = new ResizeObserver(checkScrollbar);
  // ...
}, [checkScrollbar, conversations.length, pagination]);
```

**全部删除**（state、useCallback、useEffect 三块）。

- [ ] **Step 9.3: 新增 sentinel ref + IntersectionObserver effect**

```typescript
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!sentinelRef.current) return;
    if (!pagination?.hasNext) return;  // 没有下一页就不监听
    if (searchQuery.trim()) return;     // 搜索模式下不触发分页加载

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isLoadingMore) {
          void loadMore();
        }
      },
      { rootMargin: '100px' }  // 提前 100px 触发，体感更顺滑
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [pagination?.hasNext, isLoadingMore, loadMore, searchQuery]);
```

- [ ] **Step 9.4: 删除原来的 handleScroll + 外部"显示更多"按钮 JSX**

定位 `handleScroll` 函数定义（第 141-147 行附近），**全部删除**：

```typescript
const handleScroll = () => {
  if (!containerRef.current || isLoadingMore) return;
  const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
  if (scrollTop + clientHeight >= scrollHeight - 5) {
    void loadMore();
  }
};
```

> sentinel + IntersectionObserver 替代了滚动监听。

定位 JSX 中第 215-234 行的 `{showLoadMoreButton && <div ...><Button>...</Button></div>}` 整块删除。

- [ ] **Step 9.5: 给 ChatList 传 sentinelRef + handleScroll 处理**

ChatList 现在不再需要 handleScroll，但 `containerRef` 还是要保留（用于布局）。

定位 `<ChatList ... handleScroll={handleScroll} ... />`，把 `handleScroll={handleScroll}` 改成 `handleScroll={() => {}}`（或在 ChatList props 里把 handleScroll 改为可选并这里删掉传值）。

如果倾向最小改动，在 ChatList 里把 handleScroll 改成可选：
- `handleScroll?: () => void;`
- `<div ... onScroll={handleScroll}>` → `<div ... onScroll={handleScroll}>` (handleScroll 可能 undefined，React 接受 undefined 作为 onScroll)

然后在 ChatSidebar 里完全去掉 handleScroll 传值。

同时给 ChatList 传 sentinelRef：

```tsx
      <ChatList
        chats={...}
        // ... 其他 props ...
        sentinelRef={sentinelRef}
        // 删除 handleScroll prop（或保留为 undefined）
      />
```

- [ ] **Step 9.6: 改造搜索框 — debounce 调后端 API**

定位搜索框 `<input>` 的 `onChange`：

```typescript
onChange={(e) => setSearchQuery(e.target.value)}
```

需要：
1. 维护一个 debounce timer ref
2. setSearchQuery 立刻（UI 响应）
3. 300ms debounce 后调 searchConversations(query)

新增 ref + 改 handler：

```typescript
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      // 立刻清掉空 query 的搜索状态，避免 300ms 之内还显示旧结果
      if (!value.trim()) {
        void searchConversations('');
        return;
      }
      searchDebounceRef.current = setTimeout(() => {
        void searchConversations(value);
      }, 300);
    },
    [searchConversations]
  );

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);
```

input 的 onChange：

```typescript
onChange={(e) => handleSearchChange(e.target.value)}
```

清空按钮（X 按钮）：

```typescript
onClick={() => handleSearchChange('')}
```

ESC 按键：

```typescript
onKeyDown={(e) => {
  if (e.key === 'Escape') {
    handleSearchChange('');
    searchInputRef.current?.blur();
  }
}}
```

- [ ] **Step 9.7: 改 ChatList 传入的 chats — 搜索模式用 searchResults**

定位现有的 `chats={searchQuery.trim() ? filteredConversations : conversations}`，改为：

```typescript
chats={searchQuery.trim() ? (searchResults ?? []) : conversations}
```

并把原来的 `filteredConversations` useMemo（第 121-127 行）**整块删除** —— 不再需要前端 filter。

> 搜索 loading / error 反馈：
>
> 在 `<ChatList>` 上方/下方加一个简短状态行（可选，但建议）：
>
> ```tsx
> {searchQuery.trim() && isSearching && (
>   <div className="px-4 py-2 text-xs text-muted-foreground">搜索中...</div>
> )}
> {searchQuery.trim() && searchError && (
>   <div className="px-4 py-2 text-xs text-danger">搜索失败：{searchError}</div>
> )}
> ```

- [ ] **Step 9.8: 同时给 ChatList 的 sortedAndGroupedChats 传空（搜索模式不分组）**

ChatList 内部已经处理了 `searchQuery ? 扁平 : 分组`，搜索模式分组数据无意义，但 sortedAndGroupedChats 仍按全量 conversations 算（不影响）。无需改 ChatSidebar 这块。

- [ ] **Step 9.9: build + lint**

```bash
npm run build 2>&1 | tail -8
```

Expected: build success。

如果有 unused import / unused var 警告，清理掉（比如已不用的 `useState`、`X` 图标如果是按钮删了的话）。注意 `isSearchFocused` / `searchInputRef` 等仍在用，不要误删。

- [ ] **Step 9.10: 跑完整测试**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: 22 fail（baseline）/ 81 pass，跟 Task 6 后一致。

- [ ] **Step 9.11: Commit ChatList + ChatSidebar 一起**

```bash
git add src/components/chat/sidebar/ChatList.tsx src/components/chat/ChatSidebar.tsx
git commit -m "$(cat <<'EOF'
feat(sidebar): 用 IntersectionObserver + sentinel 取代按钮+ResizeObserver；搜索改后端

ChatSidebar 重构：
- 删除 showLoadMoreButton state / checkScrollbar / ResizeObserver / 外部"显示更多"按钮
  这套设计在按钮显示与否影响容器高度时形成死循环，导致闪烁
- 新增 sentinelRef + IntersectionObserver：sentinel 进入视口（提前 100px）触发 loadMore
  无按钮模式下没有"显示/隐藏切换"，根本上没有循环源
- 删除 handleScroll，loadMore 完全由 sentinel 驱动
- 搜索框 onChange debounce 300ms 调 useConversationList.searchConversations
  替代之前在已加载部分的本地 filter，可搜全部对话
- 删除 filteredConversations useMemo（不再前端过滤）
- 加搜索 loading / error 简短状态行

ChatList 新增可选 sentinelRef prop，传入时在列表底部渲染 sentinel div。

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: 验证 + push + 部署观察

- [ ] **Step 10.1: push 前端 feat 分支触发 dev:3005 preview**

```bash
cd /Users/sean/code/fusion/fusion-ui
git push -u origin feat/sidebar-load-refactor
```

- [ ] **Step 10.2: 监控 fusion-ui 部署**

```bash
gh run list --branch feat/sidebar-load-refactor --limit 1
# 拿到 run id 后：
gh run watch <run-id> --exit-status
```

- [ ] **Step 10.3: 部署完成后人工验证 5 个回归场景（在 dev:3005 进行）**

| 场景 | 期望 |
|---|---|
| 1. 刷新页面 | 列表正常加载 10 条，**不闪烁** |
| 2. 滚到列表底部 | sentinel 进视口，自动加载第 2 页（无按钮） |
| 3. 进入对话 → 发消息 → 回复结束 | 列表**保持完整**（不缩回 10 条），标题更新（如果是新对话第一轮自动生成） |
| 4. 重命名某个对话 | 该对话标题立即更新，列表条数不变 |
| 5. 搜索框输 "Python" | 300ms 后显示后端返回的全量匹配结果（包含未加载的对话） |
| 6. 搜索框清空 | 列表恢复到正常分组显示 |
| 7. 多次"加载更多"加载到 30+ 条后再发消息 | 列表保持 30+ 条，不重置 |

每个场景过都打勾。如果某个失败，按 superpowers:systematic-debugging 流程定位再修。

- [ ] **Step 10.4: 后端容器更新到 feat 分支**

如果 fusion-api 没自动部署 feat 分支，ssh dev 手动：

```bash
ssh dev "cd ~/project/fusion && git -C fusion-api fetch && git -C fusion-api checkout feat/sidebar-metadata-search && docker compose restart fusion-api"
```

或者如有专门的 dev 部署 workflow，触发它。

- [ ] **Step 10.5: 全场景通过后双 PR 准备 merge**

如果一切正常：

```bash
# fusion-api 先 merge
cd /Users/sean/code/fusion/fusion-api
git checkout master
git pull origin master
git merge --no-ff feat/sidebar-metadata-search -m "feat: 新增对话元数据/搜索接口"
git push origin master

# 等 fusion-api 部署完成

# fusion-ui 后 merge
cd /Users/sean/code/fusion/fusion-ui
git checkout master
git pull origin master
git merge --no-ff feat/sidebar-load-refactor -m "feat: 侧边栏加载/刷新/搜索机制重构（根因修复 4 个关联 bug）"
git push origin master

# 监控 master 部署
gh run list --branch master --limit 1
```

- [ ] **Step 10.6: 清理 feat 分支**

```bash
# 远程
cd /Users/sean/code/fusion/fusion-ui
git push origin --delete feat/sidebar-load-refactor
git branch -D feat/sidebar-load-refactor

cd /Users/sean/code/fusion/fusion-api
git push origin --delete feat/sidebar-metadata-search
git branch -D feat/sidebar-metadata-search
```

- [ ] **Step 10.7: 更新 followups 文档 — 关闭对应条目**

打开 `fusion-ui/docs/superpowers/plans/2026-05-03-design-system-v2-followups.md`，把 B0（全量搜索 MVP）整段标记为 ✅ 已完成（保留记录）。

---

## 验收标准（生产级别 checklist）

| 维度 | 验收点 | 状态 |
|---|---|---|
| 正确性 | 4 个原始 bug 全部消失（场景 1/3/5 验证） | □ |
| 性能 | metadata 接口响应 < 200ms，search < 300ms | □ |
| 错误处理 | 网络断开时 metadata silent ignore，search 显示 toast | □ |
| 并发安全 | 快速连发 5 条消息，list 不闪烁；快速输入搜索词，无 race | □ |
| 可测试 | 后端 7 个新测试 + 前端 1 个新 reducer 测试，全 pass | □ |
| 兼容性 | dev 在 Chrome/Safari/Firefox 都正常 | □ |
| 回滚 | revert merge commit 即恢复（已验证 master 干净） | □ |

---

## 不做的事（避免范围蔓延）

- ❌ 不改 message 加载/缓存逻辑（与本次重构无关）
- ❌ 不引入 RTK Query 或 SWR（保持现有 hook 模式）
- ❌ 不做消息内容搜索（仅标题搜索）
- ❌ 不加 metric 上报（如需，列入下一轮 followups）
- ❌ 不为 metadata 接口加 ETag/304 缓存（数据量小，列入下一轮 followups）
- ❌ 不重命名 `requestConversationListRefresh`（虽然语义现在准确了，但改名涉及多文件，单独 PR 处理）
