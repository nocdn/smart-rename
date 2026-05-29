import { showToast, Toast } from "@raycast/api";

import { undoLatestRenameBatch } from "./rename-operations";

export default async function main() {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Undoing",
  });

  try {
    const result = await undoLatestRenameBatch();

    if (result.error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Undo failed";
      toast.message = result.error;
      return;
    }

    toast.style = Toast.Style.Success;
    toast.title = result.affected === 1 ? "Undid 1 rename" : `Undid ${result.affected} renames`;
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Undo failed";
    toast.message = error instanceof Error ? error.message : String(error);
  }
}
