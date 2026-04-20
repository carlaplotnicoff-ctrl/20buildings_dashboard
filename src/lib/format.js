/**
 * Format a date string for display.
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format a date as relative time (e.g., "2d ago", "just now").
 */
export function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

/**
 * Check if a date is overdue (before today).
 */
export function isOverdue(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

/**
 * Check if a date is today.
 */
export function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

/**
 * Normalize company name suffixes for grouping.
 */
export function normalizeCompany(name) {
  if (!name) return '';
  return name
    .replace(/,?\s*(LLC|Inc\.?|Corp\.?|Co\.?|Cos\.?|L\.?P\.?|Ltd\.?|Group|Partners|Advisors|Holdings|Management|Properties|Realty)\s*$/i, '')
    .trim();
}

/**
 * Get initials from a name.
 */
export function getInitials(first, last) {
  return `${(first || '')[0] || ''}${(last || '')[0] || ''}`.toUpperCase();
}
