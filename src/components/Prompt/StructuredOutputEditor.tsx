import { useState, useEffect } from 'react';
import {
  FileJson,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Code,
  Eye,
  AlertCircle,
  Upload,
  Check,
} from 'lucide-react';
import { Button, Input, Select, Modal } from '../ui';
import { Collapsible } from '../ui/Collapsible';
import type { OutputSchema, SchemaField, SchemaFieldType } from '../../types/database';
import {
  createDefaultField,
  createEmptySchema,
  stringifySchema,
  parseJsonSchemaString,
  inferSchemaFromJson,
} from '../../lib/schema-utils';

const FIELD_TYPES: { value: SchemaFieldType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'array', label: 'Array' },
  { value: 'object', label: 'Object' },
];

interface SchemaFieldEditorProps {
  field: SchemaField;
  onChange: (field: SchemaField) => void;
  onDelete: () => void;
  depth?: number;
}

function SchemaFieldEditor({ field, onChange, onDelete, depth = 0 }: SchemaFieldEditorProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = field.type === 'object' || field.type === 'array';

  const handleAddProperty = () => {
    if (field.type === 'object') {
      const newProp = createDefaultField((field.properties?.length || 0) + 1);
      onChange({
        ...field,
        properties: [...(field.properties || []), newProp],
      });
    }
  };

  const handleUpdateProperty = (index: number, updatedProp: SchemaField) => {
    if (field.properties) {
      const newProps = [...field.properties];
      newProps[index] = updatedProp;
      onChange({ ...field, properties: newProps });
    }
  };

  const handleDeleteProperty = (index: number) => {
    if (field.properties) {
      onChange({ ...field, properties: field.properties.filter((_, i) => i !== index) });
    }
  };

  const handleSetArrayItems = () => {
    if (field.type === 'array' && !field.items) {
      onChange({
        ...field,
        items: createDefaultField(1),
      });
    }
  };

  return (
    <div
      className={`border border-slate-700 light:border-slate-200 rounded-lg ${depth > 0 ? 'ml-4' : ''}`}
    >
      <div className="flex items-center gap-2 p-3 bg-slate-800/30 light:bg-slate-50 rounded-t-lg">
        <GripVertical className="w-4 h-4 text-slate-600 cursor-move" />

        {hasChildren && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 hover:bg-slate-700 light:hover:bg-slate-200 rounded"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </button>
        )}

        <Input
          value={field.name}
          onChange={(e) => onChange({ ...field, name: e.target.value })}
          placeholder="字段名"
          className="flex-1 h-8 text-sm"
        />

        <Select
          value={field.type}
          onChange={(e) =>
            onChange({
              ...field,
              type: e.target.value as SchemaFieldType,
              items: e.target.value === 'array' ? createDefaultField(1) : undefined,
              properties: e.target.value === 'object' ? [] : undefined,
            })
          }
          options={FIELD_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          className="w-28 h-8 text-sm"
        />

        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ ...field, required: e.target.checked })}
            className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
          />
          必需
        </label>

        <Button variant="ghost" size="sm" onClick={onDelete} className="p-1.5">
          <Trash2 className="w-4 h-4 text-slate-500 hover:text-red-400" />
        </Button>
      </div>

      {expanded && (
        <div className="p-3 space-y-3 border-t border-slate-700 light:border-slate-200">
          <Input
            value={field.description || ''}
            onChange={(e) => onChange({ ...field, description: e.target.value })}
            placeholder="描述（可选）"
            className="text-sm"
          />

          {field.type === 'string' && (
            <Input
              value={field.enum?.join(', ') || ''}
              onChange={(e) =>
                onChange({
                  ...field,
                  enum: e.target.value ? e.target.value.split(',').map((s) => s.trim()) : undefined,
                })
              }
              placeholder="枚举值（用逗号分隔，可选）"
              className="text-sm"
            />
          )}

          {field.type === 'array' && (
            <div className="space-y-2">
              <div className="text-xs text-slate-500 mb-2">数组元素类型:</div>
              {field.items ? (
                <SchemaFieldEditor
                  field={field.items}
                  onChange={(items) => onChange({ ...field, items })}
                  onDelete={() => onChange({ ...field, items: undefined })}
                  depth={depth + 1}
                />
              ) : (
                <Button variant="secondary" size="sm" onClick={handleSetArrayItems}>
                  <Plus className="w-3 h-3 mr-1" />
                  定义元素类型
                </Button>
              )}
            </div>
          )}

          {field.type === 'object' && (
            <div className="space-y-2">
              <div className="text-xs text-slate-500 mb-2">对象属性:</div>
              {field.properties?.map((prop, index) => (
                <SchemaFieldEditor
                  key={index}
                  field={prop}
                  onChange={(p) => handleUpdateProperty(index, p)}
                  onDelete={() => handleDeleteProperty(index)}
                  depth={depth + 1}
                />
              ))}
              <Button variant="secondary" size="sm" onClick={handleAddProperty}>
                <Plus className="w-3 h-3 mr-1" />
                添加属性
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface StructuredOutputEditorProps {
  schema: OutputSchema | undefined;
  onChange: (schema: OutputSchema | undefined) => void;
  disabled?: boolean;
}

export function StructuredOutputEditor({
  schema,
  onChange,
  disabled,
}: StructuredOutputEditorProps) {
  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (schema && mode === 'json') {
      setJsonText(stringifySchema(schema));
      setJsonError(null);
    }
  }, [schema, mode]);

  const handleToggleEnabled = () => {
    if (schema?.enabled) {
      onChange({ ...schema, enabled: false });
    } else {
      onChange(schema ? { ...schema, enabled: true } : { ...createEmptySchema(), enabled: true });
    }
  };

  const handleAddField = () => {
    if (!schema) return;
    const newField = createDefaultField(schema.fields.length + 1);
    onChange({ ...schema, fields: [...schema.fields, newField] });
  };

  const handleUpdateField = (index: number, field: SchemaField) => {
    if (!schema) return;
    const newFields = [...schema.fields];
    newFields[index] = field;
    onChange({ ...schema, fields: newFields });
  };

  const handleDeleteField = (index: number) => {
    if (!schema) return;
    onChange({ ...schema, fields: schema.fields.filter((_, i) => i !== index) });
  };

  const handleJsonChange = (text: string) => {
    setJsonText(text);
    setJsonError(null);

    if (!text.trim()) {
      return;
    }

    const parsed = parseJsonSchemaString(text);
    if (parsed) {
      onChange({ ...parsed, enabled: schema?.enabled ?? true, name: schema?.name ?? 'response' });
    } else {
      setJsonError('无效的 JSON Schema 格式');
    }
  };

  const handleImportJson = () => {
    setImportError(null);

    if (!importText.trim()) {
      setImportError('请输入 JSON 示例');
      return;
    }

    const inferred = inferSchemaFromJson(importText);
    if (inferred) {
      onChange({ ...inferred, enabled: true });
      setShowImportModal(false);
      setImportText('');
    } else {
      setImportError('无法解析 JSON，请确保输入的是有效的 JSON 对象');
    }
  };

  const isEnabled = schema?.enabled ?? false;

  return (
    <>
      <Collapsible
        title="结构化输出"
        icon={<FileJson className="w-4 h-4 text-green-400" />}
        defaultOpen={false}
        action={
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleEnabled();
            }}
            disabled={disabled}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              isEnabled ? 'bg-cyan-500' : 'bg-slate-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                isEnabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        }
      >
        {isEnabled && schema && (
          <div className="space-y-3">
            {/* Mode switcher */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMode('visual')}
                disabled={disabled}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  mode === 'visual'
                    ? 'bg-cyan-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Eye className="w-3 h-3" />
                可视化
              </button>
              <button
                onClick={() => setMode('json')}
                disabled={disabled}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  mode === 'json'
                    ? 'bg-cyan-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Code className="w-3 h-3" />
                JSON
              </button>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowImportModal(true)}
                disabled={disabled}
                className="text-xs"
              >
                <Upload className="w-3 h-3 mr-1" />
                导入
              </Button>
            </div>

            {/* Schema name */}
            <div className="flex items-center gap-2">
              <Input
                value={schema.name}
                onChange={(e) => onChange({ ...schema, name: e.target.value })}
                placeholder="response"
                disabled={disabled}
                className="flex-1 text-sm"
              />
              <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={schema.strict}
                  onChange={(e) => onChange({ ...schema, strict: e.target.checked })}
                  disabled={disabled}
                  className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                />
                严格
              </label>
            </div>

            {/* Visual Editor */}
            {mode === 'visual' && (
              <div className="space-y-2">
                {schema.fields.length === 0 ? (
                  <div className="text-center py-3 border border-dashed border-slate-700 rounded-lg">
                    <p className="text-xs text-slate-500 mb-2">尚未定义输出结构</p>
                    <div className="flex items-center justify-center gap-2">
                      <Button variant="ghost" size="sm" onClick={handleAddField} disabled={disabled} className="text-xs">
                        <Plus className="w-3 h-3 mr-1" />
                        添加字段
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {schema.fields.map((field, index) => (
                      <SchemaFieldEditor
                        key={index}
                        field={field}
                        onChange={(f) => handleUpdateField(index, f)}
                        onDelete={() => handleDeleteField(index)}
                      />
                    ))}
                    <Button variant="ghost" size="sm" onClick={handleAddField} disabled={disabled} className="w-full text-xs">
                      <Plus className="w-3 h-3 mr-1" />
                      添加字段
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* JSON Editor */}
            {mode === 'json' && (
              <div className="space-y-2">
                <textarea
                  value={jsonText}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  disabled={disabled}
                  placeholder="输入 JSON Schema..."
                  className={`w-full h-32 px-2 py-1.5 bg-slate-800 light:bg-slate-100 border rounded text-xs font-mono text-slate-200 light:text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none ${
                    jsonError
                      ? 'border-red-500'
                      : 'border-slate-700 light:border-slate-200'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
                {jsonError && (
                  <div className="flex items-center gap-1 text-xs text-red-400">
                    <AlertCircle className="w-3 h-3" />
                    {jsonError}
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-slate-500">
              启用后 AI 将按定义的结构返回 JSON
            </p>
          </div>
        )}
      </Collapsible>

      {/* Import JSON Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setImportText('');
          setImportError(null);
        }}
        title="从 JSON 示例导入"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-400 light:text-slate-600">
            粘贴一个 JSON 示例，系统将自动推断出对应的 Schema 结构。
          </p>

          <textarea
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportError(null);
            }}
            placeholder={`示例：
{
  "name": "张三",
  "age": 25,
  "skills": ["React", "TypeScript"],
  "address": {
    "city": "北京",
    "district": "朝阳区"
  }
}`}
            className={`w-full h-64 px-3 py-2 bg-slate-800 light:bg-slate-100 border rounded-lg text-sm font-mono text-slate-200 light:text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none ${
              importError ? 'border-red-500' : 'border-slate-700 light:border-slate-200'
            }`}
          />

          {importError && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="w-4 h-4" />
              {importError}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowImportModal(false);
                setImportText('');
                setImportError(null);
              }}
            >
              取消
            </Button>
            <Button variant="primary" onClick={handleImportJson}>
              <Check className="w-4 h-4 mr-1" />
              导入并生成 Schema
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
