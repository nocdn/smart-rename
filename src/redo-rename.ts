import { showToast, Toast } from "@raycast/api";

import { beginRun, createLogger, endRun } from "./logger";
import { redoLatestRenameBatch } from "./rename-operations";

const log = createLogger("redo-rename");

export default async function main() {
  beginRun("redo-rename");

  log.step("Showing redo toast");
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Redoing",
  });

  try {
    const result = await redoLatestRenameBatch();

    log.info("Redo command result", result);

    if (result.error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Redo failed";
      toast.message = result.error;
      endRun("failure", { affected: result.affected, error: result.error });
      return;
    }

    toast.style = Toast.Style.Success;
    toast.title = result.affected === 1 ? "Redid 1 rename" : `Redid ${result.affected} renames`;
    endRun("success", { affected: result.affected });
  } catch (error) {
    log.error("Redo command failed with unhandled error", error);
    toast.style = Toast.Style.Failure;
    toast.title = "Redo failed";
    toast.message = error instanceof Error ? error.message : String(error);
    endRun("failure", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
