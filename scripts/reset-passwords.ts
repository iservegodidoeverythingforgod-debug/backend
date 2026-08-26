import AppDataSource from '../src/data-source';
import * as bcrypt from 'bcryptjs';

async function main() {
  await AppDataSource.initialize();
  const hash = await bcrypt.hash('Password123!', 10);
  await AppDataSource.query(
    `UPDATE users SET password_hash = '${hash}', is_verified = true, is_active = true WHERE email IN ('admin@seedstore.com', 'customer@seedstore.com', 'customer_test@example.com')`
  );
  console.log('✅ Passwords reset successfully to Password123!');
  await AppDataSource.destroy();
}

main().catch(console.error);
