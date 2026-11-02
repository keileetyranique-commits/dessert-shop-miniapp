// Local-only development preview. Services and data remain on the NAS.
// Loopback is a browser secure context; this does not add HTTPS to the LAN hop.
import http from 'node:http';

const target = process.env.FNNAS_HOST ?? '192.168.10.91';
for (const [local, remote] of [
  [15173, 5173],
  [15174, 5174],
]) {
  const server = http.createServer((request, response) => {
    const upstream = http.request(
      {
        hostname: target,
        port: remote,
        method: request.method,
        path: request.url,
        headers: { ...request.headers, host: `${target}:${remote}` },
      },
      (result) => {
        response.writeHead(result.statusCode ?? 502, result.headers);
        result.pipe(response);
      },
    );
    upstream.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(502, {
          'Content-Type': 'text/plain; charset=utf-8',
        });
        response.end('飞牛服务暂时无法连接，请检查网络和容器状态');
      } else response.destroy();
    });
    request.on('aborted', () => upstream.destroy());
    request.pipe(upstream);
  });
  server.on('error', (error) => {
    console.error(`本机预览端口 ${local} 启动失败：${error.code}`);
    process.exit(1);
  });
  server.listen(local, '127.0.0.1', () => {
    console.log(
      `${local === 15173 ? '后台' : 'POS'}：http://127.0.0.1:${local}`,
    );
  });
}
