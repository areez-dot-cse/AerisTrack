// Shrinks a camera photo before it is queued: at most 1280px on the long edge,
// re-encoded as JPEG at quality 0.6. Cheap phones and patchy networks both benefit.
const MAX_EDGE = 1280;
const QUALITY = 0.6;

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file); } catch { /* fall through */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read the photo')); };
    image.src = url;
  });
}

export async function compressPhoto(file) {
  try {
    const bitmap = await loadBitmap(file);
    const width = bitmap.width ?? bitmap.naturalWidth;
    const height = bitmap.height ?? bitmap.naturalHeight;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    return blob ?? file;
  } catch {
    return file; // the server still checks type and size
  }
}
