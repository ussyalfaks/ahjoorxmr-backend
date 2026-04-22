import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex, TableForeignKey } from 'typeorm';

export class AddKycDocuments1740700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "kyc_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`);

    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'kycStatus',
        type: 'enum',
        enum: ['PENDING', 'APPROVED', 'REJECTED'],
        enumName: 'kyc_status_enum',
        isNullable: true,
        default: null,
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'kyc_documents',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'userId', type: 'uuid' },
          { name: 'storageKey', type: 'varchar', length: '500' },
          { name: 'url', type: 'varchar', length: '500' },
          { name: 'mimeType', type: 'varchar', length: '100' },
          { name: 'fileSize', type: 'int' },
          { name: 'originalName', type: 'varchar', length: '255' },
          { name: 'uploadedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'kyc_documents',
      new TableIndex({ name: 'IDX_kyc_documents_userId', columnNames: ['userId'] }),
    );

    await queryRunner.createForeignKey(
      'kyc_documents',
      new TableForeignKey({
        name: 'FK_kyc_documents_userId',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('kyc_documents');
    await queryRunner.dropColumn('users', 'kycStatus');
    await queryRunner.query(`DROP TYPE IF EXISTS "kyc_status_enum"`);
  }
}
