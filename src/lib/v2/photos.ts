/**
 * Photos de progression — stockées UNIQUEMENT sur l'appareil (IndexedDB).
 *
 * Jamais dans le code du site (public), jamais envoyées au serveur : ce sont
 * des photos torse nu. Elles ne se synchronisent donc pas entre appareils —
 * les prendre et les consulter depuis l'iPhone.
 */

export type Pose = "face" | "profil" | "dos" | "autre";

export const POSES: { id: Pose; label: string }[] = [
  { id: "face", label: "Face" },
  { id: "profil", label: "Profil" },
  { id: "dos", label: "Dos" },
  { id: "autre", label: "Autre" },
];

export type ProgressPhoto = {
  id: string;
  /** AAAA-MM-JJ */
  date: string;
  pose: Pose;
  blob: Blob;
};

const DB_NAME = "coach-photos";
const STORE = "photos";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export function listPhotos(): Promise<ProgressPhoto[]> {
  return withStore<ProgressPhoto[]>("readonly", (store) => store.getAll() as IDBRequest<ProgressPhoto[]>).then((list) =>
    list.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
  );
}

export function savePhoto(photo: ProgressPhoto) {
  return withStore("readwrite", (store) => store.put(photo));
}

export function deletePhoto(id: string) {
  return withStore("readwrite", (store) => store.delete(id));
}

/** Redimensionne à 1280 px max et recompresse en JPEG (~150-300 Ko). */
export async function compressImage(file: File, maxSide = 1280, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", quality));
}

/** Demande au navigateur de ne pas purger ce stockage (iOS : app sur l'écran d'accueil). */
export function requestPersistence() {
  if (typeof navigator !== "undefined" && navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}
