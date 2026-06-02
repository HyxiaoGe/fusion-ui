// 同源头像代理 URL 改写。
//
// 用户头像由 OAuth provider 返回，多为 https://lh3.googleusercontent.com/... 这类第三方图床；
// 浏览器直连这些图床在国内常很慢甚至被墙——登录数据早已返回，卡住的只是那张 <img>。
// 后端在 /api/auth/avatar 暴露了一个按白名单抓取+缓存的同源代理端点，这里把已知图床的绝对
// https URL 改写成同源相对路径，交给浏览器以强缓存方式加载（CORS 由 Next.js rewrites 解决）。
//
// 仅代理后端白名单内的 host；相对路径 / data: / 未知 host / 非 https 一律原样返回，避免无谓代理。

const PROXIED_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'avatars.githubusercontent.com',
]);

export function proxiedAvatar(rawUrl?: string | null): string | undefined {
  const url = rawUrl?.trim();
  if (!url) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // 相对路径或非法绝对 URL：原样交给 <img>。
    return url;
  }

  if (parsed.protocol === 'https:' && PROXIED_HOSTS.has(parsed.hostname)) {
    return `/api/auth/avatar?url=${encodeURIComponent(url)}`;
  }
  return url;
}
