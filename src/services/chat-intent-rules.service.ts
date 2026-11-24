import { findOfflineGeoscienceAnswer } from './offline-geoscience-answer.service.js';

export interface LocalChatReply {
  reply: string;
  suggested_actions: string[];
}

const NEXT_STEP_PATTERN =
  /^(?:status|what next|what'?s next|whats next|next step|what now|how far|progress|am i done|ready to confirm)\b/i;
const MAP_PATTERN =
  /(?:map|mapped|mapping|gps|pin|location|coordinate|where.*(?:appear|visible|shown)|show.*map)/i;
const PRIVACY_PATTERN =
  /(?:privacy|private|public|publish|visibility|who.*(?:see|view)|hide|unpin)/i;
const SUBMIT_PATTERN =
  /(?:submit|submission|upload|send|post|create|make|record|document|analyse|analyze|identify|start).*(?:passport|observation|specimen|sample|rock|mineral|outcrop|photo|report|field)|(?:how|want|need).*(?:submit|upload|send|document|record)/i;

function nextStepReply(hasActivePassport: boolean): LocalChatReply {
  if (hasActivePassport) {
    return {
      reply:
        'Your Passport draft is active here. Next: attach an extra angle or short clip if useful, share a GPS pin or Rwanda place, then choose Keep Private, District Only, Approximate (~2 km), or Pin Exact. Confirm here and I will save it and map only what you approve.',
      suggested_actions: ['📍 Share Location Pin', 'Attach supporting video', '🔒 Keep Private'],
    };
  }

  return {
    reply:
      'Start with a clear daylight photo of the rock, mineral, fossil, outcrop, or landform. I will analyse it here, then ask for location, privacy, and final confirmation so the observation can be mapped only as you approve.',
    suggested_actions: ['Attach site photo', 'HELP', 'SITES'],
  };
}

function mapReply(hasActivePassport: boolean): LocalChatReply {
  if (hasActivePassport) {
    return {
      reply:
        'Your observation goes on the Earth Talk geological map only after you approve a visibility choice. Share a GPS pin or place, then choose Exact Point, Approximate (~2 km), District Only, or Keep Private. Keep Private stores the record but removes it from the public map.',
      suggested_actions: ['📍 Share Location Pin', '📍 Pin Approximate (~2 km)', '🔒 Keep Private'],
    };
  }

  return {
    reply:
      'Earth Talk maps an observation only after its Passport is confirmed. Attach a clear field photo first, add a GPS pin or place, then choose Exact Point, Approximate (~2 km), District Only, or Keep Private here in chat.',
    suggested_actions: ['Attach site photo', 'HELP'],
  };
}

function privacyReply(hasActivePassport: boolean): LocalChatReply {
  return {
    reply:
      (hasActivePassport
        ? 'For your active Passport, choose privacy right here: '
        : 'When your Passport is ready, choose privacy right here: ') +
      'Keep Private hides the record and coordinates from the public map; District Only shows the district; Approximate (~2 km) protects the exact point; Pin Exact shows the approved outcrop point. Nothing is published until you confirm.',
    suggested_actions: hasActivePassport
      ? ['🔒 Keep Private', '📍 Pin District Musanze', '📍 Pin Approximate (~2 km)']
      : ['Attach site photo', 'HELP'],
  };
}

function submitReply(hasActivePassport: boolean): LocalChatReply {
  if (hasActivePassport) {
    return {
      reply:
        'You can continue the same submission here. Add another angle or short clip, share your location, choose privacy, and confirm the Passport in this chat. No separate form or screen is needed.',
      suggested_actions: ['Attach supporting video', '📍 Share Location Pin', '🔒 Keep Private'],
    };
  }

  return {
    reply:
      'Send a clear daylight photo here and I will analyse it as a Geoscience Passport draft. Then we finish the same submission in chat: review the GeoAI summary, add location, choose privacy, and confirm it for the map.',
    suggested_actions: ['Attach site photo', 'HELP'],
  };
}

export function classifyWorkflowIntent(
  text: string,
  hasActivePassport: boolean
): LocalChatReply | null {
  const clean = String(text ?? '').trim();
  if (!clean) return null;

  if (NEXT_STEP_PATTERN.test(clean)) return nextStepReply(hasActivePassport);
  if (PRIVACY_PATTERN.test(clean)) return privacyReply(hasActivePassport);
  if (MAP_PATTERN.test(clean)) return mapReply(hasActivePassport);
  if (SUBMIT_PATTERN.test(clean)) return submitReply(hasActivePassport);
  return null;
}

export function buildLocalGeoscienceReply(
  text: string,
  hasActivePassport: boolean
): LocalChatReply | null {
  const answer = findOfflineGeoscienceAnswer(text);
  if (!answer) return null;

  const nextStep = hasActivePassport
    ? '\n\nIf this observation belongs to your active Passport, attach another angle or share its location, then confirm privacy here.'
    : '\n\nIf this is from a field specimen you are holding, send a clear daylight photo here and I will start its Geoscience Passport.';

  return {
    reply: answer + nextStep,
    suggested_actions: hasActivePassport
      ? ['📍 Share Location Pin', 'Attach supporting video', '🔒 Keep Private']
      : ['Attach site photo', 'HELP', 'SITES'],
  };
}
