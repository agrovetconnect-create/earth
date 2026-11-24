import {
  EVIDENCE_STATE_EXPLANATIONS,
  EVIDENCE_STATE_HEX,
  EVIDENCE_STATE_LABELS,
  EVIDENCE_STATE_RANK,
  NO_EVIDENCE_HEX,
  isEvidenceState,
} from '../types/community';

/**
 * Safe display accessors for the evidence ladder, tolerating unknown states
 * the server may add later (falls back to the neutral "no evidence" colour).
 */

export function evidenceStateHex(state: string | null | undefined): string {
  return isEvidenceState(state) ? EVIDENCE_STATE_HEX[state] : NO_EVIDENCE_HEX;
}

export function evidenceStateLabel(state: string | null | undefined): string {
  return isEvidenceState(state) ? EVIDENCE_STATE_LABELS[state] : 'Not assessed';
}

export function evidenceStateExplanation(state: string | null | undefined): string {
  return isEvidenceState(state) ? EVIDENCE_STATE_EXPLANATIONS[state] : '';
}

export function evidenceStateRank(state: string | null | undefined): number {
  return isEvidenceState(state) ? EVIDENCE_STATE_RANK[state] : -1;
}
