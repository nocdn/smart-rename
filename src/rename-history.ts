import { randomUUID } from "node:crypto";

import { LocalStorage } from "@raycast/api";

import { createLogger } from "./logger";

const log = createLogger("history");

const STORAGE_KEY = "rename-history-v2";
const LEGACY_STORAGE_KEY = "rename-history-v1";
const MAX_BATCHES = 100;

export interface RenameEntry {
  from: string;
  to: string;
}

export interface RenameBatch {
  id: string;
  createdAt: number;
  renames: RenameEntry[];
}

interface RenameHistoryStore {
  undoBatches: RenameBatch[];
  redoBatches: RenameBatch[];
}

function emptyStore(): RenameHistoryStore {
  return { undoBatches: [], redoBatches: [] };
}

function trimBatches(batches: RenameBatch[]): RenameBatch[] {
  if (batches.length <= MAX_BATCHES) {
    return batches;
  }

  log.warn("Trimming history batches to max limit", {
    previousCount: batches.length,
    maxBatches: MAX_BATCHES,
  });

  return batches.slice(-MAX_BATCHES);
}

async function readStore(): Promise<RenameHistoryStore> {
  log.debug("Reading rename history store");

  const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<RenameHistoryStore>;
      if (Array.isArray(parsed.undoBatches) && Array.isArray(parsed.redoBatches)) {
        log.info("Loaded rename history store", {
          undoBatchCount: parsed.undoBatches.length,
          redoBatchCount: parsed.redoBatches.length,
        });
        return {
          undoBatches: parsed.undoBatches,
          redoBatches: parsed.redoBatches,
        };
      }

      log.warn("Rename history store had invalid shape; resetting", { rawLength: raw.length });
    } catch (error) {
      log.error("Failed to parse rename history store; resetting", error);
      return emptyStore();
    }
  }

  const legacyRaw = await LocalStorage.getItem<string>(LEGACY_STORAGE_KEY);
  if (!legacyRaw) {
    log.info("No rename history found; starting with empty store");
    return emptyStore();
  }

  log.step("Migrating legacy rename history store");

  try {
    const legacy = JSON.parse(legacyRaw) as { batches?: RenameBatch[] };
    if (!Array.isArray(legacy.batches)) {
      log.warn("Legacy rename history store had invalid shape; resetting");
      return emptyStore();
    }

    const store = { undoBatches: legacy.batches, redoBatches: [] };
    await writeStore(store);
    await LocalStorage.removeItem(LEGACY_STORAGE_KEY);
    log.info("Migrated legacy rename history store", {
      migratedBatchCount: legacy.batches.length,
    });
    return store;
  } catch (error) {
    log.error("Failed to migrate legacy rename history store; resetting", error);
    return emptyStore();
  }
}

async function writeStore(store: RenameHistoryStore): Promise<void> {
  const nextStore = {
    undoBatches: trimBatches(store.undoBatches),
    redoBatches: trimBatches(store.redoBatches),
  };

  log.debug("Writing rename history store", {
    undoBatchCount: nextStore.undoBatches.length,
    redoBatchCount: nextStore.redoBatches.length,
  });

  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(nextStore));

  log.info("Rename history store saved", {
    undoBatchCount: nextStore.undoBatches.length,
    redoBatchCount: nextStore.redoBatches.length,
  });
}

export async function recordRenameBatch(renames: RenameEntry[]): Promise<void> {
  if (renames.length === 0) {
    log.info("Skipping history write because batch is empty");
    return;
  }

  log.step("Recording rename batch", { renameCount: renames.length, renames });

  const store = await readStore();
  const batch = {
    id: randomUUID(),
    createdAt: Date.now(),
    renames,
  };

  store.undoBatches.push(batch);
  store.redoBatches = [];
  store.undoBatches = trimBatches(store.undoBatches);

  await writeStore(store);

  log.info("Rename batch recorded", {
    batchId: batch.id,
    renameCount: batch.renames.length,
    undoBatchCount: store.undoBatches.length,
    redoBatchCount: store.redoBatches.length,
  });
}

export async function takeLatestUndoBatch(): Promise<RenameBatch | undefined> {
  log.step("Taking latest undo batch");

  const store = await readStore();
  const batch = store.undoBatches.pop();

  if (batch) {
    await writeStore(store);
    log.info("Took latest undo batch", {
      batchId: batch.id,
      renameCount: batch.renames.length,
      remainingUndoBatchCount: store.undoBatches.length,
    });
  } else {
    log.warn("No undo batch available");
  }

  return batch;
}

export async function returnUndoBatch(batch: RenameBatch): Promise<void> {
  log.step("Returning undo batch after failure", {
    batchId: batch.id,
    renameCount: batch.renames.length,
  });

  const store = await readStore();
  store.undoBatches.push(batch);
  store.undoBatches = trimBatches(store.undoBatches);
  await writeStore(store);
}

export async function pushRedoBatch(batch: RenameBatch): Promise<void> {
  log.step("Pushing batch onto redo stack", {
    batchId: batch.id,
    renameCount: batch.renames.length,
  });

  const store = await readStore();
  store.redoBatches.push(batch);
  store.redoBatches = trimBatches(store.redoBatches);
  await writeStore(store);
}

export async function takeLatestRedoBatch(): Promise<RenameBatch | undefined> {
  log.step("Taking latest redo batch");

  const store = await readStore();
  const batch = store.redoBatches.pop();

  if (batch) {
    await writeStore(store);
    log.info("Took latest redo batch", {
      batchId: batch.id,
      renameCount: batch.renames.length,
      remainingRedoBatchCount: store.redoBatches.length,
    });
  } else {
    log.warn("No redo batch available");
  }

  return batch;
}

export async function returnRedoBatch(batch: RenameBatch): Promise<void> {
  log.step("Returning redo batch after failure", {
    batchId: batch.id,
    renameCount: batch.renames.length,
  });

  const store = await readStore();
  store.redoBatches.push(batch);
  store.redoBatches = trimBatches(store.redoBatches);
  await writeStore(store);
}

export async function pushUndoBatch(batch: RenameBatch): Promise<void> {
  log.step("Pushing batch back onto undo stack", {
    batchId: batch.id,
    renameCount: batch.renames.length,
  });

  const store = await readStore();
  store.undoBatches.push(batch);
  store.undoBatches = trimBatches(store.undoBatches);
  await writeStore(store);
}

export const pushRenameBatch = recordRenameBatch;
