import { WinstonLogger } from './winston.logger';
import { asyncLocalStorage } from '../context/async-context';
import { trace, Span, SpanContext } from '@opentelemetry/api';

jest.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: jest.fn(),
  },
}));

describe('WinstonLogger', () => {
  let logger: WinstonLogger;

  beforeEach(() => {
    logger = new WinstonLogger();
    jest.clearAllMocks();
  });

  it('should include correlationId in log entries when available', (done) => {
    const correlationId = 'test-correlation-id';

    asyncLocalStorage.run({ correlationId }, () => {
      const logSpy = jest.spyOn((logger as any).logger, 'info');
      logger.log('Test message', 'TestContext');

      expect(logSpy).toHaveBeenCalled();
      done();
    });
  });

  it('should include traceId and spanId when trace is active', () => {
    const mockSpanContext: SpanContext = {
      traceId: 'test-trace-id',
      spanId: 'test-span-id',
      traceFlags: 1,
    };

    const mockSpan = {
      spanContext: () => mockSpanContext,
    } as Span;

    (trace.getActiveSpan as jest.Mock).mockReturnValue(mockSpan);

    const logSpy = jest.spyOn((logger as any).logger, 'info');
    logger.log('Test message with trace', 'TestContext');

    expect(logSpy).toHaveBeenCalled();
  });

  it('should log without correlationId when not in context', () => {
    const logSpy = jest.spyOn((logger as any).logger, 'info');
    logger.log('Test message', 'TestContext');

    expect(logSpy).toHaveBeenCalledWith('Test message', {
      context: 'TestContext',
    });
  });

  it('should log errors with trace information', () => {
    const errorSpy = jest.spyOn((logger as any).logger, 'error');
    logger.error('Error message', 'stack trace', 'ErrorContext');

    expect(errorSpy).toHaveBeenCalledWith('Error message', {
      trace: 'stack trace',
      context: 'ErrorContext',
    });
  });

  it('should log warnings', () => {
    const warnSpy = jest.spyOn((logger as any).logger, 'warn');
    logger.warn('Warning message', 'WarnContext');

    expect(warnSpy).toHaveBeenCalledWith('Warning message', {
      context: 'WarnContext',
    });
  });

  it('should log debug messages', () => {
    const debugSpy = jest.spyOn((logger as any).logger, 'debug');
    logger.debug('Debug message', 'DebugContext');

    expect(debugSpy).toHaveBeenCalledWith('Debug message', {
      context: 'DebugContext',
    });
  });
});
