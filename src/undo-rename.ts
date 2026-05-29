import { showToast, Toast } from "@raycast/api";

import { beginRun, createLogger, endRun } from "./logger";
import { undoLatestRenameBatch } from "./rename-operations";

const log = createLogger("undo-rename");

export default async function main() {
  beginRun("undo-rename");

  log.step("Showing undo toast");
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Undoing",
  });

  try {
    const result = await undoLatestRenameBatch();

    log.info("Undo command result", result);

    if (result.error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Undo failed";
      toast.message = result.error;
      endRun("failure", { affected: result.affected, error: result.error });
      return;
    }

    toast.style = Toast.Style.Success;
    toast.title = result.affected === 1 ? "Undid 1 rename" : `Undid ${result.affected} renames`;
    endRun("success", { affected: result.affected });
  } catch (error) {
    log.error("Undo command failed with unhandled error", error);
    toast.style = Toast.Style.Failure;
    toast.title = "Undo failed";
    toast.message = error instanceof Error ? error.message : String(error);
    endRun("failure", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
