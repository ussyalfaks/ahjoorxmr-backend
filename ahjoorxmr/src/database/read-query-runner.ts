import { Injectable, Inject, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { REPLICA_CONNECTION_NAME } from './database.constants';

@Injectable()
export class ReadQueryRunner {
  private readonly logger = new Logger(ReadQueryRunner.name);

  constructor(
    @Inject(getDataSourceToken('primary')) private primary: DataSource,
    @Inject(getDataSourceToken(REPLICA_CONNECTION_NAME)) private replica: DataSource,
  ) {}

  /**
   * Executes a query, routing SELECT statements to the replica.
   * Falls back to primary if replica fails.
   */
  async query<T>(query: string, parameters?: any[]): Promise<T> {
    const isSelect = query.trim().toUpperCase().startsWith('SELECT');
    const source = isSelect ? this.replica : this.primary;

    try {
      return await source.query(query, parameters);
    } catch (error) {
      if (isSelect) {
        this.logger.warn(`Replica query failed, falling back to primary: ${error.message}`);
        return await this.primary.query(query, parameters);
      }
      throw error;
    }
  }

  /**
   * Returns the appropriate EntityManager based on query type or explicit routing.
   */
  getManager(isReadOnly: boolean = true): EntityManager {
    return isReadOnly ? this.replica.manager : this.primary.manager;
  }
}
