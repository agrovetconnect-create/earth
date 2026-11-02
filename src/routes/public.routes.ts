import { Router } from 'express';
import {
  getPublicObservations,
  getPublicObservationsGeoJson,
  getUnlocatedObservations,
  getPublicObservationByPassportId,
  getPublicStats,
  getPublicDistricts,
  getPublicCategories,
  getObservationIntelligence,
  getObservationContext,
  getNearbyObservations,
  getSimilarObservations,
  compareObservations,
  listResearchOpportunities,
} from '../controllers/public.controller.js';
<<<<<<< HEAD
import { staffController } from '../controllers/staff.controller.js';
import { cmsService } from '../services/cms.service.js';

export const publicRouter = Router();


=======

export const publicRouter = Router();

>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
// Section 14: Public API endpoints
publicRouter.get('/api/public/observations', getPublicObservations);
publicRouter.get('/api/public/observations.geojson', getPublicObservationsGeoJson);
// Must precede the `:passportId` route, or "unlocated" is read as a passport.
publicRouter.get('/api/public/observations/unlocated', getUnlocatedObservations);
publicRouter.get('/api/public/observations/compare', compareObservations);
publicRouter.get('/api/public/observations/:passportId/intelligence', getObservationIntelligence);
publicRouter.get('/api/public/observations/:passportId/context', getObservationContext);
publicRouter.get('/api/public/observations/:passportId/nearby', getNearbyObservations);
publicRouter.get('/api/public/observations/:passportId/similar', getSimilarObservations);
publicRouter.get('/api/public/observations/:passportId', getPublicObservationByPassportId);
publicRouter.get('/api/public/research-opportunities', listResearchOpportunities);
publicRouter.get('/api/public/stats', getPublicStats);
publicRouter.get('/api/public/districts', getPublicDistricts);
publicRouter.get('/api/public/categories', getPublicCategories);
<<<<<<< HEAD

// Public CMS endpoint
publicRouter.get('/api/public/cms/:page', async (req, res) => {
  try {
    const page = await cmsService.getPage(req.params.page);
    res.status(200).json(page);
  } catch (err) {
    res.status(404).json({ error: 'Page not found' });
  }
});

// Public FAQ endpoint
publicRouter.get('/api/public/faqs', staffController.getFaqs);

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
