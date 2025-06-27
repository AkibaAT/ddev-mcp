import { createTool, createToolResponse, handleToolError } from "../mcp-helpers.js";
import { dbQuery } from "../database-service.js";

export default createTool(
  "ddev_db_query",
  "Execute a SQL query on the DDEV database",
  {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "SQL query to execute",
      },
      database: {
        type: "string",
        description: "Database name (optional)",
      },
      project_name: {
        type: "string",
        description: "Name of the DDEV project",
      },
    },
    required: ["query"],
  },
  (args, serverConfig) => {
    try {
      const query = args.query as string;
      const database = args.database as string | undefined;
      const projectName = args.project_name as string | undefined;
      const allowWriteOperations = (serverConfig as { allowWriteOperations?: boolean }).allowWriteOperations ?? false;
      const output = dbQuery(
        query,
        allowWriteOperations,
        database,
        projectName
      );
      return createToolResponse(output);
    } catch (error) {
      return handleToolError(error);
    }
  }
);
