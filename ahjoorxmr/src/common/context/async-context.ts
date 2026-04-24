import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  correlationId: string;
  useReplica?: boolean;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function getCorrelationId(): string | undefined {
  return asyncLocalStorage.getStore()?.correlationId;
}
