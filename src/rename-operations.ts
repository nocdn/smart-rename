import { rename, stat } from "fs/promises";
import { basename } from "path";

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

export interface BatchOperationResult {
  affected: number;
  error?: string;
}

async function isSameFile(firstPath: string, secondPath: string): Promise<boolean> {
  try {
    const [firstStat, secondStat] = await Promise.all([stat(firstPath), stat(secondPath)]);
    return firstStat.dev === secondStat.dev && firstStat.ino === secondStat.ino;
  } catch {
    return false;
  }
}

async function validateUndo(entry: RenameEntry): Promise<string | undefined> {
  try {
    await stat(entry.to);
  } catch {
    return `Renamed file missing: ${basename(entry.to)}`;
  }

  try {
    await stat(entry.from);
    if (!(await isSameFile(entry.from, entry.to))) {
      return `Cannot restore ${basename(entry.from)} — name already taken`;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function validateRedo(entry: RenameEntry): Promise<string | undefined> {
  try {
    await stat(entry.from);
  } catch {
    return `Original file missing: ${basename(entry.from)}`;
  }

  try {
    await stat(entry.to);
    if (!(await isSameFile(entry.from, entry.to))) {
      return `Cannot redo ${basename(entry.to)} — name already taken`;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function applyUndo(batch: RenameBatch): Promise<void> {
  for (const entry of [...batch.renames].reverse()) {
    await rename(entry.to, entry.from);
  }
}

async function applyRedo(batch: RenameBatch): Promise<void> {
  for (const entry of batch.renames) {
    await rename(entry.from, entry.to);
  }
}

export async function undoLatestRenameBatch(): Promise<BatchOperationResult> {
  const batch = await takeLatestUndoBatch();
  if (!batch) {
    return { affected: 0, error: "No rename history to undo" };
  }

  for (const entry of batch.renames) {
    const validationError = await validateUndo(entry);
    if (validationError) {
      await returnUndoBatch(batch);
      return { affected: 0, error: validationError };
    }
  }

  try {
    await applyUndo(batch);
  } catch (error) {
    await returnUndoBatch(batch);
    return {
      affected: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  await pushRedoBatch(batch);
  return { affected: batch.renames.length };
}

export async function redoLatestRenameBatch(): Promise<BatchOperationResult> {
  const batch = await takeLatestRedoBatch();
  if (!batch) {
    return { affected: 0, error: "No rename history to redo" };
  }

  for (const entry of batch.renames) {
    const validationError = await validateRedo(entry);
    if (validationError) {
      await returnRedoBatch(batch);
      return { affected: 0, error: validationError };
    }
  }

  try {
    await applyRedo(batch);
  } catch (error) {
    await returnRedoBatch(batch);
    return {
      affected: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  await pushUndoBatch(batch);
  return { affected: batch.renames.length };
}
