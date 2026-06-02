import { describe, expect, it } from 'vitest';

import { proxiedAvatar } from './avatar';

// 头像 <img> 走同源代理（/api/auth/avatar），把"国内直连 Google/GitHub 图床慢/被墙"
// 收敛到后端一次抓取 + 浏览器强缓存。这里只校验 URL 改写策略，不碰网络。
describe('proxiedAvatar: 同源头像代理 URL 改写', () => {
  it('把 Google 图床绝对 https URL 改写成同源代理路径', () => {
    const raw = 'https://lh3.googleusercontent.com/a/ACg8ocK=s96-c';
    expect(proxiedAvatar(raw)).toBe(`/api/auth/avatar?url=${encodeURIComponent(raw)}`);
  });

  it('把 GitHub 图床绝对 https URL 改写成同源代理路径', () => {
    const raw = 'https://avatars.githubusercontent.com/u/12345?v=4';
    expect(proxiedAvatar(raw)).toBe(`/api/auth/avatar?url=${encodeURIComponent(raw)}`);
  });

  it('对未在白名单内的 host 原样返回（交给 <img> 直连）', () => {
    const raw = 'https://cdn.example.com/a.png';
    expect(proxiedAvatar(raw)).toBe(raw);
  });

  it('对相对路径原样返回（不误代理本地资源）', () => {
    expect(proxiedAvatar('/avatars/me.png')).toBe('/avatars/me.png');
  });

  it('对 data: URL 原样返回', () => {
    const raw = 'data:image/png;base64,iVBORw0KGgo=';
    expect(proxiedAvatar(raw)).toBe(raw);
  });

  it('对 http（非 https）白名单 host 不代理，原样返回', () => {
    // 后端只代理 https，前端这里保持一致，避免无谓代理一个注定 400 的 URL。
    const raw = 'http://lh3.googleusercontent.com/a/x';
    expect(proxiedAvatar(raw)).toBe(raw);
  });

  it('空串 / undefined / null 返回 undefined', () => {
    expect(proxiedAvatar('')).toBeUndefined();
    expect(proxiedAvatar('   ')).toBeUndefined();
    expect(proxiedAvatar(undefined)).toBeUndefined();
    expect(proxiedAvatar(null)).toBeUndefined();
  });
});
