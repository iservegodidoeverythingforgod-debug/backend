import AppDataSource from '../src/data-source';

async function main() {
  await AppDataSource.initialize();
  const counts = await AppDataSource.query(`
    SELECT 'products' AS table_name, count(*)::int AS count FROM products
    UNION ALL SELECT 'growth_parameters', count(*)::int FROM growth_parameters
    UNION ALL SELECT 'growth_stages', count(*)::int FROM growth_stages
    UNION ALL SELECT 'orders', count(*)::int FROM orders
    UNION ALL SELECT 'order_items', count(*)::int FROM order_items
    UNION ALL SELECT 'reviews', count(*)::int FROM reviews;
  `);

  console.log('--- FINAL DATABASE COUNTS ---');
  console.table(counts);
  await AppDataSource.destroy();
}

main();
