import {
  type ExceptionFilter,
  Catch,
  type ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "An unexpected error occurred";
    const details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = this.statusToCode(status);

      if (typeof body === "string") {
        message = body;
      } else if (typeof body === "object" && body !== null) {
        const obj = body as Record<string, unknown>;
        message =
          typeof obj.message === "string"
            ? obj.message
            : Array.isArray(obj.message)
              ? obj.message.join("; ")
              : exception.message;
        if (obj.error && typeof obj.error === "string") {
          code = obj.error.toUpperCase().replace(/\s+/g, "_");
        }
      }
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    response.status(status).json({
      error: {
        code,
        message,
        ...(details !== undefined && { details }),
      },
    });
  }

  private statusToCode(status: number): string {
    switch (status) {
      case 400:
        return "VALIDATION_ERROR";
      case 401:
        return "UNAUTHORIZED";
      case 403:
        return "FORBIDDEN";
      case 404:
        return "NOT_FOUND";
      case 409:
        return "CONFLICT";
      case 422:
        return "UNPROCESSABLE_ENTITY";
      case 429:
        return "RATE_LIMITED";
      default:
        return "INTERNAL_ERROR";
    }
  }
}
