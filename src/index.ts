import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { DDEVMCPServer } from "./ddev-mcp-server.js";

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .usage('DDEV MCP Server - MCP server for DDEV development environments\n\nDefault Mode: Multi-Project, read-only (only SELECT, SHOW, DESCRIBE, EXPLAIN allowed)\nSecurity: project selection parameters available unless --single-project specified')
    .option("single-project", {
      alias: "p",
      type: "string",
      description: "Single Project Mode: Restrict server to single project (security isolation mode)",
    })
    .option("allow-write", {
      alias: "w",
      type: "boolean",
      description: "Enable write operations (INSERT, UPDATE, DELETE, etc.)",
    })
    .option("allowed-commands", {
      alias: "c",
      type: "string",
      description: "Comma-separated list of allowed commands (whitelist)",
    })
    .example('ddev-mcp --allowed-commands "ddev_project_status,ddev_db_query"', '')
    .help()
    .alias("help", "h")
    .argv;

  const config = {
    defaultProjectName: argv.singleProject,
    allowWriteOperations: argv.allowWrite,
    allowedCommands: argv.allowedCommands?.split(",").map((cmd) => cmd.trim()),
  };

  const server = new DDEVMCPServer(config);
  server.run().catch(console.error);
}

await main();
