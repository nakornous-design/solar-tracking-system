"use client";

export type UploadRetryItem = {
  id: string;
  file: File;
  fileName: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
  payload: {
    folderId: string;
    milestoneName: string;
    projectId?: string;
    projectStageId: string;
    projectDocumentId?: string;
  };
};

const DB_NAME = "solar-upload-retry";
const STORE_NAME = "uploads";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = action(tx.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function listUploadRetryItems() {
  if (typeof indexedDB === "undefined") return [];
  return transact<UploadRetryItem[]>("readonly", (store) => store.getAll());
}

export async function enqueueUploadRetryItem(item: Omit<UploadRetryItem, "id" | "createdAt" | "attempts" | "fileName"> & { lastError?: string }) {
  if (typeof indexedDB === "undefined") return null;
  const record: UploadRetryItem = {
    ...item,
    id: crypto.randomUUID(),
    fileName: item.file.name,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  await transact("readwrite", (store) => store.put(record));
  return record;
}

export async function updateUploadRetryItem(item: UploadRetryItem) {
  if (typeof indexedDB === "undefined") return;
  await transact("readwrite", (store) => store.put(item));
}

export async function removeUploadRetryItem(id: string) {
  if (typeof indexedDB === "undefined") return;
  await transact("readwrite", (store) => store.delete(id));
}
