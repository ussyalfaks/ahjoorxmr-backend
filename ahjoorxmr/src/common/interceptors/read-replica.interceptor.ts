import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { USE_READ_REPLICA_KEY } from '../decorators/read-replica.decorator';
import { asyncLocalStorage } from '../context/async-context';

@Injectable()
export class ReadReplicaInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const useReadReplica = this.reflector.getAllAndOverride<boolean>(
      USE_READ_REPLICA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (useReadReplica) {
      const store = asyncLocalStorage.getStore();
      if (store) {
        store.useReplica = true;
      }
    }

    return next.handle();
  }
}
