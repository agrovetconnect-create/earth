import type { ObservationSummary } from '../types/api';
<<<<<<< HEAD
import { getCurrentAppLanguage, translateAppText } from './language.ts';

export interface ObservationCardViewModel {
  title: string;
  category: string;
  location: string | null;
  description: string | null;
  verification: string;
  evidence: string | null;
  date: string | null;
}

export function observationCardViewModel(observation: ObservationSummary): ObservationCardViewModel {
  const lang = getCurrentAppLanguage();
  const rawCategory =
    observation.observation_category +
    (observation.observation_subcategory ? ` · ${observation.observation_subcategory}` : '');
  const rawEvidence = observation.evidence_state?.replaceAll('_', ' ') || null;
  const rawTitle =
    observation.post_title?.trim() ||
    observation.possible_name?.trim() ||
    translateAppText(lang, observation.observation_subcategory || observation.observation_category);

  return {
    title: rawTitle,
    category: translateAppText(lang, rawCategory),
    location:
      observation.district ||
      (observation.location_precision === 'private'
        ? translateAppText(lang, 'Location kept private')
        : null),
    description: observation.primary_interpretation,
    verification:
      observation.verification_status === 'expert_verified'
        ? translateAppText(lang, 'Expert reviewed')
        : translateAppText(lang, 'Unverified'),
    evidence: rawEvidence ? translateAppText(lang, rawEvidence) : null,
    date:
      observation.created_at && !Number.isNaN(Date.parse(observation.created_at))
        ? new Date(observation.created_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US')
        : null,
=======

export interface ObservationCardViewModel { title: string; category: string; location: string | null; description: string | null; verification: string; evidence: string | null; date: string | null }
export function observationCardViewModel(observation: ObservationSummary): ObservationCardViewModel {
  return {
    title: observation.post_title?.trim() || observation.possible_name?.trim() || observation.observation_subcategory || observation.observation_category,
    category: observation.observation_category + (observation.observation_subcategory ? ` · ${observation.observation_subcategory}` : ''),
    location: observation.district || (observation.location_precision === 'private' ? 'Location kept private' : null),
    description: observation.primary_interpretation,
    verification: observation.verification_status === 'expert_verified' ? 'Expert reviewed' : 'Unverified',
    evidence: observation.evidence_state?.replaceAll('_', ' ') || null,
    date: observation.created_at && !Number.isNaN(Date.parse(observation.created_at)) ? new Date(observation.created_at).toLocaleDateString() : null,
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  };
}
