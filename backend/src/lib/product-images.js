import sharp from 'sharp';
import { createHttpError } from '../utils/http.js';

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_WIDTH = 500;
const MAX_HEIGHT = 500;
const OUTPUT_WIDTH = 640;
const OUTPUT_HEIGHT = 640;
const OUTPUT_QUALITY = 82;

export async function ensureValidProductImage(file) {
  if (!file) {
    return null;
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
    throw createHttpError(400, 'La imagen debe ser JPG, PNG o WEBP');
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw createHttpError(400, 'La imagen no debe superar 5 MB');
  }

  try {
    const metadata = await sharp(file.buffer).metadata();
    if (metadata.width > MAX_WIDTH || metadata.height > MAX_HEIGHT) {
      throw createHttpError(400, 'La imagen no debe superar 500x500 píxeles');
    }
  } catch (error) {
    throw createHttpError(400, 'No fue posible validar la imagen');
  }

  return file;
}

export async function optimizeProductImage(file) {
  if (!file) {
    return null;
  }

  await ensureValidProductImage(file);

  try {
    const optimizedBuffer = await sharp(file.buffer)
      .rotate()
      .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({
        quality: OUTPUT_QUALITY
      })
      .toBuffer();

    return {
      image_blob: optimizedBuffer,
      image_mime_type: 'image/webp',
      image_size_bytes: optimizedBuffer.length
    };
  } catch (_error) {
    throw createHttpError(400, 'No fue posible procesar la imagen del producto');
  }
}

export function buildProductImageDataUrl(product) {
  if (!product?.image_blob) {
    return null;
  }

  const mimeType = product.image_mime_type || 'image/webp';
  return `data:${mimeType};base64,${product.image_blob.toString('base64')}`;
}
