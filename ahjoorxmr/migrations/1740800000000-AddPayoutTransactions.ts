import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddPayoutTransactions1740800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "payout_transaction_status_enum" AS ENUM ('PENDING_SUBMISSION', 'SUBMITTED', 'CONFIRMED', 'FAILED')`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'payout_transactions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'payoutOrderId',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING_SUBMISSION', 'SUBMITTED', 'CONFIRMED', 'FAILED'],
            enumName: 'payout_transaction_status_enum',
            default: `'PENDING_SUBMISSION'`,
          },
          {
            name: 'txHash',
            type: 'varchar',
            length: '255',
            isNullable: true,
            default: null,
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

    await queryRunner.createIndex(
      'payout_transactions',
      new TableIndex({
        name: 'IDX_payout_transactions_payoutOrderId',
        columnNames: ['payoutOrderId'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'payout_transactions',
      new TableIndex({
        name: 'IDX_payout_transactions_status',
        columnNames: ['status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('payout_transactions');
    await queryRunner.query(
      `DROP TYPE IF EXISTS "payout_transaction_status_enum"`,
    );
  }
}
