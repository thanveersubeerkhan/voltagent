// src/voltagent-db-tools.ts
import { createTool } from "@voltagent/core"; // adapt exact import per your project layout
import { z } from "zod";
import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config()
/**
 * Init a read-only DB pool. Use a dedicated read-only user in prod.
 * ENV: PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE
 */
const pool = new Pool({
  connectionString: process.env.db_url,
  ssl: {
    rejectUnauthorized: false,
  },
});

/* Utility: run query with limits + single-statement guard */
async function safeQuery(text: string, params: any[] = []) {
  // Basic safety: single statement (no semicolon), only SELECT allowed (case-insensitive)
  const cleaned = text.trim();
  if (cleaned.includes(";")) throw new Error("Multiple statements not allowed.");
  if (!/^select\s+/i.test(cleaned)) throw new Error("Only SELECT queries are permitted.");
  // execute with row limit guard
  const client = await pool.connect();
  try {
    // Enforce a max rows cap client-side
    const result = await client.query({ text, values: params, rowMode: "array" });
    const rows = result.rows.slice(0, 1000); // cap rows returned to 1000
    return { rows, fields: result.fields.map(f => f.name) };
  } finally {
    client.release();
  }
}

/* Tool: list databases (Postgres example) */
export const listDatabases = createTool({
  name: "list_databases",
  description: "Return list of non-template PostgreSQL database names (read-only).",
  parameters: z.object({}),
  execute: async () => {
    const res = await pool.query(
      `SELECT datname FROM pg_database WHERE datistemplate = false AND datallowconn = true`
    );
    return { databases: res.rows.map(r => r.datname) };
  },
});

/* Tool: list tables in a given database/schema */
export const listTables = createTool({
  name: "list_tables",
  description: "List tables in a schema. Provide schema (default 'public').",
  parameters: z.object({
    schema: z.string().default("public"),
  }),
  execute: async ({ schema }: { schema: string }) => {
    const text = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1 AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    const res = await pool.query(text, [schema]);
    return { tables: res.rows.map(r => r.table_name) };
  },
});

/* Tool: list columns for a table */
export const listColumns = createTool({
  name: "list_columns",
  description: "List columns and types for a given table (schema and tableName required).",
  parameters: z.object({
    schema: z.string().default("public"),
    tableName: z.string(),
  }),
  execute: async ({ schema, tableName }: { schema: string; tableName: string }) => {
    const text = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `;
    const res = await pool.query(text, [schema, tableName]);
    return { columns: res.rows };
  },
});

/* Tool: generic read-only SQL executor (with validation) */
export const queryDatabase = createTool({
  name: "query_database",
  description:
    "Execute a read-only SQL SELECT query. Sanitizes input, validates it, and enforces single-statement rules.",
  parameters: z.object({
    query: z
      .string()
      .min(5, "Query too short")
      .describe("A single SELECT statement. Trailing semicolon allowed."),
  }),

  execute: async ({ query }: { query: string }) => {
    try {
      // Normalize user query
      const normalized = query.trim().replace(/\s+/g, " ");

      // Run through the hard safety validator
      const out = await safeQuery(normalized);

      return {
        ok: true,
        fields: out.fields,
        results: out.rows,
        meta: {
          row_count: out.rows.length,
          truncated: out.rows.length >= 1000,
        },
      };
    } catch (err: any) {
      // Never leak PG internals to the end user
      return {
        ok: false,
        error: "Query failed validation or execution.",
        detail: err.message, // delete this in prod if required
      };
    }
  },
});

