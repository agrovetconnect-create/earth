import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { supabase } from '../config/supabase.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CMS_STORAGE_PATH = path.join(__dirname, '../data/cms-content.json');
const CMS_HISTORY_DIR = path.join(__dirname, '../data/cms-history');

export interface CmsSection {
  id: string;
  number?: string;
  title: string;
  content: string;
}

export interface CmsPageContent {
  page: string;
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: CmsSection[];
}

export interface CmsActorContext {
  staffId?: string;
  email?: string;
  role?: string;
  ipHash?: string;
}

const DEFAULT_CMS_DATA: Record<string, CmsPageContent> = {
  terms: {
    page: 'terms',
    title: 'Terms of Service',
    subtitle:
      'These Terms of Service govern your access to and use of the Earth Talk platform, WhatsApp submission workflows, community discovery feeds, and GIS observation layers in Rwanda.',
    lastUpdated: 'October 24, 2026',
    sections: [
      {
        id: 'section-1',
        number: '1',
        title: 'Acceptance of Terms',
        content:
          'By accessing or using Earth Talk (accessible via web interfaces and the designated WhatsApp messaging channel), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you must not access or use our services.',
      },
      {
        id: 'section-2',
        number: '2',
        title: 'Description of the Earth Talk Platform',
        content:
          'Earth Talk is a WhatsApp-first GeoAI, GIS, and community geoscience platform tailored for Rwanda ("Discover Earth. Together."). The service provides multimodal artificial intelligence analysis, digital Geoscience Passports, and interactive GIS mapping.',
      },
      {
        id: 'section-3',
        number: '3',
        title: 'Scientific & Educational AI Disclaimers',
        content:
          'Observations analyzed by Earth Talk reflect preliminary AI-assisted visual interpretations based on photograph pixels and provided context. They do NOT constitute laboratory assay or official geological survey verification.',
      },
      {
        id: 'section-4',
        number: '4',
        title: 'Contributor Identity & Account System',
        content:
          'Earth Talk avoids intrusive account registration by using lightweight, privacy-preserving identity models, including salted HMAC-SHA256 phone hashing for WhatsApp contributors and browser-stored profiles for Field Explorers.',
      },
    ],
  },
  privacy: {
    page: 'privacy',
    title: 'Privacy Policy',
    subtitle:
      'Earth Talk is committed to protecting your privacy while building a collaborative civic geoscience platform for Rwanda. This policy explains how we collect, handle, and secure your information.',
    lastUpdated: 'October 24, 2026',
    sections: [
      {
        id: 'privacy-1',
        number: '1',
        title: 'Information We Collect',
        content:
          'We collect information you voluntarily provide when submitting observations via WhatsApp or web upload, including photographs, voice notes, geological descriptions, and coordinate data.',
      },
      {
        id: 'privacy-2',
        number: '2',
        title: 'Phone Number Hashing & Anonymity',
        content:
          'When you message our WhatsApp bot, your phone number is immediately converted on our secure backend into an irreversible salted cryptographic hash. Raw phone numbers are never stored in public or observation databases.',
      },
      {
        id: 'privacy-3',
        number: '3',
        title: 'Geolocation Privacy & Fuzzing',
        content:
          'Exact field coordinates remain private to you until published. Public map pins apply geographic fuzzing (approximate displacement) to protect sensitive localities while preserving regional scientific utility.',
      },
    ],
  },
  about: {
    page: 'about',
    title: 'About Earth Talk',
    subtitle:
      'Discover Earth. Together. WhatsApp-first GeoAI, GIS, community investigation and research platform for Rwanda.',
    lastUpdated: 'October 24, 2026',
    sections: [
      {
        id: 'about-1',
        number: '1',
        title: 'Our Mission & Vision',
        content:
          'Earth Talk empowers Rwandan citizens, local researchers, and field explorers to document geological specimens, water resources, and terrain features using accessible mobile and WhatsApp technology.',
      },
      {
        id: 'about-2',
        number: '2',
        title: 'Civic Geoscience & Community Science',
        content:
          'By combining state-of-the-art GeoAI models with community verification, Earth Talk builds open, structured geological datasets for education, environmental monitoring, and sustainable resource understanding.',
      },
    ],
  },
  'how-it-works': {
    page: 'how-it-works',
    title: 'How Earth Talk Works',
    subtitle:
      'Step-by-step guide to capturing field observations, interacting with GeoAI analysis, and contributing to community investigations in Rwanda.',
    lastUpdated: 'October 24, 2026',
    sections: [
      {
        id: 'hiw-1',
        number: '1',
        title: 'Capture & Submit via WhatsApp or Web',
        content:
          'Take a clear photograph or record a voice note of a geological specimen, rock outcrop, mineral, or hydrogeological site. Send it directly to the Earth Talk WhatsApp line or upload via the web form.',
      },
      {
        id: 'hiw-2',
        number: '2',
        title: 'Instant GeoAI Interpretation',
        content:
          'Our multimodal GeoAI analyzes the visual characteristics, generates a preliminary identification, calculates confidence ratings, and issues a digital Geoscience Passport.',
      },
      {
        id: 'hiw-3',
        number: '3',
        title: 'GIS Mapping & Community Investigation',
        content:
          'Published observations appear on the interactive Rwanda GIS map and community investigation boards where experts and peers can discuss, verify, and build consensus.',
      },
    ],
  },
};

