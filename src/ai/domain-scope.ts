import type { GeoscienceAnalysisResult } from './geological.types.js';
import { GEOSCIENCE_CATEGORY_LABELS, type GeoscienceCategory } from './geoscience-taxonomy.js';

export const EARTH_TALK_MISSION =
  'Discover Earth. Together. Earth Talk is a community geoscience and GeoAI platform dedicated to documenting, exploring, and learning from real-world Earth-science observations.';

export const EARTH_TALK_GOAL =
  'Build a scientifically honest field record where preliminary AI readings, community observations, and expert reviews stay clearly separated—supporting real Earth-science features rather than unrelated everyday objects.';

export const SUPPORTED_OBSERVED_SUMMARY =
  'Geological layers (stratigraphy), rocks, landforms, fossils, minerals, geological structures (bedding, faults, folds, veins), volcanic features, springs/seeps, and slope or quarry exposures';

export const SUPPORTED_ROCK_TYPE_SUMMARY =
  'Igneous, Sedimentary, Metamorphic, and Unclassified rock specimens';

export const SUPPORTED_EVIDENCE_STATE_SUMMARY =
  'AI-assisted preliminary reading, Community supported, Community investigated, Expert reviewed, and Scientifically confirmed';

interface OffTopicPatternRule {
  label: string;
  pattern: RegExp;
}

const VISUAL_SUBJECT_PATTERNS: readonly OffTopicPatternRule[] = [
  {
    label: 'shoes or footwear',
    pattern: /\b(shoe|shoes|sneaker|sneakers|sandal|sandals|boot|boots|slipper|slippers|heels|footwear|loafer|loafers)\b/i,
  },
  {
    label: 'clothes or apparel',
    pattern: /\b(clothes|clothing|shirt|t-shirt|tshirt|pants|trousers|jeans|dress|skirt|jacket|coat|hoodie|sweater|apparel|garment|outfit|fashion|hat|cap|socks)\b/i,
  },
  {
    label: 'a person or selfie',
    pattern: /\b(selfie|portrait|person|human face|people|crowd)\b/i,
  },
  {
    label: 'food or drink',
    pattern: /\b(food|meal|plate|dish|fruit|vegetable|bread|meat|rice|coffee|tea|drink|beverage|snack|cake|pizza|burger)\b/i,
  },
  {
    label: 'a vehicle or machine',
    pattern: /\b(car|truck|bus|motorcycle|motorbike|bicycle|bike|vehicle|automobile|engine|tire|tyre)\b/i,
  },
  {
    label: 'an electronic device or screen',
    pattern: /\b(phone|smartphone|laptop|computer|keyboard|monitor|television|screen|screenshot|tablet|electronics)\b/i,
  },
  {
    label: 'furniture or a household object',
    pattern: /\b(chair|table|sofa|couch|bed|desk|cabinet|curtain|carpet|pillow|cup|mug|bottle|bag|backpack|watch|toy|appliance|room interior|building interior)\b/i,
  },
  {
    label: 'an animal or pet',
    pattern: /\b(dog|cat|bird|cow|goat|sheep|chicken|insect|pet|living animal|wildlife)\b/i,
  },
];

const OFF_TOPIC_TEXT_PATTERNS: readonly OffTopicPatternRule[] = [
  ...VISUAL_SUBJECT_PATTERNS,
  {
    label: 'sports or entertainment',
    pattern: /\b(football|soccer|basketball|premier league|world cup|movie|movies|netflix|celebrity|music video|lyrics|concert)\b/i,
  },
  {
    label: 'finance, shopping, or cryptocurrency',
    pattern: /\b(bitcoin|crypto|ethereum|forex|stock market|betting|casino|loan|shopping|buy online|price of)\b/i,
  },
  {
    label: 'cooking or recipes',
    pattern: /\b(recipe|how to cook|ingredients for|baking|restaurant menu)\b/i,
  },
  {
    label: 'general coding or unrelated homework',
    pattern: /\b(write a python|javascript code|html page|write a poem|love letter|horoscope|astrology)\b/i,
  },
];

