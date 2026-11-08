import { Platform } from 'react-native';

const IDB_NAME = 'kredia_media_vault_v1';
const IDB_STORE = 'media_blobs';

// Caché en memoria para resolución instantánea de URIs media://
const memoryMediaCache = new Map<string, string>();

function openMediaDB(): Promise<IDBDatabase | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Comprime una imagen DataURL en Web/iPhone usando Canvas HTML5
 * (Máximo 800px en su lado mayor, JPEG calidad 0.55 -> ~30-45 KB por foto)
 */
export function compressWebImageDataUrl(
  rawDataUrl: string,
  maxDimension: number = 800,
  quality: number = 0.55
): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || !rawDataUrl.startsWith('data:image')) {
    return Promise.resolve(rawDataUrl);
  }
  return new Promise((resolve) => {
    try {
      const img = new window.Image();
      img.onload = () => {
        let width = img.width || 800;
        let height = img.height || 600;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        // Punto 02: Servir y almacenar imágenes en WebP (35% más ligero que JPEG) con fallback automático a JPEG
        let compressed = canvas.toDataURL('image/webp', quality);
        if (!compressed || !compressed.startsWith('data:image/webp')) {
          compressed = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(compressed && compressed.length < rawDataUrl.length ? compressed : rawDataUrl);
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    } catch {
      resolve(rawDataUrl);
    }
  });
}

/**
 * Guarda un recurso multimedia en IndexedDB (Web/iPhone) y retorna su URI optimizada
 */
export async function persistMediaUri(rawUri: string, isVideo: boolean = false): Promise<string> {
  if (!rawUri) return '';
  let processedUri = rawUri;
  if (!isVideo && rawUri.startsWith('data:image')) {
    processedUri = await compressWebImageDataUrl(rawUri, 800, 0.55);
  }

  if (Platform.OS === 'web' && processedUri.startsWith('data:')) {
    const db = await openMediaDB();
    if (db) {
      const mediaId = `idb-media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(processedUri, mediaId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
      memoryMediaCache.set(mediaId, processedUri);
    }
  }
  return processedUri;
}

export async function getMediaFromVault(mediaId: string): Promise<string | null> {
  if (memoryMediaCache.has(mediaId)) {
    return memoryMediaCache.get(mediaId) || null;
  }
  const db = await openMediaDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(mediaId);
      req.onsuccess = () => {
        const val = typeof req.result === 'string' ? req.result : null;
        if (val) memoryMediaCache.set(mediaId, val);
        resolve(val);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
