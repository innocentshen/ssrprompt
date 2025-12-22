import { useState, useEffect, useRef } from 'react';
import { Brain, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { MarkdownRenderer } from '../ui';

interface ThinkingBlockProps {
  content: string;
  isStreaming: boolean;
  durationMs?: number;
  defaultExpanded?: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function ThinkingBlock({
  content,
  isStreaming,
  durationMs,
  defaultExpanded = false,
}: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 流式输出时显示计时器
  useEffect(() => {
    if (isStreaming) {
      startTimeRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        setElapsedTime(Date.now() - startTimeRef.current);
      }, 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isStreaming]);

  // 完成后自动折叠
  useEffect(() => {
    if (!isStreaming && content) {
      // 延迟一下再折叠，让用户能看到完成状态
      const timer = setTimeout(() => {
        setIsExpanded(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, content]);

  if (!content && !isStreaming) {
    return null;
  }

  const displayDuration = durationMs ?? elapsedTime;

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
          isStreaming
            ? 'bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/30 animate-pulse'
            : 'bg-slate-800/50 light:bg-slate-100 border border-slate-700 light:border-slate-200 hover:bg-slate-800 light:hover:bg-slate-50'
        }`}
      >
        {/* 图标 */}
        <div className={`p-1.5 rounded-md ${
          isStreaming
            ? 'bg-purple-500/20 text-purple-400'
            : 'bg-slate-700 light:bg-slate-200 text-slate-400 light:text-slate-500'
        }`}>
          <Brain className="w-4 h-4" />
        </div>

        {/* 标题和状态 */}
        <div className="flex-1 flex items-center gap-2 text-left">
          <span className={`text-sm font-medium ${
            isStreaming
              ? 'text-purple-300 light:text-purple-600'
              : 'text-slate-300 light:text-slate-700'
          }`}>
            {isStreaming ? (
              <span className="flex items-center gap-1">
                思考中
                <span className="inline-flex">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                </span>
              </span>
            ) : (
              '思考完成'
            )}
          </span>

          {/* 耗时 */}
          {displayDuration > 0 && (
            <span className="flex items-center gap-1 text-xs text-slate-500 light:text-slate-500">
              <Clock className="w-3 h-3" />
              {formatDuration(displayDuration)}
            </span>
          )}
        </div>

        {/* 展开/折叠图标 */}
        <div className="text-slate-500 light:text-slate-400">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* 展开的内容 */}
      {isExpanded && (
        <div className={`mt-2 p-4 rounded-lg border ${
          isStreaming
            ? 'bg-purple-500/5 border-purple-500/20'
            : 'bg-slate-800/30 light:bg-slate-50 border-slate-700 light:border-slate-200'
        }`}>
          <div className="text-sm text-slate-400 light:text-slate-600">
            {content ? (
              <MarkdownRenderer content={content} />
            ) : (
              <span className="text-slate-500 light:text-slate-400 italic">
                正在思考...
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
