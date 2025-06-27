import { createTool, createToolResponse, handleToolError } from "../mcp-helpers.js";
import { getProjectStatus } from "../project-service.js";

export default createTool(
  "ddev_project_status",
  "Get the current status and configuration of a DDEV project",
  {
    type: "object",
    properties: {
      project_name: {
        type: "string",
        description: "Name of the DDEV project",
      },
    },
  },
  (args, _serverConfig) => {
    try {
      const projectName = args.project_name as string | undefined;
      const projectInfo = getProjectStatus(projectName);
      if (!projectInfo) {
        return createToolResponse(
          `DDEV project not found: ${projectName || "current"}`
        );
      }
      return createToolResponse(
        `DDEV Project Status:\n\n${JSON.stringify(projectInfo, null, 2)}`
      );
    } catch (error) {
      return handleToolError(error);
    }
  }
);
