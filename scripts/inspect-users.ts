import * as bcrypt from 'bcryptjs';
import AppDataSource from '../src/data-source';

async function main() {
  await AppDataSource.initialize();
  const users = await AppDataSource.query('SELECT id, email, role, password_hash FROM users WHERE email IN ($1, $2)', [
    'admin@seedstore.com',
    'customer@seedstore.com',
  ]);

  console.log('--- USERS IN DB ---');
  for (const u of users) {
    const matchAdmin1 = await bcrypt.compare('Admin@123456', u.password_hash);
    const matchAdmin2 = await bcrypt.compare('AdminPassword123!', u.password_hash);
    const matchCustomer = await bcrypt.compare('User@123456', u.password_hash);
    console.log(`User: ${u.email} (${u.role})`);
    console.log(`  - matches 'Admin@123456': ${matchAdmin1}`);
    console.log(`  - matches 'AdminPassword123!': ${matchAdmin2}`);
    console.log(`  - matches 'User@123456': ${matchCustomer}`);
  }

  // Update both demo accounts to match standard passwords
  const adminHash = await bcrypt.hash('Admin@123456', 10);
  const customerHash = await bcrypt.hash('User@123456', 10);

  await AppDataSource.query('UPDATE users SET password_hash = $1 WHERE email = $2', [adminHash, 'admin@seedstore.com']);
  await AppDataSource.query('UPDATE users SET password_hash = $1 WHERE email = $2', [customerHash, 'customer@seedstore.com']);

  console.log('✓ Successfully synced demo passwords:');
  console.log('  admin@seedstore.com -> Admin@123456');
  console.log('  customer@seedstore.com -> User@123456');

  await AppDataSource.destroy();
}

main();
