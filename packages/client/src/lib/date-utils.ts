/**
 * Date formatting utilities
 * Provides safe date formatting that handles invalid dates gracefully
 */

/**
 * Format a date string to localized format
 * Returns fallback text if date is invalid
 */
export function formatDate(
  dateValue: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateValue) {
    return '-';
  }

  try {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleDateString('zh-CN', options);
  } catch {
    return '-';
  }
}

/**
 * Format a date string to localized date and time format
 * Returns fallback text if date is invalid
 */
export function formatDateTime(
  dateValue: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateValue) {
    return '-';
  }

  try {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleString('zh-CN', options);
  } catch {
    return '-';
  }
}

/**
 * Format a date as relative time (e.g., "2 hours ago", "3 days ago")
 * Falls back to absolute date if date is too old or invalid
 */
export function formatRelativeTime(
  dateValue: string | Date | null | undefined
): string {
  if (!dateValue) {
    return '-';
  }

  try {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return '-';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) {
      return '刚刚';
    } else if (diffMins < 60) {
      return `${diffMins} 分钟前`;
    } else if (diffHours < 24) {
      return `${diffHours} 小时前`;
    } else if (diffDays < 7) {
      return `${diffDays} 天前`;
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  } catch {
    return '-';
  }
}
