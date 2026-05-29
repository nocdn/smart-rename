import { environment } from "@raycast/api";

const LOG_PREFIX = "[Smart Rename]";

type LogLevel = "debug" | "info" | "step" | "warn" | "error";

interface RunContext {
  id: string;
  command: string;
  startedAt: number;
}

let currentRun: RunContext | null = null;

function timestamp(): string {
  return new Date().toISOString();
}

function formatValue(value: unknown): string {
  if (value instanceof Error) {
    return JSON.stringify({
      name: value.name,
      message: value.message,
      stack: value.stack,
    });
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function maskApiKey(apiKey: string | undefined): string {
  const trimmed = apiKey?.trim();

  if (!trimmed) {
    return "[missing]";
  }

  if (trimmed.length <= 8) {
    return "[present, redacted]";
  }

  return `[present, ends with ...${trimmed.slice(-4)}]`;
}

function write(level: LogLevel, scope: string, message: string, data?: unknown): void {
  const runId = currentRun?.id ?? "no-run";
  const command = currentRun?.command ?? "unknown";
  const elapsedMs = currentRun ? Date.now() - currentRun.startedAt : undefined;
  const header = `${LOG_PREFIX} ${timestamp()} [run:${runId}] [${command}] [${scope}] ${message}`;

  const lines = [header];

  if (elapsedMs !== undefined) {
    lines.push(`${LOG_PREFIX} ${timestamp()} [run:${runId}] [${command}] [${scope}] elapsed=${elapsedMs}ms`);
  }

  if (data !== undefined) {
    lines.push(`${LOG_PREFIX} ${timestamp()} [run:${runId}] [${command}] [${scope}] data=${formatValue(data)}`);
  }

  const output = lines.join("\n");

  switch (level) {
    case "warn":
      console.warn(output);
      break;
    case "error":
      console.error(output);
      break;
    default:
      console.log(output);
      break;
  }
}

export function beginRun(command: string): string {
  currentRun = {
    id: crypto.randomUUID().slice(0, 8),
    command,
    startedAt: Date.now(),
  };

  write("step", "run", "Command started", {
    runId: currentRun.id,
    command,
    platform: process.platform,
    nodeVersion: process.version,
    raycastVersion: environment.raycastVersion,
    extensionName: environment.extensionName,
    commandName: environment.commandName,
    commandMode: environment.commandMode,
    isDevelopment: environment.isDevelopment,
    launchType: environment.launchType,
    appearance: environment.appearance,
  });

  return currentRun.id;
}

export function endRun(outcome: "success" | "failure" | "cancelled", details?: Record<string, unknown>): void {
  if (!currentRun) {
    write("warn", "run", "endRun called without an active run", details);
    return;
  }

  write("step", "run", `Command finished: ${outcome}`, {
    runId: currentRun.id,
    command: currentRun.command,
    durationMs: Date.now() - currentRun.startedAt,
    ...details,
  });

  currentRun = null;
}

export function createLogger(scope: string) {
  return {
    debug(message: string, data?: unknown) {
      write("debug", scope, message, data);
    },
    info(message: string, data?: unknown) {
      write("info", scope, message, data);
    },
    step(message: string, data?: unknown) {
      write("step", scope, message, data);
    },
    warn(message: string, data?: unknown) {
      write("warn", scope, message, data);
    },
    error(message: string, data?: unknown) {
      write("error", scope, message, data);
    },
    duration(label: string, startedAt: number, data?: unknown) {
      write("info", scope, `${label} completed`, {
        durationMs: Date.now() - startedAt,
        ...((data as Record<string, unknown> | undefined) ?? {}),
      });
    },
  };
}
