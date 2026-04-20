import { STAGE_COLORS, STAGE_LABELS } from '../store/data';

export function StageBadge({ stage }) {
  const cls = STAGE_COLORS[stage] || 'stg-new';
  return <span class={`sb ${cls}`}>{STAGE_LABELS[stage] || stage || 'NEW'}</span>;
}
