export function publicConfig(env) {
  const apiBase = env.MINIAPP_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';
  const url = new URL(apiBase);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid public API endpoint');
  if (
    (env.APP_ENV === 'production' || env.NODE_ENV === 'production') &&
    (url.protocol !== 'https:' || !env.WECHAT_APP_ID)
  )
    throw new Error('Production miniapp requires HTTPS and WECHAT_APP_ID');
  return { apiBase, appid: env.WECHAT_APP_ID || 'touristappid' };
}
