import type { FilterCondition } from '../types/index.js';

export function buildWhereClause(filters: FilterCondition[]): { sql: string; values: unknown[] } {
  if (!filters || filters.length === 0) {
    return { sql: '', values: [] };
  }

  const conditions: string[] = [];
  const values: unknown[] = [];

  for (const filter of filters) {
    const col = filter.column.replace(/[^a-zA-Z0-9_]/g, '');
    if (filter.operator === 'IN') {
      const arr = filter.value as unknown[];
      const placeholders = arr.map(() => '?').join(', ');
      conditions.push(`${col} IN (${placeholders})`);
      values.push(...arr);
    } else {
      conditions.push(`${col} ${filter.operator} ?`);
      values.push(filter.value);
    }
  }

  return { sql: ' WHERE ' + conditions.join(' AND '), values };
}

export function buildOrderByClause(orderBy: { column: string; ascending: boolean }[]): string {
  if (!orderBy || orderBy.length === 0) {
    return '';
  }

  const parts = orderBy.map(o => {
    const col = o.column.replace(/[^a-zA-Z0-9_]/g, '');
    return `${col} ${o.ascending ? 'ASC' : 'DESC'}`;
  });

  return ' ORDER BY ' + parts.join(', ');
}

export function processRow(row: Record<string, unknown>): Record<string, unknown> {
  const processed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      processed[key] = value.toISOString();
    } else if (typeof value === 'string' && (
      key.includes('variables') ||
      key.includes('config') ||
      key.includes('results') ||
      key.includes('metadata') ||
      key.includes('scores') ||
      key.includes('ai_feedback') ||
      key.includes('attachments') ||
      key === 'capabilities' ||
      key === 'input_variables'
    )) {
      try {
        processed[key] = JSON.parse(value);
      } catch {
        processed[key] = value;
      }
    } else {
      processed[key] = value;
    }
  }
  return processed;
}
