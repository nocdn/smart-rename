import { spawn } from "node:child_process";

import { createLogger } from "./logger";

const log = createLogger("powershell");

interface PowerShellResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: Error;
}

export async function runPowerShellScript(
  script: string,
  options: { timeout?: number } = {},
): Promise<PowerShellResult> {
  const timeout = options.timeout ?? 10000;
  const startedAt = Date.now();

  log.step("Spawning PowerShell process", {
    timeoutMs: timeout,
    scriptLength: script.length,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true },
    );

    log.info("PowerShell child process created", { pid: child.pid });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      log.warn("PowerShell process timed out; killing child", { timeoutMs: timeout, pid: child.pid });
      child.kill();
    }, timeout);

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      log.debug("PowerShell stdout chunk received", { chunkLength: text.length });
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      log.debug("PowerShell stderr chunk received", { chunkLength: text.length, chunk: text });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      log.error("PowerShell process error event", error);
      reject(error);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);

      const result = {
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        exitCode,
        error: exitCode !== 0 ? new Error(stderr || `PowerShell exited with code ${exitCode}`) : undefined,
      };

      if (timedOut) {
        log.error("PowerShell timed out", {
          timeoutMs: timeout,
          partialStdout: result.stdout,
          partialStderr: result.stderr,
        });
        reject(new Error(`PowerShell timed out after ${timeout}ms`));
        return;
      }

      log.duration("PowerShell execution", startedAt, {
        exitCode,
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
        stdout: result.stdout || "[empty]",
        stderr: result.stderr || "[empty]",
        success: exitCode === 0,
      });

      resolve(result);
    });
  });
}
