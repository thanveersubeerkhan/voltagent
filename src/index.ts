import "dotenv/config";
import { VoltAgent, VoltOpsClient, Agent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";
import { createPinoLogger } from "@voltagent/logger";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import { expenseApprovalWorkflow } from "./workflows";
import { weatherTool } from "./tools";
import { listDatabases, listTables, listColumns, queryDatabase } from "./tools/databasetools";

import { generateText, Output } from "ai";
import z from "zod";

// ---------- CHECK ENVIRONMENT VARIABLES ----------
if (!process.env.OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY");
  process.exit(1);
}

if (!process.env.VOLTAGENT_PUBLIC_KEY || !process.env.VOLTAGENT_SECRET_KEY) {
  console.error("Missing VoltOps keys (VOLTAGENT_PUBLIC_KEY / VOLTAGENT_SECRET_KEY)");
  process.exit(1);
}

const voltclient=   new VoltOpsClient({
    publicKey: process.env.VOLTAGENT_PUBLIC_KEY!,
    secretKey: process.env.VOLTAGENT_SECRET_KEY!,
  })
// ---------- MODEL PROVIDER ----------
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ---------- LOGGING ----------
const logger = createPinoLogger({
  name: "my-voltagent-app",
  level: "info",
});

// ---------- MAIN AGENT ----------
const agent = new Agent({
  name: "default-agent",
  instructions: "A helpful assistant that can check weather and answer general questions.",
  model: openrouter("x-ai/grok-4.1-fast:free"),
  tools: [weatherTool],
});

// ---------- DB AGENT ----------
export const dbAgent = new Agent({
  name: "db-agent",
  instructions: ` You are an advanced read-only PostgreSQL database analysis agent. Your primary function is to intelligently explore database structures and execute optimized SELECT queries for data analysis.

## CORE PRINCIPLES:
- STRICTLY READ-ONLY: Only SELECT queries allowed. Never execute INSERT, UPDATE, DELETE, DROP, ALTER, or any modifying operations.
- STRUCTURE-FIRST APPROACH: Always examine database structure before querying to understand schema relationships.
- OPTIMIZED QUERIES: Use efficient SQL with proper WHERE clauses, LIMITS, and avoid SELECT * on large tables.
- SAFETY FIRST: Validate query safety and add protective limits automatically.

## WORKFLOW PROTOCOL:

### Phase 1: Database Exploration
1. **Start Broad**: First list all databases to understand the environment
2. **Target Specific**: Identify and focus on relevant database(s)
3. **Map Structure**: List tables and examine column definitions thoroughly
4. **Understand Relationships**: Identify primary keys, foreign keys, and data types

### Phase 2: Strategic Query Planning
1. **Analyze Requirements**: Break down user requests into logical data components
2. **Check Feasibility**: Verify required columns and tables exist
3. **Build Efficient Queries**: Use proper joins, filters, and aggregations
4. **Implement Safeguards**: Always include LIMIT clauses for initial exploration

### Phase 3: Progressive Data Retrieval
1. **Start Small**: Use sample queries with LIMIT 10-50 to verify results
2. **Scale Gradually**: Increase data volume only after confirming query accuracy
3. **Handle Large Datasets**: Use pagination (OFFSET/LIMIT) for large tables
4. **Monitor Performance**: Avoid expensive operations like full table scans

## QUERY OPTIMIZATION RULES:
- Prefer "SELECT column1, column2" over "SELECT *"
- Always use WHERE clauses to filter data when possible
- Use LIMIT for initial exploration: "LIMIT 25"
- For large tables, use: "WHERE created_at > NOW() - INTERVAL '30 days'"
- Use EXISTS instead of IN for subqueries when appropriate
- Include ORDER BY for consistent result ordering

## ERROR PREVENTION STRATEGIES:
1. **Schema Validation**: Always verify column names and types before querying
2. **Query Testing**: Test complex queries with LIMIT first
3. **Type Safety**: Ensure data type compatibility in WHERE clauses
4. **Null Handling**: Consider NULL values in filtering conditions

## RESPONSE STRUCTURE:
- Begin with your analysis approach and strategy
- Show the step-by-step exploration process
- Display actual query results clearly
- Provide insights and observations about the data
- Suggest next-level analyses based on findings

## ADVANCED CAPABILITIES:
- Complex JOIN operations across related tables
- Aggregate functions with GROUP BY for summary statistics
- Window functions for ranking and time-series analysis
- Subqueries and CTEs for complex data transformations
- Pattern matching with LIKE and regular expressions
- Date/time functions for temporal analysis

## SAFETY PROTOCOLS:
- Automatic query timeout protection
- Maximum row limits enforced
- No cross-database operations without explicit permission
- Validation of all user-input in queries to prevent injection

Remember: You are a data explorer, not a data modifier. Your power comes from intelligent reading, not writing.
tools available
1. list_databases → Identify target database
2. list_tables → Understand table landscape  
3. list_columns (for each relevant table) → Map schema structure
4. query_database (with optimized SELECT) → Extract insights
  `,
  model: openrouter("x-ai/grok-4.1-fast:free"),
  tools: [listDatabases, listTables, listColumns, queryDatabase],
  maxSteps: 20,
});

// ---------- QUERY FUNCTION ----------
async function querydb(input: string,schema:any) {


return await generateText({
  prompt: input,
  model: openrouter("x-ai/grok-4.1-fast:free"),
  system:
    "You are a structured data generator. Take the input and output JSON that strictly matches the provided schema.",
  experimental_output: schema, 
});

}

// ---------- SERVER CONFIG ----------
const server = honoServer({
  port: parseInt(process.env.PORT || "3141"),
  enableSwaggerUI: true,


  configureApp: (app: any) => {
    // ------- HEALTH CHECK ROUTE -------
    app.post("/api/health", async (c: any) => {
      try {
        const {input} = await c.req.json()
        const result = await dbAgent.generateText(input);
        return c.json({ status: "ok", result });
      } catch (e) {
        console.error("API /api/health error:", e);
        return c.json({ status: "error" });
      }
    });
    // ------- TEST ROUTE -------
    app.post("/api/db", async (c: any) => {
      try {
        const {input,schema} = await c.req.json()
        //  const parseschema=JSON.parse(schema)
        // console.log(input,parseschema)
        const result = await dbAgent.generateText(input);
        const parseschema=  z.object({
  // columns: z.array(
  //   z.object({
  //     key: z.string(),
  //     label: z.string(),
  //     type: z.enum(["text", "badge", "date"]).optional(),
  //   })
  // ),

  // data: z.array(
  //   z.object({
  //     id: z.string(),
  //   }).catchall(z.any())
  // ),
  chart: z.object({
    title: z.string().optional(),
    data: z.array(
      z.object({
        label: z.string(),
        value: z.number(),
      })
    ),
  }).describe("this data for barchart"),
    chart1: z.object({
    title: z.string().optional(),
    data: z.array(
      z.object({
        label: z.string(),
        value: z.number(),
      })
    ),
  }).describe("this data for linechart"),
    chart2: z.object({
    title: z.string().optional(),
    data: z.array(
      z.object({
        label: z.string(),
        value: z.number(),
      })
    ),
  }).describe("this data for piechart"),

});
       
        const schema1=Output.object({schema:parseschema})
        const result1 = await querydb(result.text,schema1);
        return c.json(result1.experimental_output);
        // return c.json({ error:false}, 200);
      } catch (err: any) {
        console.error("API /api/chat error:", err);
        return c.json({ error: true, message: err.message }, 500);
      }
    });
  },
});

// ---------- VOLT AGENT BOOTSTRAP ----------
const voltAgent = new VoltAgent({
  agents: { agent, dbAgent },
  workflows: { expenseApprovalWorkflow },
 
  logger,
  voltOpsClient:new VoltOpsClient({
    publicKey: process.env.VOLTAGENT_PUBLIC_KEY!,
    secretKey: process.env.VOLTAGENT_SECRET_KEY!,
  }),


    server
});

export { voltAgent };

