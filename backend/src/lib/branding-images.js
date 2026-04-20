import sharp from 'sharp';
import { createHttpError } from '../utils/http.js';

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

const BRANDING_IMAGE_PRESETS = {
  logo: {
    maxWidth: 1600,
    maxHeight: 1600,
    outputWidth: 700,
    outputHeight: 700
  },
  background: {
    maxWidth: 4000,
    maxHeight: 4000,
    outputWidth: 1920,
    outputHeight: 1080
  }
};

function ensureSupportedFile(file) {
  if (!file) {
    return;
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
    throw createHttpError(400, 'La imagen debe ser JPG, PNG o WEBP');
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw createHttpError(400, 'La imagen no debe superar 5 MB');
  }
}

export async function optimizeBrandingImage(file, kind = 'logo') {
  if (!file) {
    return null;
  }

  ensureSupportedFile(file);

  const preset = BRANDING_IMAGE_PRESETS[kind] || BRANDING_IMAGE_PRESETS.logo;

  try {
    const metadata = await sharp(file.buffer).metadata();

    if ((metadata.width || 0) > preset.maxWidth || (metadata.height || 0) > preset.maxHeight) {
      throw createHttpError(
        400,
        `La imagen no debe superar ${preset.maxWidth}x${preset.maxHeight} pixeles`
      );
    }

    const optimizedBuffer = await sharp(file.buffer)
      .rotate()
      .resize(preset.outputWidth, preset.outputHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({
        quality: 84
      })
      .toBuffer();

    return {
      dataUrl: `data:image/webp;base64,${optimizedBuffer.toString('base64')}`
    };
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    throw createHttpError(400, 'No fue posible procesar la imagen de configuracion');
  }
}
