import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { Request, Response } from 'express';
import { asyncLocalStorage } from '../context/async-context';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      setHeader: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  it('should generate a correlation ID when not provided', () => {
    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction,
    );

    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-Correlation-Id',
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    );
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should use existing correlation ID from header', () => {
    const existingId = '12345678-1234-4234-8234-123456789012';
    mockRequest.headers = { 'x-correlation-id': existingId };

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction,
    );

    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-Correlation-Id',
      existingId,
    );
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should store correlation ID in AsyncLocalStorage', (done) => {
    middleware.use(mockRequest as Request, mockResponse as Response, () => {
      const store = asyncLocalStorage.getStore();
      expect(store).toBeDefined();
      expect(store?.correlationId).toBeDefined();
      done();
    });
  });
});
