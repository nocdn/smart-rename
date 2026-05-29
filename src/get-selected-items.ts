import { getSelectedFinderItems } from "@raycast/api";

import { createLogger } from "./logger";
import { runPowerShellScript } from "./run-powershell-script";

const log = createLogger("selection");

interface ExplorerWindowSelection {
  hwnd: number | null;
  title: string;
  isForeground: boolean;
  paths: string[];
}

interface ExplorerSelectionResult {
  foregroundHwnd: number;
  windows: ExplorerWindowSelection[];
}

const GET_SELECTED_EXPLORER_ITEMS_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class NativeMethods {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
}
"@ -ErrorAction SilentlyContinue

$foregroundHwnd = [NativeMethods]::GetForegroundWindow().ToInt64()
$shell = New-Object -ComObject Shell.Application
$windowsWithSelection = New-Object System.Collections.Generic.List[object]

foreach ($window in @($shell.Windows())) {
  try {
    $fullName = ""
    try {
      $fullName = [string]$window.FullName
    } catch {}

    if (-not [string]::IsNullOrWhiteSpace($fullName)) {
      $exeName = [System.IO.Path]::GetFileName($fullName).ToLowerInvariant()
      if ($exeName -ne "explorer.exe") {
        continue
      }
    }

    $hwnd = $null
    try {
      $hwnd = [Int64]$window.HWND
    } catch {}

    $title = ""
    try {
      $title = [string]$window.LocationName
    } catch {}

    $document = $null
    try {
      $document = $window.Document
    } catch {}

    if ($null -eq $document) {
      continue
    }

    $selectedItems = $null
    try {
      $selectedItems = $document.SelectedItems()
    } catch {
      continue
    }

    $paths = New-Object System.Collections.Generic.List[string]

    foreach ($item in @($selectedItems)) {
      try {
        $path = [string]$item.Path

        if (-not [string]::IsNullOrWhiteSpace($path)) {
          $paths.Add($path)
        }
      } catch {}
    }

    if ($paths.Count -gt 0) {
      $windowsWithSelection.Add([PSCustomObject]@{
        hwnd = $hwnd
        title = $title
        isForeground = ($hwnd -eq $foregroundHwnd)
        paths = @($paths.ToArray())
      })
    }
  } catch {}
}

[PSCustomObject]@{
  foregroundHwnd = $foregroundHwnd
  windows = @($windowsWithSelection.ToArray())
} | ConvertTo-Json -Depth 8 -Compress
`;

function parseExplorerSelection(stdout: string): ExplorerSelectionResult {
  log.step("Parsing Explorer selection JSON");

  const trimmedOutput = stdout.trim();

  if (!trimmedOutput) {
    log.warn("Explorer selection output was empty");
    return {
      foregroundHwnd: 0,
      windows: [],
    };
  }

  log.debug("Raw Explorer selection JSON", { raw: trimmedOutput });

  const parsed = JSON.parse(trimmedOutput) as Partial<ExplorerSelectionResult>;

  const result = {
    foregroundHwnd: typeof parsed.foregroundHwnd === "number" ? parsed.foregroundHwnd : 0,
    windows: Array.isArray(parsed.windows)
      ? parsed.windows.map((window) => ({
          hwnd: typeof window.hwnd === "number" ? window.hwnd : null,
          title: typeof window.title === "string" ? window.title : "",
          isForeground: Boolean(window.isForeground),
          paths: Array.isArray(window.paths)
            ? window.paths.filter((path): path is string => typeof path === "string")
            : [],
        }))
      : [],
  };

  log.info("Parsed Explorer selection result", {
    foregroundHwnd: result.foregroundHwnd,
    windowCount: result.windows.length,
    windows: result.windows.map((window) => ({
      hwnd: window.hwnd,
      title: window.title,
      isForeground: window.isForeground,
      pathCount: window.paths.length,
      paths: window.paths,
    })),
  });

  return result;
}

function chooseSelectedPaths(result: ExplorerSelectionResult): string[] {
  log.step("Choosing Explorer selection source");

  const windowsWithSelection = result.windows.filter((window) => window.paths.length > 0);
  const foregroundWindow = windowsWithSelection.find((window) => window.isForeground);

  if (foregroundWindow) {
    log.info("Using foreground Explorer window selection", {
      title: foregroundWindow.title,
      hwnd: foregroundWindow.hwnd,
      pathCount: foregroundWindow.paths.length,
      paths: foregroundWindow.paths,
    });
    return foregroundWindow.paths;
  }

  if (windowsWithSelection.length === 1) {
    const [onlyWindow] = windowsWithSelection;
    log.info("Using sole Explorer window with selection", {
      title: onlyWindow.title,
      hwnd: onlyWindow.hwnd,
      pathCount: onlyWindow.paths.length,
      paths: onlyWindow.paths,
    });
    return onlyWindow.paths;
  }

  if (windowsWithSelection.length > 1) {
    const paths = windowsWithSelection.flatMap((window) => window.paths);
    log.warn("Multiple Explorer windows have selections; merging all paths", {
      windowCount: windowsWithSelection.length,
      windows: windowsWithSelection.map((window) => ({
        title: window.title,
        hwnd: window.hwnd,
        pathCount: window.paths.length,
      })),
      mergedPathCount: paths.length,
      paths,
    });
    return paths;
  }

  log.warn("No Explorer windows with a non-empty selection were found");
  return [];
}

async function getSelectedExplorerItems(): Promise<string[]> {
  const startedAt = Date.now();
  log.step("Reading selected File Explorer items via PowerShell COM API");

  const { stdout, stderr, exitCode, error } = await runPowerShellScript(GET_SELECTED_EXPLORER_ITEMS_SCRIPT, {
    timeout: 5000,
  });

  if (error) {
    log.error("Explorer selection PowerShell script failed", { exitCode, stderr, error });
    throw error;
  }

  if (exitCode !== 0) {
    const message = stderr || `PowerShell exited with code ${exitCode}`;
    log.error("Explorer selection PowerShell script returned non-zero exit code", { exitCode, stderr });
    throw new Error(message);
  }

  const paths = chooseSelectedPaths(parseExplorerSelection(stdout));

  log.duration("Explorer selection", startedAt, {
    selectedPathCount: paths.length,
    paths,
  });

  return paths;
}

async function getSelectedFinderPaths(): Promise<string[]> {
  const startedAt = Date.now();
  log.step("Reading selected Finder items via Raycast API");

  const selectedItems = await getSelectedFinderItems();
  const paths = selectedItems.map((item) => item.path);

  log.duration("Finder selection", startedAt, {
    selectedPathCount: paths.length,
    paths,
    items: selectedItems,
  });

  return paths;
}

export async function getSelectedFilePaths(): Promise<string[]> {
  log.step("Resolving selected file paths", { platform: process.platform });

  if (process.platform === "darwin") {
    return getSelectedFinderPaths();
  }

  if (process.platform === "win32") {
    return getSelectedExplorerItems();
  }

  const message = "Smart Rename is only supported on macOS and Windows";
  log.error("Unsupported platform", { platform: process.platform });
  throw new Error(message);
}

export function getFileManagerName(): string {
  return process.platform === "win32" ? "File Explorer" : "Finder";
}
