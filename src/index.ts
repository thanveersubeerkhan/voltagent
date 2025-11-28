// import "dotenv/config";
// import { VoltAgent, VoltOpsClient, Agent, Memory } from "@voltagent/core";
// import { LibSQLMemoryAdapter } from "@voltagent/libsql";
// import { createPinoLogger } from "@voltagent/logger";
// import { honoServer } from "@voltagent/server-hono";
// import { expenseApprovalWorkflow } from "./workflows";
// import { weatherTool } from "./tools";
// import { createOpenRouter } from "@openrouter/ai-sdk-provider";
// // import { listDatabases, listTables, listColumns, queryDatabas

// import { listDatabases,listTables, listColumns, queryDatabase }  from "./tools/databasetools";

// const openrouter= createOpenRouter({
//   apiKey: process.env.OPENROUTER_API_KEY || "",
// })

// // Create a logger instance
// const logger = createPinoLogger({
//   name: "my-voltagent-app",
//   level: "info",
// });

// // Configure persistent memory (LibSQL / SQLite)
// // const memory = new Memory({
// //   storage: new LibSQLMemoryAdapter({
// //     url: "file:./.voltagent/memory.db",
// //     logger: logger.child({ component: "libsql" }),
// //   }),
// // });

// const agent = new Agent({
//   name: "my-voltagent-app",
//   instructions: "A helpful assistant that can check weather and help with various tasks",
//   model: openrouter("x-ai/grok-4.1-fast:free"),
//   tools: [weatherTool],
//   // memory,
// });

// const dbAgent=new Agent({
//   name: "db-agent",
//   instructions: "Agent that can inspect database schema and run safe read-only queries.",
//   tools: [listDatabases, listTables, listColumns, queryDatabase],
//   model: openrouter("x-ai/grok-4.1-fast:free"),
//   // memory,
// });


// new VoltAgent({
//   agents: {
//     agent,
//     dbAgent
//   },
//   workflows: {
//     expenseApprovalWorkflow,
//   },
//   server: honoServer(
//     {  port: parseInt(process.env.PORT || "3141"),
 
//     hostname: "0.0.0.0"}
//   ),
//   logger,
//   voltOpsClient: new VoltOpsClient({
//     publicKey: process.env.VOLTAGENT_PUBLIC_KEY || "",
//     secretKey: process.env.VOLTAGENT_SECRET_KEY || "",
//   }),
// });



import "dotenv/config";
import { VoltAgent, VoltOpsClient, Agent, Memory } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";
import { expenseApprovalWorkflow } from "./workflows";
import { weatherTool } from "./tools";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { listDatabases, listTables, listColumns, queryDatabase } from "./tools/databasetools";

// Validate required environment variables
if (!process.env.OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY environment variable is required");
  process.exit(1);
}

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Create a logger instance
const logger = createPinoLogger({
  name: "my-voltagent-app",
  level:  "info",
});

// Configure persistent memory (LibSQL / SQLite) - commented out for Render compatibility
// For Render, consider using a persistent disk or external database
/*
const memory = new Memory({
  storage: new LibSQLMemoryAdapter({
    url: process.env.DATABASE_URL || "file:./.voltagent/memory.db",
    logger: logger.child({ component: "libsql" }),
  }),
});
*/

const agent = new Agent({
  name: "my-voltagent-app",
  instructions: "A helpful assistant that can check weather and help with various tasks",
  model: openrouter("x-ai/grok-4.1-fast:free"),
  tools: [weatherTool],
  // memory: memory, // Uncomment if using memory
});

const dbAgent = new Agent({
  name: "db-agent",
  instructions: "Agent that can inspect database schema and run safe read-only queries.",
  tools: [listDatabases, listTables, listColumns, queryDatabase],
  model: openrouter("x-ai/grok-4.1-fast:free"),
  // memory: memory, // Uncomment if using memory
});

// Server configuration optimized for Render
const serverConfig = {
  port: parseInt(process.env.PORT || "3141"),
  hostname: "voltagent.onrender.com", // Important for Render
 enableSwaggerUI: true,

};

// Initialize VoltAgent
const voltAgent = new VoltAgent({
  agents: {
    agent,
    dbAgent
  },
  workflows: {
    expenseApprovalWorkflow,
  },
  server: honoServer(serverConfig),
  logger,
  voltOpsClient: new VoltOpsClient({
    publicKey: process.env.VOLTAGENT_PUBLIC_KEY || "",
    secretKey: process.env.VOLTAGENT_SECRET_KEY || "",
  }),
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  // Add any cleanup logic here
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  // Add any cleanup logic here
  process.exit(0);
});

export { voltAgent };