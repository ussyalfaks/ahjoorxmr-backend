import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateDeadLetterTables1710000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create notifications table
    await queryRunner.createTable(
      new Table({
        name: 'notifications',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'userId',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'type',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'title',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'severity',
            type: 'varchar',
            isNullable: false,
            default: "'info'",
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'read',
            type: 'boolean',
            isNullable: false,
            default: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'readAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'idx_notifications_user_read_created',
        columnNames: ['userId', 'read', 'createdAt'],
      }),
    );

    // Create dead_letters table
    await queryRunner.createTable(
      new Table({
        name: 'dead_letters',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'jobId',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'groupId',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'queueName',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'error',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'payload',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            isNullable: false,
            default: "'PENDING'",
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'resolvedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'resolvedBy',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'resolutionNotes',
            type: 'text',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create indexes for efficient queries
    await queryRunner.createIndex(
      'dead_letters',
      new TableIndex({
        name: 'idx_dead_letters_group_created',
        columnNames: ['groupId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'dead_letters',
      new TableIndex({
        name: 'idx_dead_letters_status_created',
        columnNames: ['status', 'createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop dead_letters table
    await queryRunner.dropTable('dead_letters', true);

    // Drop notifications table
    await queryRunner.dropTable('notifications', true);
  }
}
