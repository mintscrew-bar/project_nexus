import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { MulterError } from "multer";

/** multer 에러 코드별 사용자 노출 메시지 */
const MULTER_ERROR_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: "파일 크기가 허용 범위를 초과했습니다. (최대 5MB)",
  LIMIT_FILE_COUNT: "업로드 가능한 파일 개수를 초과했습니다.",
  LIMIT_UNEXPECTED_FILE: "예상하지 않은 파일 필드입니다.",
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isProduction = process.env.NODE_ENV === "production";

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = "서버 내부 오류가 발생했습니다.";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === "string"
          ? exceptionResponse
          : exceptionResponse;
    } else if (exception instanceof MulterError) {
      // multer는 HttpException이 아닌 MulterError를 던지므로 그대로 두면 500이 된다.
      // 파일 크기 초과 등은 모두 클라이언트 입력 문제이므로 400으로 매핑한다.
      status = HttpStatus.BAD_REQUEST;
      message =
        MULTER_ERROR_MESSAGES[exception.code] ??
        "파일 업로드 요청이 올바르지 않습니다.";
    } else {
      this.logger.error(
        `Unhandled exception: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const errorResponse: Record<string, unknown> = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(typeof message === "string" ? { message } : message),
    };

    if (!isProduction && exception instanceof Error) {
      errorResponse.stack = exception.stack;
    }

    response.status(status).json(errorResponse);
  }
}