const GEOSCIENCE_CONTEXT_PATTERN =
  /\b(rock|rocks|stone|stones|pebble|boulder|cobble|gravel|outcrop|exposure|mineral|minerals|crystal|crystals|quartz|mica|feldspar|calcite|pyrite|chalcopyrite|pegmatite|cassiterite|coltan|tourmaline|kaolin|laterite|amphibolite|basalt|granite|gneiss|schist|quartzite|sandstone|shale|siltstone|mudstone|limestone|dolomite|conglomerate|breccia|slate|phyllite|marble|pumice|scoria|obsidian|tuff|trachyte|rhyolite|gabbro|diorite|andesite|lava|magma|volcan\w*|crater|caldera|ash|tephra|fossil|fossils|imprint|trace fossil|petrified|stromatolite|layer|layers|strata|stratum|stratigraph\w*|bedding|lamination|unconformity|sediment\w*|soil|clay|sand|silt|erosion|weathering|weathered|landform|landforms|geomorph\w*|hill|hillside|valley|ridge|cliff|escarpment|rift|gorge|canyon|terrace|alluvial|fluvial|landslide|rockfall|slope|road\s*cut|roadcut|embankment|fault|faults|fold|folds|vein|veins|joint|joints|fracture|fractures|foliation|cleavage|lineation|dike|dyke|sill|spring|springs|seep|seeps|groundwater|hot\s*spring|hydrothermal|travertine|mine|mining|quarry|tailings|artisanal|adit|shaft|ore|minerali[sz]ation|geolog\w*|geoscien\w*|earth\s*science|earth\s*talk|igneous|sedimentary|metamorphic|specimen|specimens|passport|evidence|grain|texture|vesicle|vesicular|clast|matrix|luster|hardness|streak|magnetic|virunga|kibaran|karagwe|kivu|musanze|rubavu|nyiragongo|karisimbi|muhabura|bisoke|sabyinyo|gishwati|nyungwe|akagera)\b/i;

const GENERIC_NON_GEO_PHRASES =
  /^(no geological content|not relevant to geoscience|non[-_\s]?geoscience|not a rock|non[-_\s]?rock|no rock visible|unrelated image|everyday object)\.?$/i;

/**
 * Determines whether a structured AI result represents a non-geoscience / unrelated
 * submission (such as shoes, clothes, food, selfies, or household objects).
 *
 * `insufficient_image` is intentionally NOT treated as non-geoscience so blurry or
 * dark field photos still receive retake guidance rather than an off-topic warning.
 */
