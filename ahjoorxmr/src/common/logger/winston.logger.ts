import { Injectable, LoggerService } from '@nestjs/common';
import * as winston from 'winston';
import { trace } from '@opentelemetry/api';
import { getCorrelationId } from '../context/async-context';
import { deepScrubForLog } from '../pii/pii-scrubber';

@Injectable()
export class WinstonLogger implements LoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format((info) => {
          const correlationId = getCorrelationId();
          if (correlationId) {
            info.correlationId = correlationId;
          }

          const span = trace.getActiveSpan();
          if (span) {
            const spanContext = span.spanContext();
            info.traceId = spanContext.traceId;
            info.spanId = spanContext.spanId;
          }

          const scrubbed = deepScrubForLog(info) as winston.Logform.TransformableInfo;
          Object.assign(info, scrubbed);

          return info;
        })(),
        winston.format.json(),
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
      ],
    });

    // Add file transport in production
    if (process.env.NODE_ENV === 'production') {
      this.logger.add(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
        }),
      );
      this.logger.add(
        new winston.transports.File({
          filename: 'logs/combined.log',
        }),
      );
    }
  }

  log(message: string, context?: string) {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string) {
    this.logger.verbose(message, { context });
  }
}
