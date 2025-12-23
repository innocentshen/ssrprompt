export interface MySQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface FilterCondition {
  column: string;
  operator: string;
  value: unknown;
}

export interface QueryRequest {
  config: MySQLConfig;
  operation: 'select' | 'insert' | 'update' | 'delete' | 'test' | 'initialize' | 'get_schema_version' | 'execute_sql';
  table?: string;
  columns?: string;
  data?: Record<string, unknown> | Record<string, unknown>[];
  filters?: FilterCondition[];
  orderBy?: { column: string; ascending: boolean }[];
  limit?: number | null;
  singleRow?: boolean;
  sql?: string; // 用于 execute_sql 操作
}
