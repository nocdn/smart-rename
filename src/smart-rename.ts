import { getPreferenceValues, openExtensionPreferences, showToast, Toast } from "@raycast/api";

import { getFileManagerName, getSelectedFilePaths } from "./get-selected-items";
import { beginRun, createLogger, endRun, maskApiKey } from "./logger";
import { pushRenameBatch } from "./rename-history";
import { DEFAULT_OPENAI_MODEL, renameFilesWithAI } from "./rename-with-ai";

const log = createLogger("smart-rename");

interface Preferences {
  openaiApiKey: string;
  openaiModel: string;
  renamePrompt: string;
}

function summarizeResults(renamed: number, skipped: number, failed: number): string {
  const parts: string[] = [];

  if (renamed > 0) {
    parts.push(`${renamed} renamed`);
  }
  if (skipped > 0) {
    parts.push(`${skipped} skipped`);
  }
  if (failed > 0) {
    parts.push(`${failed} failed`);
  }

  return parts.join(", ");
}

export default async function main() {
  beginRun("smart-rename");

  log.step("Loading extension preferences");
  const preferences = getPreferenceValues<Preferences>();

  log.info("Preferences loaded", {
    apiKey: maskApiKey(preferences.openaiApiKey),
    model: preferences.openaiModel?.trim() || DEFAULT_OPENAI_MODEL,
    hasCustomPrompt: Boolean(preferences.renamePrompt?.trim()),
    customPromptLength: preferences.renamePrompt?.trim().length ?? 0,
  });

  if (!preferences.openaiApiKey?.trim()) {
    log.warn("Aborting because OpenAI API key is missing");
    await showToast({
      style: Toast.Style.Failure,
      title: "OpenAI API key required",
      message: "Add your API key in extension preferences",
    });
    await openExtensionPreferences();
    endRun("cancelled", { reason: "missing-api-key" });
    return;
  }

  log.step("Showing renaming toast");
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Renaming",
  });

  try {
    const selectedPaths = await getSelectedFilePaths();

    if (selectedPaths.length === 0) {
      const message = `Select one or more items in ${getFileManagerName()} first`;
      log.warn("Aborting because no files were selected", { fileManager: getFileManagerName() });
      toast.style = Toast.Style.Failure;
      toast.title = "No files selected";
      toast.message = message;
      endRun("cancelled", { reason: "no-selection" });
      return;
    }

    log.info("Selected files resolved", {
      count: selectedPaths.length,
      paths: selectedPaths,
    });

    const results = await renameFilesWithAI(selectedPaths, preferences);

    const renamed = results.filter((result) => result.newPath).length;
    const skipped = results.filter((result) => result.skipped && result.reason === "Name already looks good").length;
    const failed = results.filter((result) => result.skipped && result.reason !== "Name already looks good").length;

    log.info("Rename batch results summarized", {
      renamed,
      skipped,
      failed,
      results,
    });

    if (renamed === 0 && failed > 0) {
      const reason = results.find((result) => result.reason)?.reason;
      log.error("Rename batch failed with no successful renames", { reason, results });
      toast.style = Toast.Style.Failure;
      toast.title = "Rename failed";
      toast.message = reason;
      endRun("failure", { renamed, skipped, failed, reason });
      return;
    }

    if (renamed === 0 && skipped > 0) {
      log.info("Rename batch completed with only skipped files", { skipped, results });
      toast.style = Toast.Style.Success;
      toast.title = "Nothing to rename";
      toast.message = "All selected items already have clean names";
      endRun("success", { renamed, skipped, failed, outcome: "all-skipped" });
      return;
    }

    const successfulRenames = results
      .filter((result) => result.newPath)
      .map((result) => ({ from: result.path, to: result.newPath! }));

    log.step("Persisting successful rename batch to history", {
      renameCount: successfulRenames.length,
      successfulRenames,
    });

    await pushRenameBatch(successfulRenames);

    const summary = summarizeResults(renamed, skipped, failed);
    toast.style = Toast.Style.Success;
    toast.title = renamed === 1 ? "Renamed 1 item" : `Renamed ${renamed} items`;
    toast.message = summary;

    log.info("Smart Rename completed successfully", {
      renamed,
      skipped,
      failed,
      summary,
      successfulRenames,
    });

    endRun("success", { renamed, skipped, failed, summary });
  } catch (error) {
    log.error("Smart Rename failed with unhandled error", error);
    toast.style = Toast.Style.Failure;
    toast.title = "Rename failed";
    toast.message = error instanceof Error ? error.message : String(error);
    endRun("failure", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
