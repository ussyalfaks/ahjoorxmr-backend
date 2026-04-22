import { MigrationInterface, QueryRunner, Table, TableUnique, TableIndex } from 'typeorm';

export class CreateContributionTable1703688000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'contributions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'groupId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'roundNumber',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'transactionHash',
            type: 'varchar',
            length: '512',
            isNullable: false,
          },
          {
            name: 'amount',
            type: 'numeric',
            precision: 20,
            scale: 8,
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
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Add unique constraint on (groupId, userId, roundNumber)
    await queryRunner.createUnique(
      'contributions',
      new TableUnique({
        columnNames: ['groupId', 'userId', 'roundNumber'],
        name: 'UQ_contributions_group_user_round',
      }),
    );

    // Add composite index for query performance
    await queryRunner.createIndex(
      'contributions',
      new TableIndex({
        columnNames: ['groupId', 'userId', 'roundNumber'],
        name: 'IDX_contributions_group_user_round',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('contributions', 'IDX_contributions_group_user_round');
    await queryRunner.dropUnique('contributions', 'UQ_contributions_group_user_round');
    await queryRunner.dropTable('contributions');
  }
}
