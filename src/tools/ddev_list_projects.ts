import { createTool, createToolResponse, handleToolError } from "../mcp-helpers.js";
import { listProjects } from "../project-service.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export default createTool(
  "ddev_list_projects",
  "List all DDEV projects with their status and information",
  {
    type: "object",
    properties: {},
  },
  (_args, serverConfig) => {
    if (serverConfig.defaultProjectName) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        "ddev_list_projects is not available in single project mode for security reasons"
      );
    }
    try {
      const projects = listProjects();
      const projectList = projects
        .map(
          (p) =>
            `• ${p.name} (${p.status})\n` +
            `  Location: ${p.shortroot || p.approot}\n` +
            `  Type: ${p.type}\n` +
            `  URLs: ${p.primary_url || "N/A"}\n`
        )
        .join("\n");
      return createToolResponse(
        `Found ${projects.length} DDEV projects:\n\n${projectList}`
      );
    } catch (error) {
      return handleToolError(error);
    }
  }
);
