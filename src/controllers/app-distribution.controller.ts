import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import {
  appDistributionService,
  sanitizeApkFilename,
} from '../services/app-distribution.service.js';
import { staffService } from '../services/staff.service.js';
import type { AuthenticatedStaffRequest } from '../utils/admin-auth.js';
import { logger } from '../utils/logger.js';
import { isServiceUnavailableError } from '../utils/service-error.js';

// Setup multer storage for incoming APK uploads (up to 150MB)
const uploadDir = path.resolve(process.cwd(), 'tmp');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export const apkUpload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 150 * 1024 * 1024, // 150 MB max
  },
  fileFilter: (_req, file, cb) => {
    const isApk =
      file.originalname.toLowerCase().endsWith('.apk') ||
      file.mimetype === 'application/vnd.android.package-archive' ||
      file.mimetype === 'application/octet-stream' ||
      file.mimetype === 'application/zip';
    if (isApk) {
      cb(null, true);
    } else {
      cb(new Error('Only Android .apk files are supported'));
    }
  },
});

export class AppDistributionController {
  /**
   * Public endpoint: GET /api/app-distribution
   * Returns current release info, Play Store URL, active mode, and verified APK metadata.
   */
  getConfig = async (_req: Request, res: Response): Promise<void> => {
    try {
      const { config, apkAvailable } = await appDistributionService.getPublicStatus();
      const sizeMb = Number((config.apk_size_bytes / (1024 * 1024)).toFixed(1));

      res.status(200).json({
        ...config,
        apk_filename: sanitizeApkFilename(config.apk_filename),
        apk_available: apkAvailable,
        apk_size_mb: sizeMb,
        download_url: '/api/app-distribution/download',
      });
    } catch (err) {
      logger.error('Failed to get app distribution config', { error: String(err) });
      if (isServiceUnavailableError(err)) {
        res.status(503).json({
          error: 'DATABASE_UNAVAILABLE',
          message: 'App distribution catalog is temporarily unavailable.',
        });
        return;
      }
      res.status(500).json({ error: 'Failed to retrieve app distribution info' });
    }
  };

  /**
   * Public endpoint: GET /api/app-distribution/download
   * Streams the verified Android APK file to the client as an attachment.
   */
  downloadApk = async (_req: Request, res: Response): Promise<void> => {
    try {
      const verified = await appDistributionService.loadVerifiedApkDownload();
      if (!verified) {
        res.status(503).json({
          error: 'APK_UNAVAILABLE',
          message: 'Production APK release is currently unavailable for download.',
        });
        return;
      }

      const safeFilename = sanitizeApkFilename(verified.filename);

      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Content-Length', verified.sizeBytes);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-APK-SHA256', verified.sha256);
      res.setHeader('Cache-Control', 'public, max-age=3600');

      if (verified.buffer) {
        res.status(200).end(verified.buffer);
        return;
      }

      if (verified.filePath && fs.existsSync(verified.filePath)) {
        const stream = fs.createReadStream(verified.filePath);
        stream.pipe(res);
        return;
      }

      res.status(503).json({
        error: 'APK_UNAVAILABLE',
        message: 'Production APK release is currently unavailable for download.',
      });
    } catch (err) {
      logger.error('Failed to stream APK download', { error: String(err) });
      if (isServiceUnavailableError(err)) {
        res.status(503).json({
          error: 'APK_UNAVAILABLE',
          message: 'Production APK release storage is temporarily unavailable.',
        });
        return;
      }
      res.status(500).json({ error: 'Failed to download APK' });
    }
  };

  /**
   * Staff endpoint: PUT /api/control/app-distribution/config
   * Updates distribution mode, Play Store URL, release notes, or version info.
   */
  updateConfig = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    try {
      const staffEmail = req.staff?.email || 'Super Admin';
      const updated = appDistributionService.updateConfig(req.body, staffEmail);

      await staffService.logAudit({
        staff_id: req.staff?.staffId === 'super_admin' ? undefined : req.staff?.staffId,
        action: 'app_distribution.update_config',
        target_type: 'app_distribution',
        metadata: {
          mode: updated.mode,
          is_play_store_active: updated.is_play_store_active,
          is_get_app_sidebar_visible: updated.is_get_app_sidebar_visible,
          is_whatsapp_sidebar_visible: updated.is_whatsapp_sidebar_visible,
          whatsapp_number: updated.whatsapp_number,
          play_store_url: updated.play_store_url,
          version_name: updated.version_name,
        },
      });

      res.status(200).json({
        success: true,
        config: updated,
      });
    } catch (err) {
      logger.error('Failed to update app distribution config', { error: String(err) });
      if (isServiceUnavailableError(err)) {
        res.status(503).json({ error: 'DATABASE_UNAVAILABLE' });
        return;
      }
      res.status(400).json({ error: 'Failed to update app distribution configuration' });
    }
  };

  /**
   * Staff endpoint: POST /api/control/app-distribution/upload
   * Uploads, cryptographically verifies, and publishes a new .apk release.
   */
  uploadApk = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No APK file uploaded' });
        return;
      }

      const staffEmail = req.staff?.email || 'Super Admin';
      const versionName = req.body.version_name as string | undefined;
      const versionCode = req.body.version_code ? parseInt(req.body.version_code, 10) : undefined;
      const releaseNotes = req.body.release_notes as string | undefined;

      const updated = await appDistributionService.processUploadedApk(
        file.path,
        file.originalname,
        file.size,
        staffEmail,
        versionName,
        versionCode,
        releaseNotes
      );

      await staffService.logAudit({
        staff_id: req.staff?.staffId === 'super_admin' ? undefined : req.staff?.staffId,
        action: 'app_distribution.upload_apk',
        target_type: 'app_distribution',
        metadata: {
          filename: sanitizeApkFilename(file.originalname),
          size_bytes: updated.apk_size_bytes,
          sha256: updated.apk_sha256,
          version_name: updated.version_name,
          version_code: updated.version_code,
        },
      });

      res.status(200).json({
        success: true,
        message: 'APK uploaded, verified, and published successfully',
        config: updated,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('INVALID_APK_ARCHIVE')) {
        res.status(400).json({ error: 'INVALID_APK_ARCHIVE', message });
        return;
      }
      if (isServiceUnavailableError(err)) {
        res.status(503).json({
          error: 'STORAGE_UNAVAILABLE',
          message: 'Durable APK release storage is temporarily unavailable.',
        });
        return;
      }
      logger.error('Failed to upload APK file', { error: message });
      res.status(500).json({ error: 'Failed to process and store uploaded APK' });
    }
  };
}

export const appDistributionController = new AppDistributionController();
