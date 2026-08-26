import AppDataSource from '../src/data-source';

async function main() {
  try {
    await AppDataSource.initialize();

    await AppDataSource.query(`
      TRUNCATE TABLE payments, orders RESTART IDENTITY CASCADE;
    `);

    const query = `
      SELECT 'products' AS table_name, count(*)::int AS count FROM products
      UNION ALL SELECT 'growth_parameters', count(*)::int FROM growth_parameters
      UNION ALL SELECT 'growth_stages', count(*)::int FROM growth_stages
      UNION ALL SELECT 'orders', count(*)::int FROM orders
      UNION ALL SELECT 'order_items', count(*)::int FROM order_items
      UNION ALL SELECT 'reviews', count(*)::int FROM reviews;
    `;

    const results = await AppDataSource.query(query);
    console.log('--- ALL TRANSACTIONS AND PRODUCT TABLES WIPED ---');
    console.table(results);

    await AppDataSource.destroy();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
