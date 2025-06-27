import { createTool, createToolResponse, handleToolError } from "../mcp-helpers.js";
import { execDDEVCommand } from "../ddev-command.js";

export default createTool(
  "ddev_composer_command",
  "Run a Composer command in the DDEV project",
  {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Composer command to run",
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
      let composerCmd = command;
      const jsonSupportedCommands = [
        "show",
        "info",
        "list",
        "outdated",
        "depends",
        "why",
        "why-not",
        "status",
      ];
      const commandName = command.split(" ")[0];

      if (
        jsonSupportedCommands.includes(commandName) &&
        !command.includes("--format=")
      ) {
        composerCmd = `${command} --format=json`;
      }

      const output = execDDEVCommand(
        `composer ${composerCmd}`,
        projectName
      );

      try {
        const jsonData = JSON.parse(output);
        return createToolResponse(
          `Composer command executed successfully (JSON):\n\n${JSON.stringify(
            jsonData,
            null,
            2
          )}`
        );
      } catch {
        return createToolResponse(
          `Composer command executed successfully:\n\n${output}`
        );
      }
    } catch (error) {
      return handleToolError(error);
    }
  }
);