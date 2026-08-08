/**
 * Client-side landscape check + compress for catalog photo uploads.
 * Server still hard-rejects >1MB and non-landscape images.
 */

const MAX_BYTES = 1 * 1024 * 1024;
const MIN_LANDSCAPE_RATIO = 1.2;
const MAX_EDGE = 1600;

export function filenameSkuPrefix(filename) {
  const base = String(filename || '').split(/[/\\]/).pop() || '';
  const noExt = base.replace(/\.[^.]+$/, '');
  const m = noExt.match(/^([A-Za-z0-9]+)/);
  return (m ? m[1] : '').toLowerCase();
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read this image'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * @returns {Promise<{ file: File, width: number, height: number }>}
 */
export async function prepareCatalogImage(file) {
  if (!file) throw Object.assign(new Error('No file'), { code: 'no_file' });

  const img = await loadImageFromFile(file);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) {
    throw Object.assign(new Error('Could not read image dimensions'), { code: 'invalid_image' });
  }
  if (width <= height * MIN_LANDSCAPE_RATIO) {
    throw Object.assign(
      new Error('This photo looks like portrait/square — please upload a landscape photo'),
      { code: 'not_landscape', width, height },
    );
  }

  const mime = String(file.type || 'image/jpeg').toLowerCase();
  const outType = mime === 'image/png' || mime === 'image/webp' ? mime : 'image/jpeg';

  let targetW = width;
  let targetH = height;
  const longest = Math.max(width, height);
  if (longest > MAX_EDGE) {
    const scale = MAX_EDGE / longest;
    targetW = Math.max(1, Math.round(width * scale));
    targetH = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const qualities = outType === 'image/jpeg' || outType === 'image/webp'
    ? [0.85, 0.8, 0.75, 0.7]
    : [0.92, 0.85, 0.8];

  let blob = null;
  for (const q of qualities) {
    blob = await canvasToBlob(canvas, outType, q);
    if (blob && blob.size <= MAX_BYTES) break;
  }

  if (!blob) {
    throw Object.assign(new Error('Could not compress this image'), { code: 'compress_failed' });
  }
  if (blob.size > MAX_BYTES) {
    throw Object.assign(
      new Error('Could not get this photo under 1MB — try a smaller landscape photo'),
      { code: 'too_large' },
    );
  }

  const safeName = String(file.name || 'photo.jpg').replace(/[^\w.\-]+/g, '_');
  const outFile = new File([blob], safeName, { type: outType, lastModified: Date.now() });
  return { file: outFile, width: targetW, height: targetH };
}

/**
 * Upload one prepared image. Returns { url, original_filename }.
 */
export async function uploadCatalogImage(apiClient, preparedFile, originalFilename) {
  const form = new FormData();
  form.append('image', preparedFile, preparedFile.name || originalFilename || 'photo.jpg');
  // apiClient defaults to Content-Type: application/json — must clear it so the
  // browser/axios set multipart/form-data WITH boundary, or multer sees no file.
  const res = await apiClient.post('/api/catalog/upload-image', form, {
    headers: { 'Content-Type': undefined },
    transformRequest: [(data, headers) => {
      if (typeof FormData !== 'undefined' && data instanceof FormData) {
        if (headers && typeof headers === 'object') {
          delete headers['Content-Type'];
          if (headers.common) delete headers.common['Content-Type'];
          if (headers.post) delete headers.post['Content-Type'];
        }
      }
      return data;
    }],
  });
  return {
    url: res.data?.url,
    original_filename: res.data?.original_filename || originalFilename || preparedFile.name,
  };
}

const IMAGE_SLOTS = ['image_url', 'image_url_2', 'image_url_3', 'image_url_4', 'image_url_5'];

/**
 * Attach url to first empty image slot on matching row.
 * Filename prefix vs row.id / row.sku. Cap 5 slots; overflow does not overwrite.
 */
export function assignImageToUploadRows(rows, originalFilename, url) {
  const prefix = filenameSkuPrefix(originalFilename);
  if (!prefix) return { rows, status: 'no_match' };

  const next = rows.map((r) => ({ ...r }));
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  let best = next.findIndex((r) => {
    const id = norm(r.id);
    const sku = norm(r.sku);
    return (id && id === prefix) || (sku && sku === prefix);
  });
  if (best < 0) {
    best = next.findIndex((r) => {
      const id = norm(r.id);
      const sku = norm(r.sku);
      return (id && id.startsWith(prefix)) || (sku && sku.startsWith(prefix));
    });
  }
  if (best < 0) return { rows, status: 'no_match' };

  const row = { ...next[best] };
  for (const slot of IMAGE_SLOTS) {
    if (!row[slot]) {
      row[slot] = url;
      next[best] = row;
      return { rows: next, status: 'matched', rowIndex: best, slot };
    }
  }
  return { rows, status: 'overflow', rowIndex: best };
}
