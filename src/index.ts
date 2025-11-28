import "dotenv/config";
import { VoltAgent, VoltOpsClient, Agent, Memory } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";
import { expenseApprovalWorkflow } from "./workflows";
import { weatherTool } from "./tools";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
// import { listDatabases, listTables, listColumns, queryDatabas

import { listDatabases,listTables, listColumns, queryDatabase }  from "./tools/databasetools";

const openrouter= createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY || "",
})

// Create a logger instance
const logger = createPinoLogger({
  name: "my-voltagent-app",
  level: "info",
});

// Configure persistent memory (LibSQL / SQLite)
// const memory = new Memory({
//   storage: new LibSQLMemoryAdapter({
//     url: "file:./.voltagent/memory.db",
//     logger: logger.child({ component: "libsql" }),
//   }),
// });

const agent = new Agent({
  name: "my-voltagent-app",
  instructions: "A helpful assistant that can check weather and help with various tasks",
  model: openrouter("x-ai/grok-4.1-fast:free"),
  tools: [weatherTool],
  // memory,
});

const dbAgent=new Agent({
  name: "db-agent",
  instructions: "Agent that can inspect database schema and run safe read-only queries.",
  tools: [listDatabases, listTables, listColumns, queryDatabase],
  model: openrouter("x-ai/grok-4.1-fast:free"),
  // memory,
});


new VoltAgent({
  agents: {
    agent,
    dbAgent
  },
  workflows: {
    expenseApprovalWorkflow,
  },
  server: honoServer(
    {  port: parseInt(process.env.PORT || "3141"),
    hostname: "0.0.0.0"}
  ),
  logger,
  voltOpsClient: new VoltOpsClient({
    publicKey: process.env.VOLTAGENT_PUBLIC_KEY || "",
    secretKey: process.env.VOLTAGENT_SECRET_KEY || "",
  }),
});



