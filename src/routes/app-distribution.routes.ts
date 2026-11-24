import { Router } from 'express';
import { appDistributionController, apkUpload } from '../controllers/app-distribution.controller.js';
import { requireStaff } from '../utils/admin-auth.js';

export const appDistributionRouter = Router();

/**
 * Public Mobile App Distribution Endpoints:
 * - GET /api/app-distribution: Metadata, download URL, Google Play Store info, mode
 * - GET /api/app-distribution/download: Direct APK binary stream
 */
appDistributionRouter.get('/api/app-distribution', appDistributionController.getConfig);
appDistributionRouter.get('/api/app-distribution/download', appDistributionController.downloadApk);

/**
 * Control Center Mobile App Management Endpoints:
 * - PUT /api/control/app-distribution/config: Update Play Store URL, distribution mode, notes
 * - POST /api/control/app-distribution/upload: Upload new compiled .apk binary
 */
appDistributionRouter.put(
  '/api/control/app-distribution/config',
  requireStaff(['owner', 'ops', 'security']),
  appDistributionController.updateConfig
);

appDistributionRouter.post(
  '/api/control/app-distribution/upload',
  requireStaff(['owner', 'ops', 'security']),
  apkUpload.single('apk'),
  appDistributionController.uploadApk
);
