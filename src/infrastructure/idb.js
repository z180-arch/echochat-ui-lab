// ============================================================
//  EchoChat Rebuild · IndexedDB (从 baseline 迁移为 ES Module)
//  DB: echodownload_assets / store: blobs { id, blob }
// ============================================================

const DB_NAME = "echodownload_assets";
const DB_VER = 2; // v2: 增加版本号，支持未来迁移
const STORE = "blobs";

const mem = new Map();
let dbPromise = null;
let persistent = true;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!globalThis.indexedDB) {
      persistent = false;
      resolve(null);
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VER);
    } catch (e) {
      persistent = false;
      resolve(null);
      return;
    }
    req.onerror = () => {
      persistent = false;
      resolve(null);
    };
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      // v2 迁移：未来可在这里加索引
      if (e.oldVersion < 2) {
        // 预留：添加元数据索引等
      }
    };
    req.onsuccess = () => {
      persistent = true;
      resolve(req.result);
    };
  });
  return dbPromise;
}

export function isPersistent() {
  return persistent;
}

export async function putBlob(id, blob) {
  if (!id || !blob) return;
  const db = await openDB();
  if (!db) {
    mem.set(id, blob);
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ id, blob });
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        mem.set(id, blob);
        resolve();
      };
    } catch (e) {
      mem.set(id, blob);
      resolve();
    }
  });
}

export async function getBlob(id) {
  if (!id) return null;
  if (mem.has(id)) return mem.get(id);
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => {
        const row = req.result;
        resolve(row && row.blob ? row.blob : null);
      };
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

export async function deleteBlob(id) {
  if (!id) return;
  mem.delete(id);
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

export async function listBlobIds() {
  const ids = new Set(mem.keys());
  const db = await openDB();
  if (!db) return [...ids];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => {
        (req.result || []).forEach((k) => ids.add(k));
        resolve([...ids]);
      };
      req.onerror = () => resolve([...ids]);
    } catch (e) {
      resolve([...ids]);
    }
  });
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error("read fail"));
    r.readAsDataURL(blob);
  });
}

export function dataURLToBlob(dataURL) {
  return fetch(dataURL)
    .then((r) => r.blob())
    .catch(() => {
      const m = String(dataURL).match(/^data:([^;,]+)?(;base64)?,(.*)$/i);
      if (!m) return new Blob();
      const mime = m[1] || "application/octet-stream";
      const b64 = !!m[2];
      const data = m[3] || "";
      if (b64) {
        const bin = atob(data);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
      }
      return new Blob([decodeURIComponent(data)], { type: mime });
    });
}

export async function ingestImage(file, prefix = "img_", maxSide = 512, quality = 0.82) {
  if (!file) return "";
  // SVG 不压缩
  if ((file.type || "").includes("svg")) {
    const key = prefix + Date.now().toString(36);
    await putBlob(key, file);
    return key;
  }
  const blob = await compressImage(file, maxSide, quality);
  await openDB();
  if (!isPersistent()) {
    try {
      return await blobToDataURL(blob);
    } catch (e) {
      return "";
    }
  }
  const key = prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await putBlob(key, blob);
  return key;
}

function compressImage(file, maxSide, quality) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      const scale = Math.min(1, maxSide / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      try {
        canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => resolve(b || file), "image/jpeg", quality);
      } catch (e) {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

openDB();

export const EchoIDB = {
  openDB,
  putBlob,
  getBlob,
  deleteBlob,
  listBlobIds,
  blobToDataURL,
  dataURLToBlob,
  isPersistent,
  ingestImage,
};

/** Alias used by Legacy Adapter / Asset Repository */
export const idb = EchoIDB;
