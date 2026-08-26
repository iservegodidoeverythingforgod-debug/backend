import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  User,
  RefreshToken,
  Category,
  Product,
  Order,
  OrderItem,
  Payment,
  Review,
  ChatConversation,
  ChatMessage,
  StoreSetting,
} from './database/entities';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
const isSupabaseOrRemote =
  databaseUrl.includes('supabase') ||
  databaseUrl.includes('render') ||
  databaseUrl.includes('sslmode=require');

const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [
    User,
    RefreshToken,
    Category,
    Product,
    Order,
    OrderItem,
    Payment,
    Review,
    ChatConversation,
    ChatMessage,
    StoreSetting,
  ],
  migrations: [path.join(__dirname, 'database/migrations/*{.ts,.js}')],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  ssl: isSupabaseOrRemote ? { rejectUnauthorized: false } : false,
});

export default AppDataSource;
