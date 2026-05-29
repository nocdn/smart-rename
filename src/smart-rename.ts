import { getPreferenceValues, getSelectedFinderItems, openExtensionPreferences, showToast, Toast } from "@raycast/api";

import { pushRenameBatch } from "./rename-history";
import { renameFilesWithAI } from "./rename-with-ai";

interface Preferences {
  openaiApiKey: string;
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
  const preferences = getPreferenceValues<Preferences>();

  if (!preferences.openaiApiKey?.trim()) {
    await showToast({
      style: Toast.Style.Failure,
      title: "OpenAI API key required",
      message: "Add your API key in extension preferences",
    });
    await openExtensionPreferences();
    return;
  }

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Renaming",
  });

  try {
    const selectedItems = await getSelectedFinderItems();

    if (selectedItems.length === 0) {
      toast.style = Toast.Style.Failure;
      toast.title = "No files selected";
      toast.message = "Select one or more items in Finder first";
      return;
    }

    const results = await renameFilesWithAI(
      selectedItems.map((item) => item.path),
      preferences,
    );

    const renamed = results.filter((result) => result.newPath).length;
    const skipped = results.filter((result) => result.skipped && result.reason === "Name already looks good").length;
    const failed = results.filter((result) => result.skipped && result.reason !== "Name already looks good").length;

    if (renamed === 0 && failed > 0) {
      toast.style = Toast.Style.Failure;
      toast.title = "Rename failed";
      toast.message = results.find((result) => result.reason)?.reason;
      return;
    }

    if (renamed === 0 && skipped > 0) {
      toast.style = Toast.Style.Success;
      toast.title = "Nothing to rename";
      toast.message = "All selected items already have clean names";
      return;
    }

    const successfulRenames = results
      .filter((result) => result.newPath)
      .map((result) => ({ from: result.path, to: result.newPath! }));

    await pushRenameBatch(successfulRenames);

    toast.style = Toast.Style.Success;
    toast.title = renamed === 1 ? "Renamed 1 item" : `Renamed ${renamed} items`;
    toast.message = summarizeResults(renamed, skipped, failed);
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Rename failed";
    toast.message = error instanceof Error ? error.message : String(error);
  }
}
