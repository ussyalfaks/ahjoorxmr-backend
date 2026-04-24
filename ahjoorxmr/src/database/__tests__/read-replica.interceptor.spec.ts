import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ReadReplicaInterceptor } from '../../common/interceptors/read-replica.interceptor';
import { asyncLocalStorage } from '../../common/context/async-context';
import { of } from 'rxjs';

describe('ReadReplicaInterceptor', () => {
  let interceptor: ReadReplicaInterceptor;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadReplicaInterceptor,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    interceptor = module.get<ReadReplicaInterceptor>(ReadReplicaInterceptor);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should set useReplica to true when decorator is present', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    const next: any = {
      handle: () => of(null),
    };

    await asyncLocalStorage.run({ correlationId: 'test' }, async () => {
      await interceptor.intercept(context, next).toPromise();
      const store = asyncLocalStorage.getStore();
      expect(store?.useReplica).toBe(true);
    });
  });

  it('should not set useReplica when decorator is absent', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    const next: any = {
      handle: () => of(null),
    };

    await asyncLocalStorage.run({ correlationId: 'test' }, async () => {
      await interceptor.intercept(context, next).toPromise();
      const store = asyncLocalStorage.getStore();
      expect(store?.useReplica).toBeUndefined();
    });
  });
});
