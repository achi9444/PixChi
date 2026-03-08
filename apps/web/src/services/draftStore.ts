export type DraftSnapshot = {
  projectName: string;
  activeGroupName: string;
  cols: number;
  rows: number;
  mode: 'fit' | 'lock' | 'pad';
  strategy: 'lab_nearest' | 'rgb_nearest';
  preMergeDeltaE?: number;
  showCode: boolean;
  exportScale: 1 | 2 | 3;
  cropToolEnabled: boolean;
  cropRect: { x: number; y: number; w: number; h: number } | null;
  imageDataUrl: string | null;
  imageMeta: string;
  gridMeta: string;
  converted: any | null;
};

type DraftVersion = {
  id: string;
  at: number;
  reason: 'manual' | 'autosave';
  note?: string;
  snapshot: DraftSnapshot;
};

type DraftRecord = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  latest: DraftSnapshot;
  versions: DraftVersion[];
};

export type DraftSummary = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  versionCount: number;
  versions: Array<{
    id: string;
    at: number;
    reason: 'manual' | 'autosave';
    note?: string;
  }>;
};

const DB_NAME = 'pixchi_local_drafts';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';
const INDEX_KEY = 'pixchi_local_draft_index_v1';
const MAX_DRAFTS = 3;
const MAX_VERSIONS = 20;

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('open indexeddb failed'));
  });
}

function txRequest<T = unknown>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb request failed'));
  });
}

function toSummary(r: DraftRecord): DraftSummary {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    versionCount: r.versions.length,
    versions: r.versions.map((v) => ({ id: v.id, at: v.at, reason: v.reason, note: v.note }))
  };
}

function makeId(prefix: string) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

async function readAllRecords() {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const all = (await txRequest(store.getAll())) as DraftRecord[];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    db.close();
  }
}

function writeIndexCache(rows: DraftSummary[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(rows));
  } catch {
    // ignore quota errors for index cache
  }
}

export async function listDrafts() {
  const rows = (await readAllRecords()).map(toSummary);
  writeIndexCache(rows);
  return rows;
}

export async function getDraftSnapshot(draftId: string, versionId?: string) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const found = (await txRequest(store.get(draftId))) as DraftRecord | undefined;
    if (!found) return null;
    if (!versionId) return found.latest;
    const v = found.versions.find((x) => x.id === versionId);
    return v?.snapshot ?? found.latest;
  } finally {
    db.close();
  }
}

export async function createDraft(name: string, snapshot: DraftSnapshot) {
  const rows = await readAllRecords();
  if (rows.length >= MAX_DRAFTS) {
    throw new Error('MAX_DRAFTS_REACHED');
  }
  const now = Date.now();
  const firstVersion: DraftVersion = {
    id: makeId('ver'),
    at: now,
    reason: 'manual',
    note: '初始版本',
    snapshot
  };
  const record: DraftRecord = {
    id: makeId('draft'),
    name,
    createdAt: now,
    updatedAt: now,
    latest: snapshot,
    versions: [firstVersion]
  };
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await txRequest(store.put(record));
  } finally {
    db.close();
  }
  return record.id;
}

export async function updateDraft(
  draftId: string,
  snapshot: DraftSnapshot,
  reason: 'manual' | 'autosave',
  nextName?: string,
  note?: string
) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const found = (await txRequest(store.get(draftId))) as DraftRecord | undefined;
    if (!found) throw new Error('DRAFT_NOT_FOUND');
    const now = Date.now();
    const nextVersion: DraftVersion = {
      id: makeId('ver'),
      at: now,
      reason,
      note,
      snapshot
    };
    const versions = [...found.versions, nextVersion].slice(-MAX_VERSIONS);
    const nextRecord: DraftRecord = {
      ...found,
      name: nextName ?? found.name,
      updatedAt: now,
      latest: snapshot,
      versions
    };
    await txRequest(store.put(nextRecord));
    return nextVersion.id;
  } finally {
    db.close();
  }
}

export async function renameDraft(draftId: string, name: string) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const found = (await txRequest(store.get(draftId))) as DraftRecord | undefined;
    if (!found) throw new Error('DRAFT_NOT_FOUND');
    const nextRecord: DraftRecord = {
      ...found,
      name: name.trim() || found.name,
      updatedAt: Date.now()
    };
    await txRequest(store.put(nextRecord));
  } finally {
    db.close();
  }
}

export async function setDraftVersionNote(draftId: string, versionId: string, note: string) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const found = (await txRequest(store.get(draftId))) as DraftRecord | undefined;
    if (!found) throw new Error('DRAFT_NOT_FOUND');
    const versions = found.versions.map((v) => (v.id === versionId ? { ...v, note } : v));
    const nextRecord: DraftRecord = {
      ...found,
      updatedAt: Date.now(),
      versions
    };
    await txRequest(store.put(nextRecord));
  } finally {
    db.close();
  }
}

export async function deleteDraft(draftId: string) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await txRequest(store.delete(draftId));
  } finally {
    db.close();
  }
}

export function getDraftLimit() {
  return MAX_DRAFTS;
}
