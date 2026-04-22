import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateAuditLogsTable1234567890000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create audit_logs table
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
            isNullable: false,
          },
          {
            name: 'action',
            type: 'varchar',
            isNullable: false,
            comment: 'CREATE, UPDATE, DELETE, READ',
          },
          {
            name: 'resource',
            type: 'varchar',
            isNullable: false,
            comment: 'Resource type (e.g., GROUP, USER, PERMISSION)',
          },
          {
            name: 'resourceId',
            type: 'varchar',
            isNullable: false,
            comment: 'ID of the resource being acted upon',
          },
          {
            name: 'previousValue',
            type: 'jsonb',
            isNullable: true,
            comment: 'Previous state of the resource (before update)',
          },
          {
            name: 'newValue',
            type: 'jsonb',
            isNullable: true,
            comment: 'New state of the resource (after update)',
          },
          {
            name: 'endpoint',
            type: 'varchar',
            isNullable: true,
            comment: 'HTTP endpoint that was called',
          },
          {
            name: 'method',
            type: 'varchar',
            isNullable: true,
            comment: 'HTTP method (GET, POST, PATCH, DELETE, etc.)',
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            isNullable: true,
            comment: 'IP address of the requester',
          },
          {
            name: 'statusCode',
            type: 'int',
            isNullable: false,
            default: 200,
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes for better query performance
    await queryRunner.createIndex(
      'audit_logs',
      new Index({
        name: 'IDX_audit_logs_resource_resourceId',
        columnNames: ['resource', 'resourceId'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new Index({
        name: 'IDX_audit_logs_userId_createdAt',
        columnNames: ['userId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new Index({
        name: 'IDX_audit_logs_action_createdAt',
        columnNames: ['action', 'createdAt'],
      }),
    );

    // Create groups table
    await queryRunner.createTable(
      new Table({
        name: 'groups',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            default: "'active'",
            isNullable: false,
          },
          {
            name: 'permissions',
            type: 'varchar',
            default: "'[]'",
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('groups');
    await queryRunner.dropTable('audit_logs');
  }
}
