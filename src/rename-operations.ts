import { rename, stat } from "fs/promises";
import { basename } from "path";

import { createLogger } from "./logger";
import {
  pushRedoBatch,
  pushUndoBatch,
  returnRedoBatch,
  returnUndoBatch,
  takeLatestRedoBatch,
  takeLatestUndoBatch,
  type RenameBatch,
  type RenameEntry,
} from "./rename-history";

const log = createLogger("operations");

export interface BatchOperationResult {
  affected: number;
  error?: string;
}

async function isSameFile(firstPath: string, secondPath: string): Promise<boolean> {
  try {
    const [firstStat, secondStat] = await Promise.all([stat(firstPath), stat(secondPath)]);
    const same = firstStat.dev === secondStat.dev && firstStat.ino === secondStat.ino;
    log.debug("Compared file identity", { firstPath, secondPath, same });
    return same;
  } catch (error) {
    log.debug("File identity comparison failed", { firstPath, secondPath, error });
    return false;
  }
}

async function validateUndo(entry: RenameEntry): Promise<string | undefined> {
  log.debug("Validating undo entry", entry);

  try {
    await stat(entry.to);
  } catch (error) {
    const message = `Renamed file missing: ${basename(entry.to)}`;
    log.warn("Undo validation failed: renamed file missing", { entry, error, message });
    return message;
  }

  try {
    await stat(entry.from);
    if (!(await isSameFile(entry.from, entry.to))) {
      const message = `Cannot restore ${basename(entry.from)} — name already taken`;
      log.warn("Undo validation failed: original name already taken", { entry, message });
      return message;
    }
  } catch {
    log.debug("Undo validation passed; original path is free", entry);
    return undefined;
  }

  log.debug("Undo validation passed", entry);
  return undefined;
}

async function validateRedo(entry: RenameEntry): Promise<string | undefined> {
  log.debug("Validating redo entry", entry);

  try {
    await stat(entry.from);
  } catch (error) {
    const message = `Original file missing: ${basename(entry.from)}`;
    log.warn("Redo validation failed: original file missing", { entry, error, message });
    return message;
  }

  try {
    await stat(entry.to);
    if (!(await isSameFile(entry.from, entry.to))) {
      const message = `Cannot redo ${basename(entry.to)} — name already taken`;
      log.warn("Redo validation failed: target name already taken", { entry, message });
      return message;
    }
  } catch {
    log.debug("Redo validation passed; target path is free", entry);
    return undefined;
  }

  log.debug("Redo validation passed", entry);
  return undefined;
}

async function applyUndo(batch: RenameBatch): Promise<void> {
  log.step("Applying undo batch", {
    batchId: batch.id,
    renameCount: batch.renames.length,
    order: "reverse",
  });

  for (const entry of [...batch.renames].reverse()) {
    log.info("Undoing rename on disk", entry);
    await rename(entry.to, entry.from);
    log.info("Undo rename completed", entry);
  }
}

async function applyRedo(batch: RenameBatch): Promise<void> {
  log.step("Applying redo batch", {
    batchId: batch.id,
    renameCount: batch.renames.length,
    order: "forward",
  });

  for (const entry of batch.renames) {
    log.info("Redoing rename on disk", entry);
    await rename(entry.from, entry.to);
    log.info("Redo rename completed", entry);
  }
}

export async function undoLatestRenameBatch(): Promise<BatchOperationResult> {
  const startedAt = Date.now();
  log.step("Starting undo latest rename batch");

  const batch = await takeLatestUndoBatch();
  if (!batch) {
    log.warn("Undo aborted: no rename history available");
    return { affected: 0, error: "No rename history to undo" };
  }

  for (const entry of batch.renames) {
    const validationError = await validateUndo(entry);
    if (validationError) {
      await returnUndoBatch(batch);
      log.error("Undo aborted during validation", {
        batchId: batch.id,
        entry,
        validationError,
      });
      return { affected: 0, error: validationError };
    }
  }

  try {
    await applyUndo(batch);
  } catch (error) {
    await returnUndoBatch(batch);
    const message = error instanceof Error ? error.message : String(error);
    log.error("Undo failed while applying batch", {
      batchId: batch.id,
      error,
      message,
    });
    return {
      affected: 0,
      error: message,
    };
  }

  await pushRedoBatch(batch);

  log.duration("Undo latest rename batch", startedAt, {
    batchId: batch.id,
    affected: batch.renames.length,
  });

  return { affected: batch.renames.length };
}

export async function redoLatestRenameBatch(): Promise<BatchOperationResult> {
  const startedAt = Date.now();
  log.step("Starting redo latest rename batch");

  const batch = await takeLatestRedoBatch();
  if (!batch) {
    log.warn("Redo aborted: no redo history available");
    return { affected: 0, error: "No rename history to redo" };
  }

  for (const entry of batch.renames) {
    const validationError = await validateRedo(entry);
    if (validationError) {
      await returnRedoBatch(batch);
      log.error("Redo aborted during validation", {
        batchId: batch.id,
        entry,
        validationError,
      });
      return { affected: 0, error: validationError };
    }
  }

  try {
    await applyRedo(batch);
  } catch (error) {
    await returnRedoBatch(batch);
    const message = error instanceof Error ? error.message : String(error);
    log.error("Redo failed while applying batch", {
      batchId: batch.id,
      error,
      message,
    });
    return {
      affected: 0,
      error: message,
    };
  }

  await pushUndoBatch(batch);

  log.duration("Redo latest rename batch", startedAt, {
    batchId: batch.id,
    affected: batch.renames.length,
  });

  return { affected: batch.renames.length };
}
