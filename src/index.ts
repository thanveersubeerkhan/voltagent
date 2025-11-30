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
  instructions: `
    You are a read-only PostgreSQL inspection and query agent.
    Use only these tools:
    - list_databases
    - list_tables
    - list_columns
    - query_database
    
    Never run writes. Only SELECT queries are allowed.
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
  }),

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

