# DDEV MCP Server

A Model Context Protocol (MCP) server for managing DDEV projects. This server provides LLM applications with tools to interact with DDEV projects through standardized MCP protocol.

## Features

### Tools

#### Project Management
- `ddev_list_projects` - List all DDEV projects with status
- `ddev_project_status` - Get current status and configuration of a DDEV project
- `ddev_start_project` - Start a DDEV project
- `ddev_stop_project` - Stop a DDEV project
- `ddev_restart_project` - Restart a DDEV project

#### DDEV Service Operations
- `ddev_exec_command` - Execute commands in DDEV web service
- `ddev_exec_service` - Execute commands in specific DDEV services (web, db, redis, etc.)
- `ddev_ssh` - SSH access and connection information
- `ddev_logs` - Get service logs

#### Development Tools
- `ddev_composer_command` - Run Composer commands
- `ddev_xdebug` - Control Xdebug (on/off/toggle/status)
- `ddev_share` - Share project via ngrok tunnel
- `ddev_mailpit` - Access Mailpit for email testing

#### Database Management
- `ddev_export_db` - Export database dumps
- `ddev_import_db` - Import database dumps

#### Database Operations
- `ddev_db_backup` - Create database snapshots
- `ddev_db_describe_table` - Get table structure/schema (PostgreSQL \d or MySQL DESCRIBE)
- `ddev_db_list_backups` - List available database backups
- `ddev_db_list_databases` - List all databases (PostgreSQL \l or MySQL SHOW DATABASES)
- `ddev_db_list_tables` - List all tables in the database (auto-detects database type)
- `ddev_db_query` - Execute SQL queries with detailed error reporting (supports PostgreSQL, MySQL, MariaDB)
- `ddev_db_restore` - Restore from database snapshots

**🔒 Security Features:** 
- **Whitelist Security Model**: Only explicitly allowed read-only operations are permitted (default deny)
- **Comprehensive Protection**: Blocks hundreds of potentially dangerous operations by default
- **Write Protection**: All data modification blocked by default unless `--allow-write` is used
- **Catastrophic Operation Blocking**: DROP DATABASE, SHUTDOWN, file operations always blocked
- **Configuration Protection**: Blocks SET, FLUSH, GRANT, and other config changes
- **Future-Proof**: New/unknown SQL commands automatically blocked

**Enhanced Error Handling:** All database operations preserve original database error messages, including syntax errors, missing tables, permission issues, and connection problems. Follows MCP specification with `isError: true` flag for tool execution failures, allowing LLMs to understand and potentially recover from errors.

### Resources
- `ddev://current` - Current project context and server configuration
- `ddev://config` - Current project DDEV configuration

## Security Features

**🔒 Whitelist Security Model (Default Deny)**
The MCP server uses a comprehensive whitelist approach where only explicitly allowed read-only operations are permitted. Any query not matching the whitelist is automatically blocked.

### ✅ Allowed Operations (Whitelist)
- `SELECT` - Data queries and joins
- `SHOW` - Database/table inspection (TABLES, DATABASES, COLUMNS, etc.)
- `DESCRIBE` / `DESC` - Table structure
- `EXPLAIN` - Query execution plans
- `WITH ... SELECT` - Common Table Expressions (read-only)
- PostgreSQL meta-commands (`\dt`, `\d`, `\l`, etc.)
- System catalog queries (`INFORMATION_SCHEMA`, `pg_catalog`)

### ❌ Blocked Operations (Not in Whitelist)
- **Data Modification**: `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `TRUNCATE`
- **Schema Changes**: `DROP`, `CREATE`, `ALTER`, `RENAME`
- **Configuration**: `SET`, `RESET`, `FLUSH`, `OPTIMIZE`
- **Permissions**: `GRANT`, `REVOKE`, `CREATE USER`
- **Transactions**: `BEGIN`, `COMMIT`, `ROLLBACK`
- **System Admin**: `CALL`, `EXECUTE`, `HANDLER`, `LOCK`
- **File Operations**: `LOAD DATA`, `SELECT INTO OUTFILE`
- **And hundreds of other potentially dangerous operations**

### 🚫 Always Blocked (Even with --allow-write)
- `DROP DATABASE` / `DROP SCHEMA` - Catastrophic deletions
- `SHUTDOWN`, `KILL` - System control
- File system access (`LOAD_FILE`, `INTO OUTFILE`)
- Shell commands (`\!`, `COPY ... FROM PROGRAM`)
- Other system-level operations

### Enabling Write Operations

To enable write operations, use the `--allow-write` flag:

```bash
# Enable write operations
ddev-mcp --allow-write

