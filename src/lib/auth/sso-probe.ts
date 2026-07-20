/**
 * 应用加载时的一次性静默 SSO 探测（P3.3b）。
 *
 * 若本地无 token，顶层跳转到 auth-service 的 /auth/authorize?prompt=none：存在 IdP 会话则
 * 静默签发授权码（无 UI，跨应用免登）；无会话则原样带回 login_required（由回调页软回原页，
 * fusion 是软门禁，未登录也可浏览/由 LoginDialog 兜底）。
 *
 * 关键不变量（与 audio P3.2b 对称）：
 *  - 每标签页默认只探一次；用户真·手动刷新时允许再探一次，以拾取别处刚建立的 IdP 会话。
 *    自动跳转返回那一圈是 navigate，不会触发 reload 放行，故不会重新引入重定向死循环。
 *  - 探测前记下原始路径（RETURN），HIT/MISS 都据此回到用户本来要去的页面。
 *  - 回调换码期间（/auth/callback）绝不探测，避免冲掉正在进行的换码。
 *  - sessionStorage 不可用时直接放弃探测（失败保守，绝不冒死循环风险）。
 *  - 登出调用 markSsoProbed() 落显式登出守卫，刷新也不能绕过，防止登出后被静默重新登入。
 */

import { silentLogin as sdkSilentLogin } from 'auth-client-web';

import { configureAuth } from '@/lib/auth/auth-sdk';

const PROBED_KEY = 'fusion_sso_probed';
const LOGGED_OUT_KEY = 'fusion_sso_logged_out';
const RETURN_KEY = 'fusion_sso_return';
const ACCESS_TOKEN_KEY = 'auth_token';
const CALLBACK_PATH = '/auth/callback';

function isReload(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === 'reload';
  } catch {
    return false;
  }
}

/**
 * 仅接受「单个前导斜杠的同源相对路径」，拒绝协议相对(//host)与反斜杠(/\host)等开放重定向向量。
 * 浏览器不会折叠路径里的前导双斜杠：访问 https://app//evil.com 时 location.pathname 即 "//evil.com"，
 * 若不校验直接喂给 router.replace，会被解析成站外 origin 并硬跳转（开放重定向）。
 * 先把反斜杠归一成正斜杠（部分浏览器把 /\ 当 //），再要求恰好一个前导斜杠。
 */
export function isSafeReturnPath(path: string): boolean {
  return /^\/(?!\/)/.test(path.replace(/\\/g, '/'));
}

function session(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** 落「已登出/勿自动重登」守卫——登出时调用以阻止登出后被静默重新登入。 */
export function markSsoProbed(): void {
  try {
    const s = session();
    s?.setItem(PROBED_KEY, '1');
    s?.setItem(LOGGED_OUT_KEY, '1');
  } catch {
    // ignore
  }
}

/**
 * 探测前记下的原始路径是否还在（peek，不消费）。
 *
 * 回调页据此区分落到 /auth/callback 的来源：有 RETURN ⇒ 静默探测中转（用户没主动登录）⇒
 * 渲染中性态，不显示「正在完成授权」误导文案；无 RETURN ⇒ 用户主动发起的交互式登录。
 * 消费仍由 takeSsoReturnPath 负责（本函数只读不删）。
 */
export function hasPendingSsoReturn(): boolean {
  try {
    return session()?.getItem(RETURN_KEY) != null;
  } catch {
    return false;
  }
}

/** 读取并清除探测前记下的原始路径（HIT/MISS 均据此回到原页）。 */
export function takeSsoReturnPath(): string | null {
  const s = session();
  if (!s) return null;
  try {
    const v = s.getItem(RETURN_KEY);
    if (v) s.removeItem(RETURN_KEY);
    return v;
  } catch {
    return null;
  }
}

/**
 * 交互式登录开始时清理旧生命周期守卫：一个被放弃的静默探测会留下 RETURN_KEY，若不清，
 * 后续回调会被带到错误目标；过去的显式登出 LOGGED_OUT_KEY 也必须清除，否则新登录完成后
 * 该标签页仍会永久拒绝自动会话恢复。
 */
export function clearSsoReturn(): void {
  try {
    const s = session();
    s?.removeItem(RETURN_KEY);
    // 用户重新主动登录代表开启了新的认证生命周期；清掉过去显式登出的守卫，避免同一标签页
    // 此后永久无法参与自动会话恢复。
    s?.removeItem(LOGGED_OUT_KEY);
  } catch {
    // ignore
  }
}

/**
 * 未登录标签页能否执行一次无跳转的中央会话恢复探测。
 *
 * 真正的 Cookie 探测、PKCE 换票和 token/user 原子提交由 SDK resumeSession 负责；这里仅保留
 * 回调页、显式登出和本地会话三道宿主边界。sessionStorage 不可用时失败保守。
 */
export function canAutoResumeSession(currentPath: string): boolean {
  if (typeof window === 'undefined') return false;
  if (currentPath.startsWith(CALLBACK_PATH)) return false;
  const s = session();
  if (!s) return false;
  try {
    if (s.getItem(LOGGED_OUT_KEY)) return false;
    return !window.localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return false;
  }
}

/**
 * 满足条件时发起一次静默 SSO 探测；返回 true 表示已发起（页面正在跳走）。
 * 条件：无本地 token、本标签页未探测过、当前不在回调路径、sessionStorage 可用。
 */
export function maybeSilentLogin(currentPath: string): boolean {
  if (typeof window === 'undefined') return false;
  const s = session();
  if (!s) return false; // 无 sessionStorage → 保守放弃，绝不死循环
  if (currentPath.startsWith(CALLBACK_PATH)) return false; // 换码进行中，勿探测

  let loggedOut: string | null;
  let probed: string | null;
  let token: string | null;
  try {
    loggedOut = s.getItem(LOGGED_OUT_KEY);
    probed = s.getItem(PROBED_KEY);
    token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return false;
  }
  if (token) return false; // 已有本地会话
  if (loggedOut) return false; // 显式登出过：绝不自动重登（刷新也不绕过）
  if (probed && !isReload()) return false; // 本标签页已探测过；仅真·手动刷新放行重探

  // 跳转前同步落守卫 + 原始路径（sessionStorage 同步写入，跨这次顶层跳转存活）。
  // 原始路径先过开放重定向校验：不安全（协议相对/反斜杠站外）则回退到首页，绝不把站外目标带回。
  const safeReturn = isSafeReturnPath(currentPath) ? currentPath : '/';
  try {
    s.setItem(PROBED_KEY, '1');
    s.setItem(RETURN_KEY, safeReturn);
  } catch {
    return false;
  }

  configureAuth();
  // fire-and-forget 顶层跳转：附上 catch 吞掉拒绝（如不安全上下文下 crypto.subtle 不可用），
  // 避免未处理的 promise rejection；守卫已落库，反正本标签页不会再探测。
  void sdkSilentLogin().catch(() => {});
  return true;
}
