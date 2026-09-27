import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
const file = new URL('./.env', import.meta.url);
if (!existsSync(file)) {
  const secret = () => randomBytes(24).toString('hex');
  writeFileSync(
    file,
    `BASELINE_PORT=18080\nBASELINE_ADMIN_USER=baseline-admin\nBASELINE_ADMIN_PASSWORD=${secret()}\nMYSQL_PASSWORD=${secret()}\nMYSQL_ROOT_PASSWORD=${secret()}\n`,
    { mode: 0o600 },
  );
}
console.log(
  '独立环境配置已准备好。登录账号和密码见 deploy/litemall/.env（请勿提交或分享）。',
);