const ALLOWED_CMS_PAGES = ['terms', 'privacy', 'about', 'how-it-works'] as const;
const ALLOWED_TOP_LEVEL_KEYS = new Set(['page', 'title', 'subtitle', 'lastUpdated', 'sections']);
const ALLOWED_SECTION_KEYS = new Set(['id', 'number', 'title', 'content']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DISALLOWED_MARKUP_PATTERNS: RegExp[] = [
  /<\s*\/?\s*(?:script|iframe|object|embed|svg|math|form|meta|link|base)\b/i,
  /\b(?:javascript|vbscript)\s*:/i,
  /\bdata\s*:\s*text\/html/i,
  /\bon[a-z]{2,}\s*=/i,
];

function validatePage(page: string): void {
  if (!(ALLOWED_CMS_PAGES as readonly string[]).includes(page)) {
    throw new Error(`Invalid or restricted CMS page: ${page}`);
  }
}

function toDbSlug(page: string): string {
  return page === 'how-it-works' ? 'how_it_works' : page;
}

function toValidUuidOrNull(value: string | undefined): string | null {
  if (!value || !UUID_REGEX.test(value)) return null;
  return value;
}

function containsDisallowedMarkup(text: string): boolean {
  return DISALLOWED_MARKUP_PATTERNS.some((pattern) => pattern.test(text));
}

function clonePageContent(content: CmsPageContent): CmsPageContent {
  return structuredClone(content);
}

/**
 * Strictly validates CMS update payloads against schema bounds and active-markup XSS vectors.
 */
export function validateCmsUpdatePayload(
  page: string,
  updates: unknown,
  existing: CmsPageContent
): CmsPageContent {
  validatePage(page);

  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('CMS update payload must be a JSON object');
  }

  const record = updates as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      throw new Error(`Unsupported CMS field: ${key}`);
    }
  }

  if (record.page !== undefined && record.page !== page) {
    throw new Error('CMS page identifier mismatch');
  }

  let title = existing.title;
  if (record.title !== undefined) {
    if (typeof record.title !== 'string') {
      throw new Error('CMS title must be a string');
    }
    const trimmed = record.title.trim();
    if (trimmed.length < 1 || trimmed.length > 200) {
      throw new Error('CMS title must be between 1 and 200 characters');
    }
    if (containsDisallowedMarkup(trimmed)) {
      throw new Error('CMS title contains disallowed executable markup');
    }
    title = trimmed;
  }

  let subtitle = existing.subtitle;
  if (record.subtitle !== undefined) {
    if (typeof record.subtitle !== 'string') {
      throw new Error('CMS subtitle must be a string');
    }
    const trimmed = record.subtitle.trim();
    if (trimmed.length > 1000) {
      throw new Error('CMS subtitle must not exceed 1000 characters');
    }
    if (containsDisallowedMarkup(trimmed)) {
      throw new Error('CMS subtitle contains disallowed executable markup');
    }
    subtitle = trimmed;
  }

  let sections: CmsSection[] = structuredClone(existing.sections);
  if (record.sections !== undefined) {
    if (!Array.isArray(record.sections) || record.sections.length > 50) {
      throw new Error('CMS sections must be an array of at most 50 sections');
    }
    sections = record.sections.map((rawSec, idx) => {
      if (!rawSec || typeof rawSec !== 'object' || Array.isArray(rawSec)) {
        throw new Error(`CMS section at index ${idx} must be an object`);
      }
      const secObj = rawSec as Record<string, unknown>;
      for (const secKey of Object.keys(secObj)) {
        if (!ALLOWED_SECTION_KEYS.has(secKey)) {
          throw new Error(`Unsupported CMS section field "${secKey}" at index ${idx}`);
        }
      }
      if (typeof secObj.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(secObj.id)) {
        throw new Error(`CMS section id at index ${idx} must match /^[A-Za-z0-9_-]{1,80}$/`);
      }
      if (typeof secObj.title !== 'string') {
        throw new Error(`CMS section title at index ${idx} must be a string`);
      }
      const secTitle = secObj.title.trim();
      if (secTitle.length < 1 || secTitle.length > 240) {
        throw new Error(`CMS section title at index ${idx} must be 1..240 characters`);
      }
      if (containsDisallowedMarkup(secTitle)) {
        throw new Error(`CMS section title at index ${idx} contains disallowed executable markup`);
      }

      if (typeof secObj.content !== 'string') {
        throw new Error(`CMS section content at index ${idx} must be a string`);
      }
      const secContent = secObj.content.trim();
      if (secContent.length < 1 || secContent.length > 20000) {
        throw new Error(`CMS section content at index ${idx} must be 1..20000 characters`);
      }
      if (containsDisallowedMarkup(secContent)) {
        throw new Error(`CMS section content at index ${idx} contains disallowed executable markup`);
      }

      let secNumber: string | undefined;
      if (secObj.number !== undefined) {
        if (typeof secObj.number !== 'string' || secObj.number.trim().length > 20) {
          throw new Error(`CMS section number at index ${idx} must be a string of at most 20 characters`);
        }
        if (containsDisallowedMarkup(secObj.number)) {
          throw new Error(`CMS section number at index ${idx} contains disallowed executable markup`);
        }
        secNumber = secObj.number.trim();
      }

      return {
        id: secObj.id,
        ...(secNumber !== undefined ? { number: secNumber } : {}),
        title: secTitle,
        content: secContent,
      };
    });
  }

  return {
    page,
    title,
    subtitle,
    lastUpdated: new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    sections,
  };
}