# Enable write operations with single project mode
ddev-mcp --allow-write --single-project my-project
```

**⚠️ Warning**: Only enable write operations when necessary and ensure you trust the LLM application accessing the server.

## Multi-Database Support

The MCP server automatically detects the database type from your DDEV configuration and uses the appropriate commands:

### PostgreSQL Projects
- Commands: `psql`, `\dt`, `\d table_name`, `\l`
- Detected from: `database.type: postgres` in `.ddev/config.yaml`

### MySQL/MariaDB Projects  
- Commands: `mysql`, `SHOW TABLES`, `DESCRIBE table_name`, `SHOW DATABASES`
- Detected from: `database.type: mysql` or `database.type: mariadb` in `.ddev/config.yaml`

### Automatic Detection
- Reads `.ddev/config.yaml` to determine database type
- Falls back to MySQL if no configuration found
- Database type is shown in command output for clarity

## Installation & Deployment

### Option 1: Download from GitHub Releases (Recommended)

Download the NPM package from the [latest release](https://github.com/AkibaAT/ddev-mcp/releases/latest) and install locally:

```bash
# Download the .tgz file from releases, then:
npm install -g ./ddev-mcp-0.8.0.tgz

# Verify installation
ddev-mcp --help
```

### Option 2: NPM Installation (Currently Unavailable)

```bash
# NPM publishing is currently disabled
# Use Option 1 (GitHub Releases) instead
npm install -g ddev-mcp  # This will not work currently

# Or install directly from the downloaded package
tar -xzf ddev-mcp-1.0.0.tgz
cd package
npm install -g .
```

### Option 3: Build from Source

```bash
# Clone the repository
git clone https://github.com/AkibaAT/ddev-mcp.git
cd ddev-mcp

# Install dependencies and build
npm install
npm run build

# Install globally (optional)
npm install -g .
```

### Option 4: Quick Installation Script

```bash
# Clone and install
git clone https://github.com/AkibaAT/ddev-mcp.git
cd ddev-mcp
chmod +x install.sh
./install.sh
```

This will:
- ✅ Check system requirements (Node.js 20+, DDEV)
- 📦 Install the server globally via npm
- 📋 Provide MCP client configuration

## MCP Client Configuration

### Basic Configuration

#### Global Installation
```json
{
  "mcpServers": {
    "ddev": {
      "command": "ddev-mcp"
    }
  }
}
```

#### Local Installation
```json
{
  "mcpServers": {
    "ddev": {
      "command": "node",
      "args": ["/absolute/path/to/ddev-mcp/dist/index.js"]
    }
  }
}
```

### Advanced Configuration with Single Project Mode

**⚠️ Important:** When you configure single project mode, the MCP server becomes **limited to that single project only**. All tools will automatically target the configured project, project selection parameters (`project_name`) will be hidden from the interface, and the `ddev_list_projects` command will be disabled for security reasons (to prevent information disclosure about other projects on the system).

#### Single Project Mode (Recommended for dedicated development)
```json
{
  "mcpServers": {
    "ddev": {
      "command": "ddev-mcp",
      "args": ["--single-project", "project-id"]
    }
  }
}
```


**Use Case:** Perfect when working on a single project and you want a clean, dedicated interface without repetitive project parameters.

#### Enable Write Operations (Use with Caution)
```json
{
  "mcpServers": {
    "ddev-write": {
      "command": "ddev-mcp",
      "args": ["--allow-write", "--single-project", "development-site"]
    }
  }
}
```

#### Multi-Project Mode (Flexible for multiple projects)
```json
{
  "mcpServers": {
    "ddev": {
      "command": "ddev-mcp"
    }
  }
}
```

**Use Case:** When working with multiple DDEV projects, you can specify `project_name` or `project_path` for each command. All tools will show project selection parameters.

#### Multiple Dedicated Servers (Different projects and security levels)
```json
{
  "mcpServers": {
    "ddev-production": {
      "command": "ddev-mcp",
      "args": ["--single-project", "main-site"]
    },
    "ddev-development": {
      "command": "ddev-mcp",
      "args": ["--allow-write", "--single-project", "dev-site"]
    }
  }
}
```

**Use Case:** Separate MCP servers for different projects with different security levels (e.g., read-only for production, write-enabled for development).

### Configuration Summary

| Mode                 | Configuration                                   | Project Parameters | `ddev_list_projects`    | Use Case                                        |
|----------------------|-------------------------------------------------|--------------------|-------------------------|-------------------------------------------------|
| **Single Project**   | `--single-project name`                         | Hidden (automatic) | **Disabled** (security) | Dedicated development on one project            |
| **Multi-Project**    | No default args                                 | Visible (required) | **Available**           | Working across multiple projects                |
| **Multiple Servers** | Multiple servers with different single projects | Hidden per server  | **Disabled** per server | Different projects with different access levels |

### Configuration File Locations

Configuration file locations depend on your MCP client. Common examples:

- **Generic MCP Client**: `~/.config/mcp/config.json`
- **Application-specific**: Check your MCP client documentation for the correct path

## Project Context Features

**🎯 Intelligent Project Context**
When you configure single project mode, the MCP server provides rich contextual information to LLMs through the `ddev://current` resource.

