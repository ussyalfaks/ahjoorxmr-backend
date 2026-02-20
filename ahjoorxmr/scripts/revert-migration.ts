import { AppDataSource } from '../typeorm.config';

async function revertMigration() {
  try {
    await AppDataSource.initialize();
    console.log('Reverting last migration...');
    
    await AppDataSource.undoLastMigration();
    console.log('Successfully reverted migration');
    
    await AppDataSource.destroy();
  } catch (error) {
    console.error('Error reverting migration:', error);
    process.exit(1);
  }
}

revertMigration();
