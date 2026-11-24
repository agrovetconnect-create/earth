import * as FileSystem from 'expo-file-system/legacy';

/**
 * Reads a picked image/video as a `data:<mime>;base64,....` URL.
 *
 * The web build used FileReader; on React Native the Expo FileSystem module
 * reads the local file as base64. The server validates bytes by signature, so
 * only the mime label and payload matter.
 */

export interface PickedFile {
  uri: string;
  mimeType?: string;
  fileName?: string;
}

function mimeFromUri(uri: string, fallback?: string): string {
  if (fallback) return fallback;
  const match = /\.([a-z0-9]+)(?:\?|$)/i.exec(uri);
  const ext = match?.[1]?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
}

export function documentMimeType(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'ppt':
      return 'application/vnd.ms-powerpoint';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'odt':
      return 'application/vnd.oasis.opendocument.text';
    case 'ods':
      return 'application/vnd.oasis.opendocument.spreadsheet';
    case 'txt':
      return 'text/plain';
    case 'csv':
      return 'text/csv';
    default:
      return null;
  }
}

export async function fileToDataUrl(file: PickedFile): Promise<string> {
  const mimeType = mimeFromUri(file.uri, file.mimeType);
  const base64 = await FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `data:${mimeType};base64,${base64}`;
}

/** Strips the `data:` prefix, returning raw base64 (for APIs that expect it bare). */
export function dataUrlToBase64(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(',');
  return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
}

export function mimeFromDataUrl(dataUrl: string): string | undefined {
  const match = /^data:([^;,]+)/.exec(dataUrl);
  return match?.[1];
}
