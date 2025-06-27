import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ReadResourceRequest,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { tools } from "./tools/index.js";
import { getProjectStatus } from "./project-service.js";

interface ServerConfig extends Record<string, unknown> {
  defaultProjectName?: string;
  allowWriteOperations?: boolean;
  allowedCommands?: string[];
}

export class DDEVMCPServer {
  private server: Server;
  private readonly config: ServerConfig;
  private toolMap: Map<string, { name: string; description: string; inputSchema: object; handler: (args: Record<string, unknown>, config: Record<string, unknown>) => { content: { type: string; text: string }[] } }>;

  constructor(config: ServerConfig = {}) {
    this.config = config;
    this.server = new Server(
      {
        name: "ddev-mcp",
        version: "0.8.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.toolMap = new Map(tools.map((tool) => [tool.name, tool]));

    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private resolveProjectName(projectName?: string): string | undefined {
    if (this.config.defaultProjectName) {
      if (projectName && projectName !== this.config.defaultProjectName) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Access denied: Project '${projectName}' is not the configured single project`
        );
      }
      return this.config.defaultProjectName;
    }
    return projectName;
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, () => {
      let availableTools = tools;

      if (this.config.defaultProjectName) {
        availableTools = availableTools.filter(
          (tool) => tool.name !== "ddev_list_projects"
        );
      }

      if (this.config.allowedCommands && this.config.allowedCommands.length > 0) {
        availableTools = availableTools.filter((tool) =>
          this.config.allowedCommands!.includes(tool.name)
        );
      }

      return {
        tools: availableTools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      };
    });

    this.server.setRequestHandler(
      CallToolRequestSchema,
      (request: CallToolRequest) => {
        const { name, arguments: args } = request.params;
        const tool = this.toolMap.get(name);

        if (!tool) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        if (
          this.config.allowedCommands &&
          !this.config.allowedCommands.includes(name)
        ) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Command '${name}' is not in the allowed commands whitelist`
          );
        }

        try {
          const projectName = this.resolveProjectName(
            args?.project_name as string | undefined
          );
          return tool.handler({ ...args, project_name: projectName }, this.config);
        } catch (error) {
          if (error instanceof McpError) {
            throw error;
          }
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    );
  }

  private setupResourceHandlers(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, () => ({
      resources: [
        {
          uri: "ddev://current",
          name: "Current Project Info",
          description: "Information about the current/default DDEV project context",
          mimeType: "application/json",
        },
        {
          uri: "ddev://config",
          name: "DDEV Configuration",
          description: "Current DDEV project configuration",
          mimeType: "application/yaml",
        },
      ],
    }));

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      (request: ReadResourceRequest) => {
        const { uri } = request.params;

        // Handle validation errors that should be McpErrors without try-catch
        switch (uri) {
          case "ddev://current": {
            try {
              const currentProject = getProjectStatus(
                this.config.defaultProjectName
              );
              return {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(
                      {
                        project: currentProject,
                        serverConfig: {
                          defaultProjectName: this.config.defaultProjectName,
                          allowWriteOperations:
                            this.config.allowWriteOperations || false,
                          securityMode: this.config.allowWriteOperations
                            ? "write-enabled"
                            : "read-only",
                        },
                        timestamp: new Date().toISOString(),
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            } catch (error) {
              throw new McpError(
                ErrorCode.InternalError,
                `Failed to get project status: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            }
          }

          case "ddev://config": {
            const configPath = join(process.cwd(), ".ddev", "config.yaml");
            if (!existsSync(configPath)) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                "No DDEV configuration found in current directory"
              );
            }
            try {
              const config = readFileSync(configPath, "utf8");
              return {
                contents: [
                  {
                    uri: "ddev://config",
                    mimeType: "application/yaml",
                    text: config,
                  },
                ],
              };
            } catch (error) {
              throw new McpError(
                ErrorCode.InternalError,
                `Failed to read config file: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            }
          }

          default:
            throw new McpError(
              ErrorCode.InvalidParams,
              `Unknown resource: ${uri}`
            );
        }
      }
    );
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("DDEV MCP server running on stdio");
  }
}
