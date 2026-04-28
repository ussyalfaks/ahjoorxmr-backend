import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateAnnouncementsTable1748000000000 implements MigrationInterface {
  name = 'CreateAnnouncementsTable1748000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'announcements',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'groupId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'authorId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'body',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'isPinned',
            type: 'boolean',
            default: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp with time zone',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp with time zone',
            default: 'now()',
          },
          {
            name: 'deletedAt',
            type: 'timestamp with time zone',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'announcements',
      new TableIndex({
        name: 'IDX_announcements_groupId_createdAt',
        columnNames: ['groupId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'announcements',
      new TableIndex({
        name: 'IDX_announcements_groupId',
        columnNames: ['groupId'],
      }),
    );

    await queryRunner.createForeignKey(
      'announcements',
      new TableForeignKey({
        columnNames: ['groupId'],
        referencedTableName: 'groups',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('announcements', true);
  }
}
