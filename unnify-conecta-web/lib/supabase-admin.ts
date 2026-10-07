// Admin Supabase client for database operations
// This is server-side only, never expose to browser

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase credentials in environment variables');
}

export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Execute SQL query
export async function executeSQL(sql: string) {
  const { data, error } = await supabaseAdmin.rpc('exec_sql', { sql });
  if (error) throw error;
  return data;
}

// Create table
export async function createTable(tableName: string, schema: string) {
  const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (${schema})`;
  return executeSQL(sql);
}

// Drop table
export async function dropTable(tableName: string) {
  return executeSQL(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
}

// Add column
export async function addColumn(tableName: string, columnDef: string) {
  return executeSQL(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${columnDef}`);
}

// Remove column
export async function removeColumn(tableName: string, columnName: string) {
  return executeSQL(`ALTER TABLE ${tableName} DROP COLUMN IF EXISTS ${columnName}`);
}
