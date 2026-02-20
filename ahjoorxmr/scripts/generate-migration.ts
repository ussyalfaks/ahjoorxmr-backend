import { spawn } from 'child_process';

/**
 * Generate a new migration from entity changes.
 * Usage: npm run migration:generate -- migrations/YourMigrationName
 *
 * This script uses TypeORM CLI directly via npx to generate migrations.
 */
async function generateMigration(): Promise<void> {
  const migrationName = process.argv[2];

  if (!migrationName) {
    console.error('Please provide a migration name');
    console.error(
      'Usage: npm run migration:generate -- migrations/YourMigrationName',
    );
    process.exit(1);
  }

  // Ensure migration name starts with a valid path
  const formattedName = migrationName.startsWith('migrations/')
    ? migrationName
    : `migrations/${migrationName}`;

  console.log(`Generating migration: ${formattedName}`);

  return new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      [
        'typeorm-ts-node-commonjs',
        'migration:generate',
        '-d',
        'typeorm.config.ts',
        formattedName,
      ],
      {
        stdio: 'inherit',
        shell: true,
        cwd: process.cwd(),
      },
    );

    child.on('close', (code) => {
      if (code === 0) {
        console.log('Migration generated successfully');
        resolve();
      } else {
        console.error(`Migration generation failed with code ${code}`);
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      console.error('Error running typeorm CLI:', error);
      reject(error);
    });
  });
}

generateMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
