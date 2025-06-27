import { execSync, ExecSyncOptions } from "child_process";

export class DdevCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DdevCommandError";
  }
}

export function execDDEVCommand(
  command: string,
  projectName?: string,
  options: Partial<ExecSyncOptions> = {}
): string {
  try {
    // Commands that support project name as argument
    const commandsWithProjectArg = ['describe', 'list', 'start', 'stop', 'restart', 'delete'];
    const commandBase = command.split(' ')[0];
    
    let fullCommand: string;
    let execOptions: ExecSyncOptions;
    
    if (projectName && commandsWithProjectArg.includes(commandBase)) {
      // Use project name as argument for supported commands
      fullCommand = `ddev ${command} ${projectName}`;
      execOptions = {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        ...options,
      };
    } else if (projectName && commandBase === 'exec') {
      // For exec commands, we need to get the project path and run from there
      const projectInfo = getProjectPath(projectName);
      if (!projectInfo) {
        throw new Error(`Project ${projectName} not found or not accessible`);
      }
      
      fullCommand = `ddev ${command}`;
      execOptions = {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        cwd: projectInfo,
        ...options,
      };
    } else {
      // Default behavior for commands without project specification
      fullCommand = `ddev ${command}`;
      execOptions = {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        ...options,
      };
    }

    return execSync(fullCommand, execOptions).toString();
  } catch (error: unknown) {
    const err = error as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
    const errorMessage =
      err.stderr?.toString() ||
      err.stdout?.toString() ||
      err.message?.toString() ||
      String(error);
    throw new DdevCommandError(
      `DDEV command failed: ${errorMessage}`
    );
  }
}

function getProjectPath(projectName: string): string | null {
  try {
    // Get project info using describe command
    const output = execSync(`ddev describe --json-output ${projectName}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).toString();
    
    const data = JSON.parse(output);
    const rawData = data.raw || data;
    return rawData.approot || rawData.shortroot || null;
  } catch (_error) {
    return null;
  }
}
