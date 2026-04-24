import { Module, Global, DataSource, EntityManager } from '@nestjs/common';
import { getConnectionToken, getEntityManagerToken, getDataSourceToken } from '@nestjs/typeorm';
import { asyncLocalStorage } from '../common/context/async-context';
import { REPLICA_CONNECTION_NAME } from './database.constants';

@Global()
@Module({
  providers: [
    {
      provide: getDataSourceToken(),
      useFactory: (primary: DataSource, replica: DataSource) => {
        return new Proxy(primary, {
          get(target, prop, receiver) {
            const store = asyncLocalStorage.getStore();
            const useReplica = store?.useReplica;
            const source = useReplica ? replica : primary;
            
            if (prop === 'manager') {
                return source.manager;
            }

            const value = Reflect.get(source, prop, receiver);
            if (typeof value === 'function') {
                return (...args: any[]) => {
                    const result = value.apply(source, args);
                    
                    // Handle Promise rejections for fallback
                    if (result && typeof result.then === 'function') {
                        return result.catch((err: any) => {
                            if (useReplica) {
                                const primaryValue = Reflect.get(primary, prop, receiver);
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
      inject: [
        getDataSourceToken('primary'),
        getDataSourceToken(REPLICA_CONNECTION_NAME),
      ],
    },
    {
      provide: getEntityManagerToken(),
      useFactory: (primary: DataSource, replica: DataSource) => {
        return new Proxy(primary.manager, {
          get(target, prop, receiver) {
            const store = asyncLocalStorage.getStore();
            const useReplica = store?.useReplica;
            const manager = useReplica ? replica.manager : primary.manager;
            
            const value = Reflect.get(manager, prop, receiver);
            if (typeof value === 'function') {
                return (...args: any[]) => {
                    const result = value.apply(manager, args);
                    
                    if (result && typeof result.then === 'function') {
                        return result.catch((err: any) => {
                            if (useReplica) {
                                const primaryValue = Reflect.get(primary.manager, prop, receiver);
                                return primaryValue.apply(primary.manager, args);
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
      inject: [
        getDataSourceToken('primary'),
        getDataSourceToken(REPLICA_CONNECTION_NAME),
      ],
    },
  ],
  exports: [getDataSourceToken(), getEntityManagerToken()],
})
export class DatabaseRoutingModule {}
