import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { asyncLocalStorage } from '../../common/context/async-context';
import { DatabaseRoutingModule } from '../database-routing.module';
import { REPLICA_CONNECTION_NAME } from '../database.constants';

describe('ReadReplica Routing', () => {
  let primaryDataSource: any;
  let replicaDataSource: any;
  let routingDataSource: DataSource;

  beforeEach(async () => {
    primaryDataSource = {
      name: 'primary',
      manager: { name: 'primary-manager' },
      query: jest.fn().mockResolvedValue('primary-result'),
    };
    replicaDataSource = {
      name: 'replica',
      manager: { name: 'replica-manager' },
      query: jest.fn().mockResolvedValue('replica-result'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: getDataSourceToken('primary'),
          useValue: primaryDataSource,
        },
        {
          provide: getDataSourceToken(REPLICA_CONNECTION_NAME),
          useValue: replicaDataSource,
        },
        {
          provide: getDataSourceToken(),
          useFactory: (primary: DataSource, replica: DataSource) => {
            return new Proxy(primary, {
              get(target, prop, receiver) {
                const store = asyncLocalStorage.getStore();
                const useReplica = store?.useReplica;
                const source = useReplica ? replica : primary;
                
                if (prop === 'manager') return source.manager;

                const value = Reflect.get(source, prop);
                if (typeof value === 'function') {
                  return (...args: any[]) => {
                    const result = value.apply(source, args);
                    if (result && typeof result.then === 'function') {
                      return result.catch((err: any) => {
                        if (useReplica) {
                          const primaryValue = Reflect.get(primary, prop);
                          return primaryValue.apply(primary, args);
                        }
                        throw err;
                      });
                    }
                    return result;
                  };
                }
                return value;
              },
            });
          },
          inject: [getDataSourceToken('primary'), getDataSourceToken(REPLICA_CONNECTION_NAME)]
        }
      ],
    })
    .compile();

    routingDataSource = module.get<DataSource>(getDataSourceToken());
  });

  it('should route to primary by default', async () => {
    await asyncLocalStorage.run({ correlationId: 'test' }, async () => {
      const result = await routingDataSource.query('SELECT 1');
      expect(result).toBe('primary-result');
      expect(primaryDataSource.query).toHaveBeenCalled();
      expect(replicaDataSource.query).not.toHaveBeenCalled();
      expect(routingDataSource.manager.name).toBe('primary-manager');
    });
  });

  it('should route to replica when useReplica is true', async () => {
    await asyncLocalStorage.run({ correlationId: 'test', useReplica: true }, async () => {
      const result = await routingDataSource.query('SELECT 1');
      expect(result).toBe('replica-result');
      expect(replicaDataSource.query).toHaveBeenCalled();
      expect(primaryDataSource.query).not.toHaveBeenCalled();
      expect(routingDataSource.manager.name).toBe('replica-manager');
    });
  });

  it('should fallback to primary when replica fails', async () => {
    replicaDataSource.query.mockRejectedValue(new Error('Replica Down'));
    
    await asyncLocalStorage.run({ correlationId: 'test', useReplica: true }, async () => {
      const result = await routingDataSource.query('SELECT 1');
      expect(result).toBe('primary-result');
      expect(replicaDataSource.query).toHaveBeenCalled();
      expect(primaryDataSource.query).toHaveBeenCalled();
    });
  });
});
