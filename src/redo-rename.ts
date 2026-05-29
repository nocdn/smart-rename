import { showToast, Toast } from "@raycast/api";

import { redoLatestRenameBatch } from "./rename-operations";

export default async function main() {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Redoing",
  });

  try {
    const result = await redoLatestRenameBatch();

    if (result.error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Redo failed";
      toast.message = result.error;
      return;
    }

    toast.style = Toast.Style.Success;
    toast.title = result.affected === 1 ? "Redid 1 rename" : `Redid ${result.affected} renames`;
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Redo failed";
    toast.message = error instanceof Error ? error.message : String(error);
  }
}
