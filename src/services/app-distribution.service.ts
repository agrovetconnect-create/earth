import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { logger } from '../utils/logger.js';
import { supabase } from '../config/supabase.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';

export type DistributionMode = 'apk' | 'play_store' | 'both';
export type ApkSignatureScheme = 'v1' | 'v2_or_v3' | 'v1+v2_or_v3';

export interface AppDistributionConfig {
  mode: DistributionMode;
  is_play_store_active: boolean;
  is_get_app_sidebar_visible: boolean;
  is_whatsapp_sidebar_visible: boolean;
  whatsapp_number: string;
  play_store_url: string;
  version_name: string;
  version_code: number;
  package_name: string;
  min_android: string;
  apk_filename: string;
  apk_size_bytes: number;
  apk_sha256: string;
  release_notes: string;
  download_count: number;
  updated_at: string;
  updated_by: string;
}

export interface VerifiedApkInspection {
  packageName: string;
  signatureScheme: ApkSignatureScheme;
  entryCount: number;
}

export interface VerifiedApkDownload {
  filename: string;
  sizeBytes: number;
  sha256: string;
  buffer?: Buffer;
  filePath?: string;
}

interface ZipCentralEntry {
  name: string;
  compressionMethod: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const CONFIG_PATH = path.resolve(process.cwd(), 'src/data/app-distribution.json');
const DOWNLOADS_DIR = path.resolve(process.cwd(), 'public/downloads');
const APK_PATH = path.join(DOWNLOADS_DIR, 'earthtalk.apk');
const APP_RELEASES_BUCKET = 'app-releases';

export const MIN_VALID_APK_BYTES = 100 * 1024;
const EXPECTED_ANDROID_PACKAGE = 'org.earthtalk.mobile';
const MAX_MANIFEST_UNCOMPRESSED_BYTES = 10 * 1024 * 1024;
const MAX_DEX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_SIGNATURE_ENTRY_BYTES = 2 * 1024 * 1024;

const ZIP_LOCAL_FILE_HEADER_SIG = 0x04034b50;
const ZIP_CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const ZIP_EOCD_SIG = 0x06054b50;
const APK_SIG_BLOCK_MAGIC = Buffer.from('APK Sig Block 42', 'ascii');
const APK_SIG_SCHEME_V2_ID = 0x7109871a;
const APK_SIG_SCHEME_V3_ID = 0xf05368c0;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function computeCrc32(buf: Buffer): number {
  if (typeof (zlib as { crc32?: (data: Buffer) => number }).crc32 === 'function') {
    return (zlib as { crc32: (data: Buffer) => number }).crc32(buf) >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Sanitizes an APK filename for safe storage paths and HTTP Content-Disposition headers.
 */
export function sanitizeApkFilename(raw: string): string {
  const base = path.basename(String(raw || 'earthtalk.apk').replace(/\\/g, '/'));
  const cleaned = base
    .replace(/[\r\n"\0]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^_+/, '');
  if (!cleaned) return 'earthtalk.apk';
  return cleaned.toLowerCase().endsWith('.apk') ? cleaned : `${cleaned}.apk`;
}

function extractZipEntry(
  buf: Buffer,
  entry: ZipCentralEntry,
  centralDirOffset: number,
  maxOutputBytes: number
): Buffer {
  const lfh = entry.localHeaderOffset;
  if (lfh < 0 || lfh + 30 > centralDirOffset) {
    throw new Error(
      `INVALID_APK_ARCHIVE: Local file header out of bounds for entry "${entry.name}".`
    );
  }
  if (buf.readUInt32LE(lfh) !== ZIP_LOCAL_FILE_HEADER_SIG) {
    throw new Error(
      `INVALID_APK_ARCHIVE: Corrupt local file header signature for entry "${entry.name}".`
    );
  }
  const nameLen = buf.readUInt16LE(lfh + 26);
  const extraLen = buf.readUInt16LE(lfh + 28);
  const dataStart = lfh + 30 + nameLen + extraLen;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataStart < 0 || dataEnd > centralDirOffset) {
    throw new Error(`INVALID_APK_ARCHIVE: Entry "${entry.name}" payload exceeds archive bounds.`);
  }
  if (entry.uncompressedSize > maxOutputBytes) {
    throw new Error(`INVALID_APK_ARCHIVE: Entry "${entry.name}" exceeds maximum allowed size.`);
  }

  const compressedSlice = buf.subarray(dataStart, dataEnd);
  let uncompressed: Buffer;
  if (entry.compressionMethod === 0) {
    uncompressed = compressedSlice;
  } else if (entry.compressionMethod === 8) {
    try {
      uncompressed = zlib.inflateRawSync(compressedSlice, { maxOutputLength: maxOutputBytes });
    } catch {
      throw new Error(`INVALID_APK_ARCHIVE: Failed to decompress entry "${entry.name}".`);
    }
  } else {
    throw new Error(
      `INVALID_APK_ARCHIVE: Unsupported ZIP compression method ${entry.compressionMethod} for "${entry.name}".`
    );
  }

  if (uncompressed.length !== entry.uncompressedSize) {
    throw new Error(`INVALID_APK_ARCHIVE: Uncompressed size mismatch for "${entry.name}".`);
  }

  const actualCrc = computeCrc32(uncompressed);
  if (actualCrc !== entry.crc32) {
    throw new Error(`INVALID_APK_ARCHIVE: CRC-32 checksum mismatch for "${entry.name}".`);
  }

  return uncompressed;
}

function hasValidApkV2OrV3SigningBlock(buf: Buffer, centralDirOffset: number): boolean {
  if (centralDirOffset < 32) return false;
  const magicSlice = buf.subarray(centralDirOffset - 16, centralDirOffset);
  if (!magicSlice.equals(APK_SIG_BLOCK_MAGIC)) {
    return false;
  }

  const sizeInFooter = buf.readBigUInt64LE(centralDirOffset - 24);
  if (sizeInFooter < 24n || sizeInFooter > BigInt(centralDirOffset - 8)) {
    throw new Error('INVALID_APK_ARCHIVE: INVALID_APK_SIGNATURE — Malformed APK Signing Block footer size.');
  }

  const blockStart = centralDirOffset - Number(sizeInFooter) - 8;
  if (blockStart < 0) {
    throw new Error('INVALID_APK_ARCHIVE: INVALID_APK_SIGNATURE — APK Signing Block underflows archive.');
  }

  const sizeInHeader = buf.readBigUInt64LE(blockStart);
  if (sizeInHeader !== sizeInFooter) {
    throw new Error('INVALID_APK_ARCHIVE: INVALID_APK_SIGNATURE — APK Signing Block header/footer size mismatch.');
  }

  let cursor = blockStart + 8;
  const pairsEnd = centralDirOffset - 24;
  let foundSchemeV2OrV3 = false;

  while (cursor < pairsEnd) {
    if (cursor + 12 > pairsEnd) {
      throw new Error('INVALID_APK_ARCHIVE: INVALID_APK_SIGNATURE — Truncated APK Signing Block pair.');
    }
    const pairLenBig = buf.readBigUInt64LE(cursor);
    if (pairLenBig < 4n || pairLenBig > BigInt(pairsEnd - cursor - 8)) {
      throw new Error('INVALID_APK_ARCHIVE: INVALID_APK_SIGNATURE — Out-of-bounds APK Signing Block pair.');
    }
    const pairLen = Number(pairLenBig);
    const pairId = buf.readUInt32LE(cursor + 8);
    const valueLen = pairLen - 4;
    if (pairId === APK_SIG_SCHEME_V2_ID || pairId === APK_SIG_SCHEME_V3_ID) {
      if (valueLen < 32) {
        throw new Error('INVALID_APK_ARCHIVE: INVALID_APK_SIGNATURE — Empty or truncated v2/v3 signer block.');
      }
      foundSchemeV2OrV3 = true;
    }
    cursor += 8 + pairLen;
  }

  if (cursor !== pairsEnd) {
    throw new Error('INVALID_APK_ARCHIVE: INVALID_APK_SIGNATURE — Misaligned APK Signing Block pairs.');
  }

  return foundSchemeV2OrV3;
}

/**
 * Inspects and verifies an Android APK binary buffer:
 * - Minimum valid size and ZIP local header magic
 * - Authentic ZIP End of Central Directory & Central Directory walk (rejecting duplicate entries)
 * - Presence, decompression, and IEEE CRC-32 verification of AndroidManifest.xml and classes.dex
 * - Expected Android package identifier (org.earthtalk.mobile) in UTF-8 or UTF-16LE AXML string pool
 * - Cryptographic APK Signature Scheme v2/v3 block or JAR v1 META-INF signature entries
 */
export function inspectAndVerifyApkBuffer(
  buf: Buffer,
  options?: { expectedPackage?: string; minBytes?: number }
): VerifiedApkInspection {
  const expectedPackage = options?.expectedPackage ?? EXPECTED_ANDROID_PACKAGE;
  const minBytes = options?.minBytes ?? MIN_VALID_APK_BYTES;

  if (!Buffer.isBuffer(buf) || buf.length < minBytes) {
    throw new Error(
      `INVALID_APK_ARCHIVE: Uploaded file is smaller than minimum valid APK threshold (${minBytes} bytes).`
    );
  }

  if (buf.readUInt32LE(0) !== ZIP_LOCAL_FILE_HEADER_SIG) {
    throw new Error('INVALID_APK_ARCHIVE: Missing PKZip local file header signature.');
  }

  let eocdOffset = -1;
  const minEocdOffset = Math.max(0, buf.length - 65557);
  for (let pos = buf.length - 22; pos >= minEocdOffset; pos--) {
    if (buf.readUInt32LE(pos) === ZIP_EOCD_SIG) {
      const commentLen = buf.readUInt16LE(pos + 20);
      if (pos + 22 + commentLen === buf.length) {
        eocdOffset = pos;
        break;
      }
    }
  }

  if (eocdOffset < 0) {
    throw new Error('INVALID_APK_ARCHIVE: Missing or corrupt ZIP End of Central Directory record.');
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buf.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  if (
    totalEntries === 0 ||
    centralDirSize === 0 ||
    centralDirOffset >= eocdOffset ||
    centralDirOffset + centralDirSize > eocdOffset
  ) {
    throw new Error('INVALID_APK_ARCHIVE: Invalid ZIP Central Directory bounds.');
  }

  const entries = new Map<string, ZipCentralEntry>();
  let cdCursor = centralDirOffset;
  const cdEnd = centralDirOffset + centralDirSize;

  for (let i = 0; i < totalEntries; i++) {
    if (cdCursor + 46 > cdEnd || buf.readUInt32LE(cdCursor) !== ZIP_CENTRAL_DIR_HEADER_SIG) {
      throw new Error('INVALID_APK_ARCHIVE: Corrupt ZIP Central Directory entry header.');
    }

    const compressionMethod = buf.readUInt16LE(cdCursor + 10);
    const crc32 = buf.readUInt32LE(cdCursor + 16) >>> 0;
    const compressedSize = buf.readUInt32LE(cdCursor + 20);
    const uncompressedSize = buf.readUInt32LE(cdCursor + 24);
    const fileNameLen = buf.readUInt16LE(cdCursor + 28);
    const extraFieldLen = buf.readUInt16LE(cdCursor + 30);
    const fileCommentLen = buf.readUInt16LE(cdCursor + 32);
    const localHeaderOffset = buf.readUInt32LE(cdCursor + 42);

    const headerEnd = cdCursor + 46 + fileNameLen + extraFieldLen + fileCommentLen;
    if (headerEnd > cdEnd) {
      throw new Error('INVALID_APK_ARCHIVE: Truncated ZIP Central Directory entry metadata.');
    }

    const entryName = buf.subarray(cdCursor + 46, cdCursor + 46 + fileNameLen).toString('utf8');
    if (entries.has(entryName)) {
      throw new Error(`INVALID_APK_ARCHIVE: Duplicate ZIP entry "${entryName}" rejected.`);
    }

    const lfh = localHeaderOffset;
    if (lfh + 30 > centralDirOffset || buf.readUInt32LE(lfh) !== ZIP_LOCAL_FILE_HEADER_SIG) {
      throw new Error(`INVALID_APK_ARCHIVE: Invalid local file header for "${entryName}".`);
    }
    const localNameLen = buf.readUInt16LE(lfh + 26);
    const localExtraLen = buf.readUInt16LE(lfh + 28);
    if (lfh + 30 + localNameLen + localExtraLen + compressedSize > centralDirOffset) {
      throw new Error(`INVALID_APK_ARCHIVE: Entry "${entryName}" overflows ZIP data region.`);
    }

    entries.set(entryName, {
      name: entryName,
      compressionMethod,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    cdCursor = headerEnd;
  }

  const manifestEntry = entries.get('AndroidManifest.xml');
  const dexEntry = entries.get('classes.dex');
  if (!manifestEntry || manifestEntry.uncompressedSize === 0) {
    throw new Error('INVALID_APK_ARCHIVE: Missing AndroidManifest.xml in APK Central Directory.');
  }
  if (!dexEntry || dexEntry.uncompressedSize < 8) {
    throw new Error('INVALID_APK_ARCHIVE: Missing classes.dex bytecode in APK Central Directory.');
  }

  const manifestBytes = extractZipEntry(
    buf,
    manifestEntry,
    centralDirOffset,
    MAX_MANIFEST_UNCOMPRESSED_BYTES
  );
  const dexBytes = extractZipEntry(buf, dexEntry, centralDirOffset, MAX_DEX_UNCOMPRESSED_BYTES);

  if (
    dexBytes[0] !== 0x64 ||
    dexBytes[1] !== 0x65 ||
    dexBytes[2] !== 0x78 ||
    dexBytes[3] !== 0x0a
  ) {
    throw new Error('INVALID_APK_ARCHIVE: classes.dex does not carry a valid Dalvik/ART dex header.');
  }

  if (expectedPackage) {
    const pkgUtf8 = Buffer.from(expectedPackage, 'utf8');
    const pkgUtf16Le = Buffer.from(expectedPackage, 'utf16le');
    if (!manifestBytes.includes(pkgUtf8) && !manifestBytes.includes(pkgUtf16Le)) {
      throw new Error(
        `INVALID_APK_ARCHIVE: AndroidManifest.xml package does not match expected "${expectedPackage}".`
      );
    }
  }

  const hasV2OrV3 = hasValidApkV2OrV3SigningBlock(buf, centralDirOffset);

  const manifestMf = entries.get('META-INF/MANIFEST.MF');
  let sfEntry: ZipCentralEntry | undefined;
  let certBlockEntry: ZipCentralEntry | undefined;
  for (const [name, entry] of entries.entries()) {
    const upper = name.toUpperCase();
    if (!upper.startsWith('META-INF/') || upper.indexOf('/', 9) !== -1) continue;
    if (upper.endsWith('.SF') && entry.uncompressedSize > 0) {
      sfEntry = entry;
    } else if (
      (upper.endsWith('.RSA') || upper.endsWith('.DSA') || upper.endsWith('.EC')) &&
      entry.uncompressedSize > 0
    ) {
      certBlockEntry = entry;
    }
  }

  let hasV1 = false;
  if (manifestMf && manifestMf.uncompressedSize > 0 && sfEntry && certBlockEntry) {
    extractZipEntry(buf, manifestMf, centralDirOffset, MAX_SIGNATURE_ENTRY_BYTES);
    extractZipEntry(buf, sfEntry, centralDirOffset, MAX_SIGNATURE_ENTRY_BYTES);
    extractZipEntry(buf, certBlockEntry, centralDirOffset, MAX_SIGNATURE_ENTRY_BYTES);
    hasV1 = true;
  }

  if (!hasV2OrV3 && !hasV1) {
    throw new Error(
      'INVALID_APK_ARCHIVE: INVALID_APK_SIGNATURE — Uploaded APK is unsigned. Sign the release APK with APK Signature Scheme v2/v3 or JAR v1 before uploading.'
    );
  }

  const signatureScheme: ApkSignatureScheme =
    hasV1 && hasV2OrV3 ? 'v1+v2_or_v3' : hasV2OrV3 ? 'v2_or_v3' : 'v1';

  return {
    packageName: expectedPackage,
    signatureScheme,
    entryCount: entries.size,
  };
}

const DEFAULT_CONFIG: AppDistributionConfig = {
  mode: 'apk',
  is_play_store_active: false,
  is_get_app_sidebar_visible: false,
  is_whatsapp_sidebar_visible: false,
  whatsapp_number: '',
  play_store_url: 'https://play.google.com/store/apps/details?id=org.earthtalk.mobile',
  version_name: 'v1.0.0',
  version_code: 1,
  package_name: EXPECTED_ANDROID_PACKAGE,
  min_android: 'Android 8.0 (API 26)+',
  apk_filename: 'earthtalk.apk',
  apk_size_bytes: 0,
  apk_sha256: '',
  release_notes:
    'Official Earth Talk Android release:\n• Offline geological specimen recording\n• Instant rock, mineral & outcrop GeoAI analysis\n• High-precision GPS waypoint logging\n• Automatic WhatsApp & community cloud sync',
  download_count: 0,
  updated_at: new Date().toISOString(),
  updated_by: 'Super Admin',
};

/**
 * Checks if a real, verified signed production APK exists on local disk.
 * Never serves or fabricates dummy or unsigned placeholder archives.
 */
function getValidLocalApkBuffer(): { path: string; buffer: Buffer } | null {
  try {
    if (!fs.existsSync(APK_PATH)) return null;
    const stats = fs.statSync(APK_PATH);
    if (stats.size < MIN_VALID_APK_BYTES) return null;
    const buffer = fs.readFileSync(APK_PATH);
    inspectAndVerifyApkBuffer(buffer);
    return { path: APK_PATH, buffer };
  } catch (err) {
    logger.warn('Rejected invalid or unsigned local APK on disk', { error: String(err) });
    return null;
  }
}

export class AppDistributionService {
  private configCache: AppDistributionConfig | null = null;

  constructor() {
    // Never fabricate starter or placeholder APK files
  }

  /**
   * Retrieves the local base distribution configuration reconciled against verified local APK state.
   */
  getConfig(): AppDistributionConfig {
    if (!this.configCache) {
      try {
        if (fs.existsSync(CONFIG_PATH)) {
          const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
          this.configCache = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
        } else {
          this.configCache = { ...DEFAULT_CONFIG };
          this.saveConfigToDisk(this.configCache);
        }
      } catch (err) {
        logger.error('Error reading app distribution config, using defaults', {
          error: String(err),
        });
        this.configCache = { ...DEFAULT_CONFIG };
      }
    }

    const config: AppDistributionConfig = { ...(this.configCache ?? DEFAULT_CONFIG) };
    const validLocal = getValidLocalApkBuffer();

    if (validLocal) {
      config.apk_filename = sanitizeApkFilename(config.apk_filename || 'earthtalk.apk');
      if (config.apk_size_bytes !== validLocal.buffer.length || !config.apk_sha256) {
        config.apk_size_bytes = validLocal.buffer.length;
        config.apk_sha256 = crypto
          .createHash('sha256')
          .update(validLocal.buffer)
          .digest('hex');
      }
    } else {
      config.apk_size_bytes = 0;
      config.apk_sha256 = '';
    }

    this.configCache = config;
    return { ...config };
  }

  /**
   * Retrieves public distribution status backed by durable PostgreSQL + Supabase Storage
   * when configured, falling back to verified local disk state in development.
   */
  async getPublicStatus(): Promise<{ config: AppDistributionConfig; apkAvailable: boolean }> {
    const base = this.getConfig();

    if (isDatabaseConfigured()) {
      const { data, error } = await (supabase.from('app_releases' as any) as any)
        .select('*')
        .eq('is_current', true)
        .maybeSingle();

      if (error) {
        const msg = error.message || '';
        if (msg.includes('app_releases') && msg.includes('schema cache')) {
          logger.info('app_releases table not yet migrated; falling back to local distribution config');
        } else {
          logger.error('Failed to query current APK release from database', {
            error: msg,
          });
          throw new ServiceUnavailableError('App distribution release catalog is temporarily unavailable.');
        }
      } else if (data && data.storage_bucket && data.storage_object_path) {
        const merged: AppDistributionConfig = {
          ...base,
          version_name: data.version_name || base.version_name,
          version_code: Number(data.version_code) || base.version_code,
          package_name: data.package_name || EXPECTED_ANDROID_PACKAGE,
          apk_filename: sanitizeApkFilename(data.local_filename || 'earthtalk.apk'),
          apk_size_bytes: Number(data.file_size_bytes) || 0,
          apk_sha256: data.sha256 || '',
          release_notes: data.release_notes || base.release_notes,
          updated_at: data.uploaded_at || base.updated_at,
          updated_by: data.uploaded_by || base.updated_by,
        };
        return {
          config: merged,
          apkAvailable: merged.apk_size_bytes >= MIN_VALID_APK_BYTES && Boolean(merged.apk_sha256),
        };
      }

      return {
        config: {
          ...base,
          apk_size_bytes: 0,
          apk_sha256: '',
        },
        apkAvailable: false,
      };
    }

    const validPath = this.getApkPath();
    return {
      config: base,
      apkAvailable: Boolean(validPath),
    };
  }

  /**
   * Loads and cryptographically verifies the active APK release for download.
   */
  async loadVerifiedApkDownload(): Promise<VerifiedApkDownload | null> {
    if (isDatabaseConfigured()) {
      const { data, error } = await (supabase.from('app_releases' as any) as any)
        .select('*')
        .eq('is_current', true)
        .maybeSingle();

      if (error) {
        const msg = error.message || '';
        if (msg.includes('app_releases') && msg.includes('schema cache')) {
          logger.info('app_releases table not yet migrated for download; falling back to local disk APK');
        } else {
          logger.error('Failed to query current APK release for download', {
            error: msg,
          });
          throw new ServiceUnavailableError('App distribution release catalog is temporarily unavailable.');
        }
      } else if (!data || !data.storage_bucket || !data.storage_object_path) {
        return null;
      } else {
        const { data: blob, error: storageErr } = await supabase.storage
          .from(data.storage_bucket)
          .download(data.storage_object_path);

        if (storageErr || !blob) {
          logger.error('Failed to download APK from durable storage bucket', {
            bucket: data.storage_bucket,
            objectPath: data.storage_object_path,
            error: storageErr?.message,
          });
          throw new ServiceUnavailableError('APK binary storage is temporarily unavailable.');
        }

        const buffer = Buffer.from(await blob.arrayBuffer());
        const actualSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
        if (actualSha256 !== data.sha256) {
          logger.error('CRITICAL: Stored APK SHA-256 mismatch; refusing to serve binary', {
            expected: data.sha256,
            actual: actualSha256,
          });
          return null;
        }

        try {
          inspectAndVerifyApkBuffer(buffer, {
            expectedPackage: data.package_name || EXPECTED_ANDROID_PACKAGE,
          });
        } catch (verifyErr) {
          logger.error('CRITICAL: Stored APK failed structural/signature verification', {
            error: String(verifyErr),
          });
          return null;
        }

        this.incrementDownloadCount();
        return {
          filename: sanitizeApkFilename(data.local_filename || 'earthtalk.apk'),
          sizeBytes: buffer.length,
          sha256: actualSha256,
          buffer,
        };
      }
    }

    const validLocal = getValidLocalApkBuffer();
    if (!validLocal) {
      return null;
    }

    const config = this.getConfig();
    const sha256 = crypto.createHash('sha256').update(validLocal.buffer).digest('hex');
    this.incrementDownloadCount();

    return {
      filename: sanitizeApkFilename(config.apk_filename || 'earthtalk.apk'),
      sizeBytes: validLocal.buffer.length,
      sha256,
      filePath: validLocal.path,
    };
  }

  /**
   * Updates distribution settings (e.g. Play Store URL, active mode, release notes).
   */
  updateConfig(
    updates: Partial<AppDistributionConfig>,
    updatedBy: string
  ): AppDistributionConfig {
    const current = this.getConfig();

    const safeUpdates: Partial<AppDistributionConfig> = { ...updates };
    if (safeUpdates.apk_filename !== undefined) {
      safeUpdates.apk_filename = sanitizeApkFilename(safeUpdates.apk_filename);
    }
    if (safeUpdates.is_get_app_sidebar_visible !== undefined) {
      safeUpdates.is_get_app_sidebar_visible = Boolean(safeUpdates.is_get_app_sidebar_visible);
    }
    if (safeUpdates.is_whatsapp_sidebar_visible !== undefined) {
      safeUpdates.is_whatsapp_sidebar_visible = Boolean(safeUpdates.is_whatsapp_sidebar_visible);
    }
    if (safeUpdates.whatsapp_number !== undefined) {
      safeUpdates.whatsapp_number = String(safeUpdates.whatsapp_number)
        .replace(/\D/g, '')
        .slice(0, 20);
    }

    const updated: AppDistributionConfig = {
      ...current,
      ...safeUpdates,
      package_name: EXPECTED_ANDROID_PACKAGE,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy || current.updated_by,
    };

    if (updates.is_play_store_active !== undefined) {
      updated.is_play_store_active = Boolean(updates.is_play_store_active);
      if (updated.is_play_store_active && (!updates.mode || updates.mode === 'apk')) {
        updated.mode = updates.mode || 'both';
      } else if (!updated.is_play_store_active && updates.mode === 'play_store') {
        updated.mode = 'apk';
      }
    }

    this.configCache = updated;
    this.saveConfigToDisk(updated);
    return this.getConfig();
  }

  /**
   * Cryptographically verifies an uploaded APK archive and persists it to durable
   * Supabase Storage + app_releases when configured (or atomically to disk in local dev).
   */
  async processUploadedApk(
    tempFilePath: string,
    originalName: string,
    sizeBytes: number,
    updatedBy: string,
    versionName?: string,
    versionCode?: number,
    releaseNotes?: string
  ): Promise<AppDistributionConfig> {
    let fileBuffer: Buffer;
    try {
      fileBuffer = fs.readFileSync(tempFilePath);
    } finally {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch {
        // ignore temp cleanup failure
      }
    }

    const verified = inspectAndVerifyApkBuffer(fileBuffer);
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const safeFilename = sanitizeApkFilename(originalName || 'earthtalk.apk');

    const current = this.getConfig();
    const resolvedVersionName = (versionName && versionName.trim()) || current.version_name;
    const resolvedVersionCode =
      typeof versionCode === 'number' && Number.isInteger(versionCode) && versionCode >= 1
        ? versionCode
        : current.version_code + 1;
    const resolvedNotes = releaseNotes !== undefined ? releaseNotes : current.release_notes;

    if (isDatabaseConfigured()) {
      const objectPath = `releases/v${resolvedVersionCode}_${sha256.slice(0, 12)}_${safeFilename}`;
      const { error: uploadErr } = await supabase.storage
        .from(APP_RELEASES_BUCKET)
        .upload(objectPath, fileBuffer, {
          contentType: 'application/vnd.android.package-archive',
          upsert: true,
        });

      if (uploadErr) {
        logger.error('Failed to upload verified APK to Supabase Storage', {
          error: uploadErr.message,
        });
        throw new ServiceUnavailableError('Failed to upload APK to durable release storage.');
      }

      const { error: clearErr } = await (supabase.from('app_releases' as any) as any)
        .update({ is_current: false })
        .eq('is_current', true);

      if (clearErr) {
        await supabase.storage.from(APP_RELEASES_BUCKET).remove([objectPath]).catch(() => null);
        logger.error('Failed to deactivate prior APK release row', { error: clearErr.message });
        throw new ServiceUnavailableError('Failed to update active APK release record.');
      }

      const { error: insertErr } = await (supabase.from('app_releases' as any) as any).insert({
        version_name: resolvedVersionName,
        version_code: resolvedVersionCode,
        package_name: verified.packageName,
        release_notes: resolvedNotes,
        sha256,
        file_size_bytes: fileBuffer.length || sizeBytes,
        signature_scheme: verified.signatureScheme,
        storage_bucket: APP_RELEASES_BUCKET,
        storage_object_path: objectPath,
        local_filename: safeFilename,
        is_current: true,
        uploaded_by: updatedBy,
      });

      if (insertErr) {
        await supabase.storage.from(APP_RELEASES_BUCKET).remove([objectPath]).catch(() => null);
        logger.error('Failed to insert APK release metadata row', { error: insertErr.message });
        throw new ServiceUnavailableError('Failed to persist APK release metadata.');
      }

      const updated: AppDistributionConfig = {
        ...current,
        apk_filename: safeFilename,
        apk_size_bytes: fileBuffer.length || sizeBytes,
        apk_sha256: sha256,
        package_name: verified.packageName,
        version_name: resolvedVersionName,
        version_code: resolvedVersionCode,
        release_notes: resolvedNotes,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      };
      this.configCache = updated;
      return { ...updated };
    }

    if (!fs.existsSync(DOWNLOADS_DIR)) {
      fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    }
    const atomicTmp = `${APK_PATH}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(atomicTmp, fileBuffer);
    fs.renameSync(atomicTmp, APK_PATH);

    const updated: AppDistributionConfig = {
      ...current,
      apk_filename: safeFilename,
      apk_size_bytes: fileBuffer.length || sizeBytes,
      apk_sha256: sha256,
      package_name: verified.packageName,
      version_name: resolvedVersionName,
      version_code: resolvedVersionCode,
      release_notes: resolvedNotes,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };

    this.configCache = updated;
    this.saveConfigToDisk(updated);
    logger.info(
      `Updated verified APK (${verified.signatureScheme}): ${safeFilename} (${updated.apk_size_bytes} bytes, SHA256: ${sha256.slice(0, 12)}...)`
    );
    return { ...updated };
  }

  /**
   * Increments the APK download counter.
   */
  incrementDownloadCount(): void {
    const current = this.getConfig();
    current.download_count = (current.download_count || 0) + 1;
    this.configCache = current;
    this.saveConfigToDisk(current);
  }

  /**
   * Returns path to the local APK file for streaming, or null if no valid signed APK is available.
   */
  getApkPath(): string | null {
    return getValidLocalApkBuffer()?.path ?? null;
  }

  private saveConfigToDisk(config: AppDistributionConfig): void {
    try {
      const dir = path.dirname(CONFIG_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${CONFIG_PATH}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
      fs.renameSync(tmpPath, CONFIG_PATH);
    } catch (err) {
      logger.error('Failed to write app distribution config to disk', { error: String(err) });
    }
  }
}

export const appDistributionService = new AppDistributionService();
