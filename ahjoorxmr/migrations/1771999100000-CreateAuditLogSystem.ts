import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateAuditLogSystem1771999100000 implements MigrationInterface {
  name = 'CreateAuditLogSystem1771999100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'audit_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'action',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'resource',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'timestamp',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'userAgent',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'requestPayload',
            type: 'jsonb',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create indexes for better query performance
    await queryRunner.createIndex(
      'audit_logs',
      new Index({
        name: 'IDX_AUDIT_LOGS_USER_ID',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new Index({
        name: 'IDX_AUDIT_LOGS_ACTION',
        columnNames: ['action'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new Index({
        name: 'IDX_AUDIT_LOGS_RESOURCE',
        columnNames: ['resource'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new Index({
        name: 'IDX_AUDIT_LOGS_TIMESTAMP',
        columnNames: ['timestamp'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('audit_logs', 'IDX_AUDIT_LOGS_TIMESTAMP');
    await queryRunner.dropIndex('audit_logs', 'IDX_AUDIT_LOGS_RESOURCE');
    await queryRunner.dropIndex('audit_logs', 'IDX_AUDIT_LOGS_ACTION');
    await queryRunner.dropIndex('audit_logs', 'IDX_AUDIT_LOGS_USER_ID');
    await queryRunner.dropTable('audit_logs');
  }
}
