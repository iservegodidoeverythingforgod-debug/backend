import * as bcrypt from 'bcryptjs';
import AppDataSource from '../src/data-source';

async function main() {
  await AppDataSource.initialize();
  const hash = await bcrypt.hash('AdminPassword123!', 10);
  await AppDataSource.query('UPDATE users SET password_hash = $1 WHERE email = $2', [
    hash,
    'admin@seedstore.com',
  ]);
  console.log('✓ Admin password set to AdminPassword123!');
  await AppDataSource.destroy();
}

main();
