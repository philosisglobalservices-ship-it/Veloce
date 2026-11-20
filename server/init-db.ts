import 'dotenv/config';
import { getDatabaseSchemaSummary, initializeDatabase } from './db.ts';

initializeDatabase();
const summary = getDatabaseSchemaSummary();

console.log('Database initialized:', summary.dbPath);
console.log('Integrity check:', summary.integrityOk ? 'OK' : 'FAILED');
console.log('Foreign key violations:', summary.foreignKeyViolations);
console.log('Tables:');
for (const table of summary.tables) {
  console.log(`  - ${table.name} (${table.rows} rows)`);
}
console.log(`Indexes (${summary.indexes.length}):`);
for (const idx of summary.indexes) {
  console.log(`  - ${idx.name} ON ${idx.tableName}`);
}

if (!summary.integrityOk || summary.foreignKeyViolations > 0) {
  process.exit(1);
}
