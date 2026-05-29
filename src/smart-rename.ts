import { getPreferenceValues, openExtensionPreferences, showToast, Toast } from "@raycast/api";

import { getFileManagerName, getSelectedFilePaths } from "./get-selected-items";
import { beginRun, createLogger, endRun, maskApiKey } from "./logger";
import { pushRenameBatch } from "./rename-history";
import {
  formatRenamedSuccessToast,
  renameFiles,
  type RenameProgressPhase,
  type RenameProgressUpdate,
} from "./rename-files";
import {
  getActiveApiKey,
  getActiveProvider,
  isCloudModelEnabled,
  isFireworksReasoningEnabled,
  isRenameReasoningEnabled,
  resolveActiveModel,
  resolveOpenAIReasoningEffort,
  validateRenamePreferences,
  type RenamePreferences,
} from "./rename-preferences";

const log = createLogger("smart-rename");

const PROGRESS_TITLES: Record<RenameProgressPhase, string> = {
  sending: "Sending",
  reasoning: "Reasoning",
  renaming: "Renaming",
};

function applyProgressToast(toast: Toast, update: RenameProgressUpdate): void {
  toast.style = Toast.Style.Animated;
  toast.title = PROGRESS_TITLES[update.phase];

  if (update.suggestedName) {
    toast.message = update.suggestedName;
    return;
  }

  if (update.fileCount > 1) {
    toast.message = `File ${update.fileIndex + 1} of ${update.fileCount}`;
  } else {
    toast.message = undefined;
  }
}

export default async function main() {
  beginRun("smart-rename");

  log.step("Loading extension preferences");
  const preferences = getPreferenceValues<RenamePreferences>();

  const cloudEnabled = isCloudModelEnabled(preferences);

  log.info("Preferences loaded", {
    useCloudModel: cloudEnabled,
    provider: cloudEnabled ? getActiveProvider(preferences) : "offline",
    model: cloudEnabled ? resolveActiveModel(preferences) : undefined,
    reasoningEffort:
      cloudEnabled && getActiveProvider(preferences) === "openai"
        ? resolveOpenAIReasoningEffort(preferences)
        : undefined,
    reasoningEnabled:
      cloudEnabled && getActiveProvider(preferences) === "fireworks"
        ? isFireworksReasoningEnabled(preferences)
        : undefined,
    apiKey: cloudEnabled ? maskApiKey(getActiveApiKey(preferences)) : undefined,
    hasCustomPrompt: Boolean(preferences.renamePrompt?.trim()),
    customPromptLength: preferences.renamePrompt?.trim().length ?? 0,
  });

  const validation = validateRenamePreferences(preferences);
  if (!validation.valid) {
    log.warn("Aborting because provider credentials are missing", validation);
    await showToast({
      style: Toast.Style.Failure,
      title: validation.errorTitle ?? "Missing API key",
      message: validation.errorMessage ?? "Add your API key in extension preferences",
    });
    await openExtensionPreferences();
    endRun("cancelled", { reason: "missing-api-key", provider: getActiveProvider(preferences) });
    return;
  }

  log.step("Showing progress toast");
  const reasoningEnabled = cloudEnabled && isRenameReasoningEnabled(preferences);
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: cloudEnabled ? (reasoningEnabled ? "Sending" : "Renaming") : "Renaming",
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

    const renameStartedAt = Date.now();
    const results = await renameFiles(selectedPaths, preferences, (update) => {
      applyProgressToast(toast, update);
    });
    const renameDurationMs = Date.now() - renameStartedAt;

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

    const successToast = formatRenamedSuccessToast(results, renameDurationMs);
    toast.style = Toast.Style.Success;
    toast.title = successToast.title;
    toast.message = successToast.message;

    log.info("Smart Rename completed successfully", {
      renamed,
      skipped,
      failed,
      durationMs: renameDurationMs,
      successfulRenames,
    });

    endRun("success", { renamed, skipped, failed });
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
