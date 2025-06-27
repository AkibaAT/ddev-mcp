import { createTool, createToolResponse, handleToolError } from "../mcp-helpers.js";
import { execDDEVCommand } from "../ddev-command.js";

export default createTool(
  "ddev_exec_command",
  "Execute a command inside the DDEV web service",
  {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Command to execute in the web service",
      },
      project_name: {
        type: "string",
        description: "Name of the DDEV project",
      },
    },
    required: ["command"],
  },
  (args, _serverConfig) => {
    try {
      const command = args.command as string;
      const projectName = args.project_name as string | undefined;
      const output = execDDEVCommand(`exec "${command}"`, projectName);
      return createToolResponse(`Command executed successfully:\n\n${output}`);
    } catch (error) {
      return handleToolError(error);
    }
  }
);