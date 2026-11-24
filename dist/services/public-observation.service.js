import { publicObservationRepository, } from '../repositories/public-observation.repository.js';
import { validatePublicFilters } from '../utils/public-filters.js';
export class PublicObservationService {
    repo;
    constructor(repo = publicObservationRepository) {
        this.repo = repo;
    }
    /**
     * Retrieves paginated public observations with validation and privacy enforcement.
     */
    async getObservations(queryParams) {
        const validatedFilters = validatePublicFilters(queryParams);
        return this.repo.findPublicObservations(validatedFilters);
    }
    /**
     * Published observations with no public coordinate.
     *
     * The map drops these because a pin needs a point; the "Geoscience sites"
     * surface lists them instead so a post with a private location is never
     * silently unreachable.
     */
    async getUnlocatedObservations(queryParams) {
        const validatedFilters = validatePublicFilters(queryParams);
        return this.repo.findUnlocatedPublicObservations(validatedFilters);
    }
    /**
     * Retrieves GeoJSON FeatureCollection formatted for MapLibre GL JS map rendering.
     */
    async getObservationsGeoJson(queryParams) {
        const validatedFilters = validatePublicFilters(queryParams);
        return this.repo.findPublicObservationsGeoJson(validatedFilters);
    }
    /**
     * Retrieves a single public Geoscience Passport by ID.
     * Returns null if not public, pending, hidden, rejected, or non-rock.
     */
    async getObservationByPassportId(passportId) {
        if (!passportId || passportId.trim().length === 0) {
            return null;
        }
        return this.repo.findPublicObservationByPassport(passportId.trim());
    }
    /**
     * Computes statistics calculated strictly from public observations.
     */
    async getStats() {
        return this.repo.getPublicStats();
    }
    /**
     * Retrieves district breakdown of public observations.
     */
    async getDistricts() {
        return this.repo.getPublicDistricts();
    }
    /**
     * Retrieves the observation-category breakdown of public observations.
     */
    async getCategoryCounts() {
        return this.repo.getPublicCategoryCounts();
    }
}
export const publicObservationService = new PublicObservationService();
