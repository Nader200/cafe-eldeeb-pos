/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { app } from './firebaseClient';

/**
 * Resizes and compresses an image Data URL to keep payload lightweight (< 150KB)
 */
export function compressImageDataUrl(dataUrl: string, maxWidth = 1024, maxHeight = 1024, quality = 0.75): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        if (width / height > maxWidth / maxHeight) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };

    img.onerror = () => {
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}

/**
 * Uploads receipt image to Firebase Storage if online, returning public URL or base64 fallback.
 */
export async function uploadReceiptImage(dataUrl: string, fileName = 'receipt'): Promise<string> {
  if (!dataUrl) return '';

  // Compress image first to optimize storage & sync bandwidth
  const compressed = await compressImageDataUrl(dataUrl);

  try {
    if (typeof window !== 'undefined' && navigator.onLine) {
      const storage = getStorage(app);
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 7);
      const storageRef = ref(storage, `receipts/${timestamp}_${randomStr}_${fileName}.jpg`);

      await uploadString(storageRef, compressed, 'data_url');
      const downloadUrl = await getDownloadURL(storageRef);
      if (downloadUrl) {
        return downloadUrl;
      }
    }
  } catch (error) {
    console.warn('Firebase Storage upload failed or offline. Using compressed base64 fallback:', error);
  }

  return compressed;
}
