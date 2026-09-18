import {
  Catch,
  type ExceptionFilter,
  type ArgumentsHost,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
@Catch(Prisma.PrismaClientKnownRequestError)
export class DbErrorFilter implements ExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const status =
      error.code === 'P2025'
        ? 404
        : ['P2002', 'P2034'].includes(error.code)
          ? 409
          : 400;
    host
      .switchToHttp()
      .getResponse()
      .status(status)
      .json({
        statusCode: status,
        message:
          status === 404
            ? '资源不存在'
            : status === 409
              ? '数据已变化或重复，请刷新后重试'
              : '数据关系或数值不合法',
      });
  }
}
