import { execDDEVCommand } from "./ddev-command.js";

export interface DDEVProject {
  name: string;
  status: string;
  running: boolean;
  type: string;
  primary_url: string;
  shortroot: string;
  approot: string;
  database?: {
    type?: string;
  };
  [key: string]: unknown;
}

export function getProjectStatus(projectName?: string): DDEVProject | null {
  try {
    const output = execDDEVCommand("describe --json-output", projectName);
    const data = JSON.parse(output);
    const rawData = data.raw || data;

    return {
      name: rawData.name || (projectName ?? "current"),
      status: rawData.status || "unknown",
      running: rawData.status === "running",
      type: rawData.type || "unknown",
      primary_url: rawData.primary_url || "N/A",
      shortroot: rawData.shortroot || rawData.approot || "N/A",
      approot: rawData.approot || "N/A",
      database: {
        type: rawData.database_type || rawData.dbinfo?.database_type || "mysql"
      },
      ...rawData,
    };
  } catch (_error) {
    return null;
  }
}

export function listProjects(): DDEVProject[] {
  try {
    const output = execDDEVCommand("list --json-output");
    const data = JSON.parse(output);
    return data.raw || [];
  } catch (_error) {
    return [];
  }
}
