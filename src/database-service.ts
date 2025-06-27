import { getProjectStatus } from "./project-service.js";
import { execDDEVCommand } from "./ddev-command.js";

export type DatabaseType = "postgres" | "mysql" | "mariadb";

export function getDatabaseType(projectName?: string): DatabaseType {
  const project = getProjectStatus(projectName);
  return (project?.database?.type?.toLowerCase() as DatabaseType) || "mysql";
}

export function getDbCommands(dbType: DatabaseType) {
  switch (dbType) {
    case "postgres":
      return {
        client: "psql",
        commandFlag: "-c",
        listTables: "\\dt",
        describeTable: (table: string) => `\\d ${table}`,
        listDatabases: "\\l",
      };
    case "mysql":
    case "mariadb":
    default:
      return {
        client: "mysql",
        commandFlag: "-e",
        listTables: "SHOW TABLES;",
        describeTable: (table: string) => `DESCRIBE ${table};`,
        listDatabases: "SHOW DATABASES;",
      };
  }
}

export function isReadOnlyQuery(query: string): boolean {
  const normalizedQuery = query
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  if (!normalizedQuery) {
    return true;
  }

  // Check for multiple statements (SQL injection attempts)
  // Split on semicolon and check if we have multiple meaningful statements
  const statements = normalizedQuery.split(';').map(s => s.trim()).filter(s => s.length > 0);
  if (statements.length > 1) {
    // Multiple statements detected - this is likely SQL injection
    return false;
  }

  const safeReadOnlyPatterns = [
    /^SELECT\b/,
    /^SHOW\s+(TABLES|DATABASES|SCHEMAS|COLUMNS|INDEX|INDEXES|INDICES|STATUS|VARIABLES|PROCESSLIST|ENGINES|CHARSET|COLLATION|CREATE\s+TABLE|CREATE\s+DATABASE|CREATE\s+VIEW|TABLE\s+STATUS|FULL\s+TABLES|GRANTS|PRIVILEGES)\b/,
    /^DESCRIBE\b/,
    /^DESC\b/,
    /^EXPLAIN\b/,
    /^EXPLAIN\s+(ANALYZE|VERBOSE|FORMAT)\b/,
    /^\\DT$/,
    /^\\D\s+\w+$/,
    /^\\L$/,
    /^\\DN$/,
    /^\\DF$/,
    /^\\DV$/,
    /^\\DI$/,
    /^\\DU$/,
    /^\\DP$/,
    /^\\Z$/,
    /^WITH\b.*\bSELECT\b(?!.*\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|REPLACE|MERGE|GRANT|REVOKE|SET|RESET|CALL|EXECUTE|EXEC|COPY|VACUUM|ANALYZE|CLUSTER|REINDEX|LOAD|IMPORT|FLUSH|OPTIMIZE|REPAIR|CHECKSUM|BEGIN|START|COMMIT|ROLLBACK|SAVEPOINT|RENAME|COMMENT|HANDLER|LOCK|UNLOCK)\b)/,
    /^SELECT\s+.*\s+FROM\s+(INFORMATION_SCHEMA|PERFORMANCE_SCHEMA|mysql\.)\w+/,
    /^SELECT\s+.*\s+FROM\s+(pg_catalog|information_schema)\.\w+/,
    /^SELECT\s+.*\s+FROM\s+pg_\w+/,
  ];

  return safeReadOnlyPatterns.some((pattern) => pattern.test(normalizedQuery));
}

export function validateQuerySecurity(
  query: string,
  allowWriteOperations: boolean
): { allowed: boolean; reason?: string } {
  const normalizedQuery = query.trim().toUpperCase();
  const catastrophicPatterns = [
    /DROP\s+(DATABASE|SCHEMA|TABLESPACE)\b/,
    /SHUTDOWN\b/,
    /KILL\b/,
    /LOAD_FILE\b/,
    /INTO\s+(OUTFILE|DUMPFILE)\b/,
    /\/\*!.*?\*\//,
    /\\!\s*/,
    /COPY\s+.*FROM\s+PROGRAM\b/,
    /SELECT\s+.*INTO\s+(OUTFILE|DUMPFILE)\b/,
    /LOAD\s+DATA\s+LOCAL\s+INFILE\b/,
    /GRANT\s+(ALL\s+PRIVILEGES|CREATE|DROP|ALTER|DELETE|INSERT|UPDATE|SELECT|SUPER|RELOAD|LOCK\s+TABLES|REPLICATION|BINLOG|PROCESS|FILE|REFERENCES|INDEX|CREATE\s+USER|SHUTDOWN|CREATE\s+TEMPORARY\s+TABLES|EXECUTE|REPLICATION\s+SLAVE|REPLICATION\s+CLIENT|CREATE\s+VIEW|SHOW\s+VIEW|CREATE\s+ROUTINE|ALTER\s+ROUTINE|EVENT|TRIGGER)/,
    /CREATE\s+USER\b/,
    /SET\s+(GLOBAL|SESSION|@@)/,
    /^\s*UNION\s+SELECT\b/,
    /SELECT\s+@@DATADIR/,
    /SELECT\s+@@BASEDIR/,
    /SELECT\s+@@TMPDIR/,
    /SELECT\s+@@SECURE_FILE_PRIV/,
    /SELECT\s+@@PLUGIN_DIR/,
    /SHOW\s+GRANTS\b/,
  ];

  if (catastrophicPatterns.some((pattern) => pattern.test(normalizedQuery))) {
    return {
      allowed: false,
      reason:
        "This operation is permanently blocked as it could be catastrophic to the system or expose sensitive data.",
    };
  }

  if (!allowWriteOperations && !isReadOnlyQuery(query)) {
    return {
      allowed: false,
      reason:
        "Query not in whitelist of safe read-only operations. Only SELECT, SHOW, DESCRIBE, EXPLAIN, and database introspection commands are allowed. Use --allow-write to enable write operations.",
    };
  }

  return { allowed: true };
}

export function dbQuery(
  query: string,
  allowWriteOperations = false,
  database?: string,
  projectName?: string
): string {
  const security = validateQuerySecurity(query, allowWriteOperations);
  if (!security.allowed) {
    throw new Error(`Query not allowed: ${security.reason}`);
  }

  const dbType = getDatabaseType(projectName);
  const dbCommands = getDbCommands(dbType);

  // Use ddev exec instead of direct mysql/psql commands
  let command = `exec ${dbCommands.client}`;
  if (database) {
    command += dbType === "postgres" ? ` -d ${database}` : ` -D ${database}`;
  }
  command += ` ${dbCommands.commandFlag} "${query.replace(/"/g, '\\"')}"`;

  const output = execDDEVCommand(command, projectName);
  const securityMode = allowWriteOperations
    ? "🔓 Write Mode"
    : "🔒 Read-Only Mode";
  return `Query executed successfully (${dbType}) [${securityMode}]:\n\n${output}`;
}
