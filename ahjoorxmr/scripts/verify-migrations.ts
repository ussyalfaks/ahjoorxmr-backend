import { AppDataSource } from '../typeorm.config';

async function verifyMigrations() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    
    console.log('\n✓ Database connection successful');
    console.log(`  Database: ${AppDataSource.options.database}`);
    
    // Check migrations table
    const migrations = await AppDataSource.query(
      'SELECT * FROM migrations ORDER BY timestamp'
    );
    
    console.log('\n✓ Migrations table exists');
    console.log(`  Applied migrations: ${migrations.length}`);
    
    if (migrations.length > 0) {
      console.log('\n  Migration history:');
      migrations.forEach((m: any) => {
        console.log(`    - ${m.name} (${new Date(m.timestamp).toISOString()})`);
      });
    }
    
    // Check tables
    const tables = await AppDataSource.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    
    console.log('\n✓ Database tables:');
    tables.forEach((t: any) => {
      console.log(`    - ${t.name}`);
    });
    
    // Check users table structure
    const usersInfo = await AppDataSource.query('PRAGMA table_info(users)');
    console.log('\n✓ Users table structure:');
    usersInfo.forEach((col: any) => {
      console.log(`    - ${col.name} (${col.type})`);
    });
    
    // Check groups table structure
    const groupsInfo = await AppDataSource.query('PRAGMA table_info(groups)');
    console.log('\n✓ Groups table structure:');
    groupsInfo.forEach((col: any) => {
      console.log(`    - ${col.name} (${col.type})`);
    });
    
    // Check memberships table structure
    const membershipsInfo = await AppDataSource.query('PRAGMA table_info(memberships)');
    console.log('\n✓ Memberships table structure:');
    membershipsInfo.forEach((col: any) => {
      console.log(`    - ${col.name} (${col.type})`);
    });
    
    // Check indexes
    const indexes = await AppDataSource.query(
      "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
    );
    console.log('\n✓ Database indexes:');
    indexes.forEach((idx: any) => {
      console.log(`    - ${idx.name}`);
    });
    
    console.log('\n✅ All migration checks passed!\n');
    
    await AppDataSource.destroy();
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  }
}

verifyMigrations();