export class CmsService {
  private writeQueue: Promise<void> = Promise.resolve();

  isDatabaseBacked(): boolean {
    return isDatabaseConfigured();
  }

  private withWriteLock<T>(operation: () => Promise<T> | T): Promise<T> {
    const run = this.writeQueue.then(() => operation());
    this.writeQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private loadLocalData(): Record<string, CmsPageContent> | null {
    try {
      if (fs.existsSync(CMS_STORAGE_PATH)) {
        const raw = fs.readFileSync(CMS_STORAGE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, CmsPageContent>;
        }
      }
    } catch (err) {
      logger.error('Error reading CMS storage', { error: String(err) });
    }
    return null;
  }

  private saveLocalDataAtomically(data: Record<string, CmsPageContent>): void {
    const dir = path.dirname(CMS_STORAGE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${CMS_STORAGE_PATH}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, CMS_STORAGE_PATH);
  }

  private saveLocalHistory(page: string, content: CmsPageContent): void {
    try {
      if (!fs.existsSync(CMS_HISTORY_DIR)) {
        fs.mkdirSync(CMS_HISTORY_DIR, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const historyPath = path.join(CMS_HISTORY_DIR, `${page}_${timestamp}.json`);
      fs.writeFileSync(historyPath, JSON.stringify(content, null, 2), 'utf-8');
    } catch (err) {
      logger.error('Error saving CMS history', { error: String(err) });
    }
  }

  async getPage(page: string): Promise<CmsPageContent> {
    validatePage(page);

    if (this.isDatabaseBacked()) {
      const dbSlug = toDbSlug(page);
      const { data, error } = await (supabase.from('cms_pages' as any) as any)
        .select('slug, title, content, updated_at')
        .eq('slug', dbSlug)
        .maybeSingle();

      if (error) {
        logger.error('Failed to read CMS page from database', { page, error: error.message });
        throw new ServiceUnavailableError('CMS database is temporarily unavailable.');
      }

      if (data && data.content && typeof data.content === 'object' && !Array.isArray(data.content)) {
        const stored = data.content as Partial<CmsPageContent>;
        const fallback = DEFAULT_CMS_DATA[page];
        return clonePageContent({
          page,
          title: typeof data.title === 'string' && data.title ? data.title : stored.title || fallback.title,
          subtitle: typeof stored.subtitle === 'string' ? stored.subtitle : fallback.subtitle,
          lastUpdated: typeof stored.lastUpdated === 'string' ? stored.lastUpdated : fallback.lastUpdated,
          sections: Array.isArray(stored.sections) ? stored.sections : fallback.sections,
        });
      }

      return clonePageContent(DEFAULT_CMS_DATA[page]);
    }

    const localData = this.loadLocalData();
    if (localData && Object.prototype.hasOwnProperty.call(localData, page) && localData[page]) {
      return clonePageContent({
        ...localData[page],
        page,
        sections: Array.isArray(localData[page].sections) ? localData[page].sections : [],
      });
    }

    return clonePageContent(DEFAULT_CMS_DATA[page]);
  }

  async updatePage(
    page: string,
    updates: Partial<CmsPageContent>,
    actor?: CmsActorContext
  ): Promise<CmsPageContent> {
    validatePage(page);

    if (this.isDatabaseBacked()) {
      const existing = await this.getPage(page);
      const updated = validateCmsUpdatePayload(page, updates, existing);
      const dbSlug = toDbSlug(page);

      const { error } = await (supabase as any).rpc('upsert_cms_page_transactional', {
        p_slug: dbSlug,
        p_title: updated.title,
        p_content: updated,
        p_change_note: 'Updated via Control Center',
        p_actor_id: toValidUuidOrNull(actor?.staffId),
        p_actor_email: actor?.email || 'owner',
        p_actor_role: actor?.role || 'owner',
        p_ip_hash: actor?.ipHash ?? null,
      });

      if (error) {
        logger.error('Failed to persist CMS page transactionally', { page, error: error.message });
        throw new ServiceUnavailableError('Failed to persist CMS page update.');
      }

      return clonePageContent(updated);
    }

    return this.withWriteLock(() => {
      const localData = this.loadLocalData() ?? {};
      const existing =
        (Object.prototype.hasOwnProperty.call(localData, page) && localData[page]) ||
        clonePageContent(DEFAULT_CMS_DATA[page]);

      const updated = validateCmsUpdatePayload(page, updates, existing);
      this.saveLocalHistory(page, existing);

      const nextStore: Record<string, CmsPageContent> = {};
      for (const allowedPage of ALLOWED_CMS_PAGES) {
        nextStore[allowedPage] =
          allowedPage === page
            ? updated
            : localData[allowedPage]
              ? clonePageContent(localData[allowedPage])
              : clonePageContent(DEFAULT_CMS_DATA[allowedPage]);
      }

      this.saveLocalDataAtomically(nextStore);
      return clonePageContent(updated);
    });
  }

  async getHistory(page: string): Promise<any[]> {
    validatePage(page);

    if (this.isDatabaseBacked()) {
      const dbSlug = toDbSlug(page);
      const { data, error } = await (supabase.from('cms_page_revisions' as any) as any)
        .select('id, version, title, saved_by, change_note, saved_at')
        .eq('page_slug', dbSlug)
        .order('version', { ascending: false })
        .limit(50);

      if (error) {
        logger.error('Failed to query CMS history from database', { page, error: error.message });
        throw new ServiceUnavailableError('CMS revision history is temporarily unavailable.');
      }

      return (data ?? []).map((row: any) => ({
        filename: `rev_${row.id}`,
        id: row.id,
        version: row.version,
        timestamp: row.saved_at,
        label: new Date(row.saved_at).toLocaleString(),
        savedBy: row.saved_by,
        changeNote: row.change_note,
      }));
    }

    try {
      if (!fs.existsSync(CMS_HISTORY_DIR)) return [];
      const files = fs.readdirSync(CMS_HISTORY_DIR);
      return files
        .filter(
          (f) =>
            f.startsWith(`${page}_`) &&
            f.endsWith('.json') &&
            !f.includes('..') &&
            !f.includes('/') &&
            !f.includes('\\')
        )
        .map((f) => {
          const rawStamp = f.slice(page.length + 1, -5);
          const isoCandidate = rawStamp.replace(
            /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
            '$1T$2:$3:$4.$5Z'
          );
          let parsedDate = new Date(isoCandidate);
          if (Number.isNaN(parsedDate.getTime())) {
            try {
              const stat = fs.statSync(path.join(CMS_HISTORY_DIR, f));
              parsedDate = stat.mtime;
            } catch {
              parsedDate = new Date(0);
            }
          }
          return {
            filename: f,
            timestamp: parsedDate.toISOString(),
            label: parsedDate.toLocaleString(),
          };
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    } catch {
      logger.warn('Failed to enumerate CMS revision history', { page });
      return [];
    }
  }

  async restoreRevision(
    page: string,
    filename: string,
    actor?: CmsActorContext
  ): Promise<CmsPageContent> {
    validatePage(page);

    if (typeof filename !== 'string' || filename.length === 0) {
      throw new Error('Invalid revision filename');
    }

    if (this.isDatabaseBacked()) {
      const match = /^(?:rev_)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
        filename.trim()
      );
      if (!match) {
        throw new Error('Invalid revision identifier');
      }
      const revisionId = match[1];
      const dbSlug = toDbSlug(page);

      const { data, error } = await (supabase.from('cms_page_revisions' as any) as any)
        .select('id, page_slug, version, title, content')
        .eq('id', revisionId)
        .eq('page_slug', dbSlug)
        .maybeSingle();

      if (error) {
        logger.error('Failed to fetch CMS revision from database', { page, revisionId, error: error.message });
        throw new ServiceUnavailableError('CMS revision database is temporarily unavailable.');
      }

      if (!data || !data.content || typeof data.content !== 'object' || Array.isArray(data.content)) {
        throw new Error('Revision not found');
      }

      const candidatePayload = {
        ...(data.content as Record<string, unknown>),
        page,
      };
      const validated = validateCmsUpdatePayload(
        page,
        candidatePayload,
        clonePageContent(DEFAULT_CMS_DATA[page])
      );

      const { error: rpcError } = await (supabase as any).rpc('upsert_cms_page_transactional', {
        p_slug: dbSlug,
        p_title: validated.title,
        p_content: validated,
        p_change_note: `Restored revision v${data.version}`,
        p_actor_id: toValidUuidOrNull(actor?.staffId),
        p_actor_email: actor?.email || 'owner',
        p_actor_role: actor?.role || 'owner',
        p_ip_hash: actor?.ipHash ?? null,
      });

      if (rpcError) {
        logger.error('Failed to restore CMS revision transactionally', {
          page,
          revisionId,
          error: rpcError.message,
        });
        throw new ServiceUnavailableError('Failed to restore CMS revision.');
      }

      return clonePageContent(validated);
    }

    if (
      filename.includes('\0') ||
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\') ||
      filename.includes(':')
    ) {
      throw new Error('Invalid revision filename');
    }

    const safeFilename = path.basename(filename);
    const validPattern = /^[a-z0-9-]+_[A-Za-z0-9T._-]+\.json$/;
    if (
      safeFilename !== filename ||
      !validPattern.test(safeFilename) ||
      !safeFilename.startsWith(`${page}_`) ||
      !safeFilename.endsWith('.json')
    ) {
      throw new Error('Invalid revision filename');
    }

    const resolvedDir = path.resolve(CMS_HISTORY_DIR);
    const resolvedTarget = path.resolve(resolvedDir, safeFilename);
    if (!resolvedTarget.startsWith(resolvedDir + path.sep)) {
      throw new Error('Invalid revision filename');
    }

    if (!fs.existsSync(resolvedTarget)) {
      throw new Error('Revision not found');
    }

    let parsed: unknown;
    try {
      const raw = fs.readFileSync(resolvedTarget, 'utf-8');
      parsed = JSON.parse(raw);
    } catch {
      logger.warn('Corrupted CMS revision JSON rejected', { page, revision: safeFilename });
      throw new Error('Corrupted or invalid CMS revision content');
    }

    let revisionContent: CmsPageContent;
    try {
      revisionContent = validateCmsUpdatePayload(
        page,
        parsed,
        clonePageContent(DEFAULT_CMS_DATA[page])
      );
    } catch {
      logger.warn('Malformed CMS revision schema rejected', { page, revision: safeFilename });
      throw new Error('Corrupted or invalid CMS revision content');
    }

    return this.withWriteLock(() => {
      const localData = this.loadLocalData() ?? {};
      if (localData[page]) {
        this.saveLocalHistory(page, localData[page]);
      }

      const nextStore: Record<string, CmsPageContent> = {};
      for (const allowedPage of ALLOWED_CMS_PAGES) {
        nextStore[allowedPage] =
          allowedPage === page
            ? revisionContent
            : localData[allowedPage]
              ? clonePageContent(localData[allowedPage])
              : clonePageContent(DEFAULT_CMS_DATA[allowedPage]);
      }

      this.saveLocalDataAtomically(nextStore);
      return clonePageContent(revisionContent);
    });
  }

  async getFaqs(): Promise<any[]> {
    return [
      {
        question: 'How do I submit an observation via WhatsApp?',
        answer:
          "Simply save our official number and send 'Start'. You can then send photos, voice notes, or text descriptions of geological sites.",
      },
      {
        question: 'Is my phone number private?',
        answer:
          'Yes. We use salted cryptographic hashing (HMAC-SHA256) to ensure your raw phone number is never stored in our public databases.',
      },
      {
        question: 'What is a Geoscience Passport?',
        answer:
          'It is a digital record of your contribution, containing AI analysis of your specimen, location data, and community verification status.',
      },
      {
        question: 'Can I use Earth Talk for commercial mining?',
        answer:
          'Earth Talk is a community science platform for research and education. While data is open, it does not constitute official mineral verification for commercial licensing.',
      },
    ];
  }
}

export const cmsService = new CmsService();
