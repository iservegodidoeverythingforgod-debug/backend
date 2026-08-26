import AppDataSource from '../src/data-source';

async function main() {
  try {
    await AppDataSource.initialize();

    console.log('--- EXECUTING TRUNCATE QUERY ---');
    await AppDataSource.query(`
      TRUNCATE TABLE growth_stages, growth_parameters, order_items, reviews, products
      RESTART IDENTITY CASCADE;
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
    console.log('--- PART 1 STEP 5: COUNT QUERY AFTER TRUNCATE ---');
    console.table(results);

    // Verify categories, users, refresh_tokens were preserved
    const preserved = await AppDataSource.query(`
      SELECT 'categories' AS table_name, count(*)::int AS count FROM categories
      UNION ALL SELECT 'users', count(*)::int FROM users
      UNION ALL SELECT 'refresh_tokens', count(*)::int FROM refresh_tokens;
    `);
    console.log('--- PRESERVED SYSTEM TABLES ---');
    console.table(preserved);

    await AppDataSource.destroy();
  } catch (err) {
    console.error('Error during truncate:', err);
    process.exit(1);
  }
}

main();