### Current Project Information

The `ddev://current` resource provides real-time:
- **Project Details**: Name, status, database type, URL
- **Server Configuration**: Security mode, default settings  
- **Dynamic Status**: Current project state (updated when accessed)

**Example Response:**
```json
{
  "project": {
    "name": "project-id",
    "status": "running", 
    "dbType": "postgres",
    "url": "https://project-id.ddev.site",
    "description": "DDEV project 'project-id' (running) using postgres database"
  },
  "serverConfig": {
    "securityMode": "read-only",
    "allowWriteOperations": false
  }
}
```

## Usage Examples

### Project Targeting Options

The MCP server supports different project targeting modes depending on your configuration:

#### Single Project Mode (Single Project Configured)
```json5
// Clean interface - no project parameters needed or visible
{
  "name": "ddev_db_query",
  "arguments": {
    "query": "SELECT COUNT(*) FROM games;"
  }
}
```
**All commands automatically target the configured single project.**

#### Multi-Project Mode (No Single Project Restriction)
```json5
// Use Project Name
{
  "name": "ddev_db_query",
  "arguments": {
    "project_name": "project-id",
    "query": "SELECT COUNT(*) FROM users;"
  }
}
```

```json5
// Start a specific project
{
  "name": "ddev_start_project", 
  "arguments": {
    "project_name": "my-site"
  }
}
```
**Project parameters are visible and required for targeting specific projects.**

### Project Resolution (Multi-Project Mode Only)

When no single project restriction is configured, the server resolves projects in this order:

1. **Explicit `project_name`** - Uses the specified DDEV project name
2. **Current directory** - Fallback if no project name provided

**Note:** In single project mode, all commands automatically use the configured project.

## Testing & Debugging

### Test with MCP Inspector
```bash
# Global installation
npx @modelcontextprotocol/inspector ddev-mcp

# Local installation
npx @modelcontextprotocol/inspector node dist/index.js

# Development mode
npx @modelcontextprotocol/inspector node --loader ts-node/esm index.ts
```

### Verify Installation
```bash
# Check if globally installed
which ddev-mcp

# Test DDEV integration
ddev list --json-output
```

## Requirements

- Node.js 20+
- DDEV installed and accessible via PATH
- DDEV projects configured

## Development

### Building and Running

```bash
npm run dev         # Run with ts-node
npm run build       # Build TypeScript
npm run start       # Run built version
```

### Code Quality

```bash
npm run lint        # Run ESLint
npm run lint:fix    # Fix auto-fixable ESLint issues
npm run lint:check  # Run ESLint with strict checking (CI)
```

### Testing

```bash
npm run test        # Run tests
npm run test:watch  # Run tests in watch mode
npm run test:ci     # Run tests for CI (with coverage)
```