export function isNonGeoscienceAnalysis(result: Partial<GeoscienceAnalysisResult>): boolean {
  if (result.observation_category === 'insufficient_image') {
    return false;
  }

  if (result.is_geoscience_relevant === false || result.observation_category === 'non_geoscience') {
    return true;
  }

  // Backward-compatibility for Stage 2 style payloads without `observation_category`
  if (
    !result.observation_category &&
    (result.is_rock === false || result.primary_classification === 'non_rock')
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts a concise human-readable description of the unsupported subject
 * detected in an image/video (e.g., "shoes or footwear", "clothes or apparel").
 */
export function describeUnsupportedVisualSubject(
  result: Partial<GeoscienceAnalysisResult>,
  userCaption?: string | null
): string {
  const combinedText = [
    result.primary_interpretation ?? '',
    result.reasoning ?? '',
    ...(result.observed_features ?? []),
    userCaption ?? '',
  ].join(' ');

  for (const rule of VISUAL_SUBJECT_PATTERNS) {
    if (rule.pattern.test(combinedText)) {
      return rule.label;
    }
  }

  const rawInterpretation = (result.primary_interpretation ?? '').trim();
  if (
    rawInterpretation.length > 0 &&
    rawInterpretation.length <= 90 &&
    !GENERIC_NON_GEO_PHRASES.test(rawInterpretation)
  ) {
    return rawInterpretation.replace(/\.$/, '');
  }

  return 'an everyday non-geological item (such as shoes, clothes, or household objects)';
}

/**
 * Detects clearly unrelated / non-geoscience text prompts or test messages while
 * preserving legitimate field descriptions (for example mentioning a boot or coin
 * alongside rock/outcrop context for scale).
 */
export function detectOffTopicText(text: string): {
  isOffTopic: boolean;
  detectedTopic: string | null;
} {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    return { isOffTopic: false, detectedTopic: null };
  }

  // If the message contains genuine geoscience vocabulary, allow it through
  // (e.g., "basalt boulder next to my shoe for scale").
  if (GEOSCIENCE_CONTEXT_PATTERN.test(trimmed)) {
    return { isOffTopic: false, detectedTopic: null };
  }

  for (const rule of OFF_TOPIC_TEXT_PATTERNS) {
    if (rule.pattern.test(trimmed)) {
      return { isOffTopic: true, detectedTopic: rule.label };
    }
  }

  if (/\b(test|testing)\b.*\b(platform|ai|bot|app|system)\b/i.test(trimmed)) {
    return { isOffTopic: true, detectedTopic: 'a general platform/AI test message without geoscience content' };
  }

  return { isOffTopic: false, detectedTopic: null };
}

export interface UnsupportedWarningOptions {
  channel?: 'whatsapp' | 'mobile' | 'api';
  inputKind?: 'media' | 'text' | 'voice' | 'command';
  detectedSubject?: string | null;
}

/**
 * Formats Earth Talk's standard domain warning whenever a user sends or enters
 * content outside Earth Talk's geoscience scope.
 */
export function buildUnsupportedInputWarning(options: UnsupportedWarningOptions = {}): string {
  const inputKind = options.inputKind ?? 'media';
  const subject = options.detectedSubject?.trim();

  const introLine =
    inputKind === 'media'
      ? subject
        ? `⚠️ Unsupported Submission: Your photo/video appears to show ${subject}, which we do not support on Earth Talk. No Geoscience Passport was created.`
        : `⚠️ Unsupported Submission: We could not find a geological or Earth-science feature in what you sent (for example everyday items like shoes, clothes, food, or indoor objects), which we do not support on Earth Talk. No Geoscience Passport was created.`
      : inputKind === 'voice'
        ? subject
          ? `⚠️ Unsupported Voice Topic: Your voice note appears to be about ${subject}, which we do not support on Earth Talk.`
          : `⚠️ Unsupported Voice Topic: Earth Talk only supports geoscience and Earth-observation topics.`
        : subject
          ? `⚠️ Unsupported Request: What you entered relates to ${subject}, which we do not support on Earth Talk.`
          : `⚠️ Unsupported Request: Earth Talk only supports geoscience observations and Earth-science questions.`;

  return [
    introLine,
    '',
    `🌍 Our Mission & Goal:`,
    `• Mission: ${EARTH_TALK_MISSION}`,
    `• Goal: ${EARTH_TALK_GOAL}`,
    '',
    `🪨 What Earth Talk Supports (Our Core Filters & Focus):`,
    `• What was observed: ${SUPPORTED_OBSERVED_SUMMARY}.`,
    `• Rock type: ${SUPPORTED_ROCK_TYPE_SUMMARY}.`,
    `• Evidence state: ${SUPPORTED_EVIDENCE_STATE_SUMMARY}.`,
    '',
    `📸 Please send a clear daylight photo or short video of a real geological layer, rock, landform, fossil, or mineral, or ask an Earth-science question.`,
  ].join('\n');
}

/**
 * Returns the human-readable "What was observed" label for a category.
 */
export function formatObservedCategoryLabel(category?: GeoscienceCategory | string | null): string {
  if (!category) return 'Geoscience observation';
  if (category in GEOSCIENCE_CATEGORY_LABELS) {
    return GEOSCIENCE_CATEGORY_LABELS[category as GeoscienceCategory];
  }
  return category.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}
