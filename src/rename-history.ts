import { LocalStorage } from "@raycast/api";

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

  return batches.slice(-MAX_BATCHES);
}

async function readStore(): Promise<RenameHistoryStore> {
  const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<RenameHistoryStore>;
      if (Array.isArray(parsed.undoBatches) && Array.isArray(parsed.redoBatches)) {
        return {
          undoBatches: parsed.undoBatches,
          redoBatches: parsed.redoBatches,
        };
      }
    } catch {
      return emptyStore();
    }
  }

  const legacyRaw = await LocalStorage.getItem<string>(LEGACY_STORAGE_KEY);
  if (!legacyRaw) {
    return emptyStore();
  }

  try {
    const legacy = JSON.parse(legacyRaw) as { batches?: RenameBatch[] };
    if (!Array.isArray(legacy.batches)) {
      return emptyStore();
    }

    const store = { undoBatches: legacy.batches, redoBatches: [] };
    await writeStore(store);
    await LocalStorage.removeItem(LEGACY_STORAGE_KEY);
    return store;
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: RenameHistoryStore): Promise<void> {
  await LocalStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      undoBatches: trimBatches(store.undoBatches),
      redoBatches: trimBatches(store.redoBatches),
    }),
  );
}

export async function recordRenameBatch(renames: RenameEntry[]): Promise<void> {
  if (renames.length === 0) {
    return;
  }

  const store = await readStore();
  store.undoBatches.push({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    renames,
  });
  store.redoBatches = [];
  store.undoBatches = trimBatches(store.undoBatches);

  await writeStore(store);
}

export async function takeLatestUndoBatch(): Promise<RenameBatch | undefined> {
  const store = await readStore();
  const batch = store.undoBatches.pop();

  if (batch) {
    await writeStore(store);
  }

  return batch;
}

export async function returnUndoBatch(batch: RenameBatch): Promise<void> {
  const store = await readStore();
  store.undoBatches.push(batch);
  store.undoBatches = trimBatches(store.undoBatches);
  await writeStore(store);
}

export async function pushRedoBatch(batch: RenameBatch): Promise<void> {
  const store = await readStore();
  store.redoBatches.push(batch);
  store.redoBatches = trimBatches(store.redoBatches);
  await writeStore(store);
}

export async function takeLatestRedoBatch(): Promise<RenameBatch | undefined> {
  const store = await readStore();
  const batch = store.redoBatches.pop();

  if (batch) {
    await writeStore(store);
  }

  return batch;
}

export async function returnRedoBatch(batch: RenameBatch): Promise<void> {
  const store = await readStore();
  store.redoBatches.push(batch);
  store.redoBatches = trimBatches(store.redoBatches);
  await writeStore(store);
}

export async function pushUndoBatch(batch: RenameBatch): Promise<void> {
  const store = await readStore();
  store.undoBatches.push(batch);
  store.undoBatches = trimBatches(store.undoBatches);
  await writeStore(store);
}

export const pushRenameBatch = recordRenameBatch;
