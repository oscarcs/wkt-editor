import { useCallback, useRef, useEffect, useMemo } from 'react';
import type { WktRange } from '../lib/wkt';

interface WktEditorProps {
  value: string;
  onChange: (value: string) => void;
  onPaste: (value: string) => void;
  onCenter: () => void;
  error: string | null;
  ranges: WktRange[];
  activeIndex: number | null;
  onHoverIndex: (index: number | null) => void;
}

function indexAtOffset(ranges: WktRange[], offset: number): number | null {
  for (let i = 0; i < ranges.length; i++) {
    if (offset >= ranges[i].start && offset <= ranges[i].end) {
      return i;
    }
  }
  return null;
}

/** Build segments splitting value at range boundaries, tagging each with its range index */
function buildSegments(value: string, ranges: WktRange[]): { text: string; index: number | null }[] {
  const segments: { text: string; index: number | null }[] = [];
  let cursor = 0;
  for (let i = 0; i < ranges.length; i++) {
    const { start, end } = ranges[i];
    if (start > cursor) segments.push({ text: value.slice(cursor, start), index: null });
    segments.push({ text: value.slice(start, end), index: i });
    cursor = end;
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), index: null });
  return segments;
}

const EDITOR_CLASSES = 'p-4 font-mono text-sm';

export default function WktEditor({ value, onChange, onPaste, onCenter, error, ranges, activeIndex, onHoverIndex }: WktEditorProps) {
  const lastIndexRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  const segments = useMemo(() => buildSegments(value, ranges), [value, ranges]);

  // Sync mirror scroll with textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const handler = () => {
      if (mirrorRef.current) {
        mirrorRef.current.scrollTop = ta.scrollTop;
        mirrorRef.current.scrollLeft = ta.scrollLeft;
      }
    };
    ta.addEventListener('scroll', handler);
    return () => ta.removeEventListener('scroll', handler);
  }, []);

  const updateIndex = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const idx = pos >= ta.value.length ? null : indexAtOffset(ranges, pos);
    if (idx !== lastIndexRef.current) {
      lastIndexRef.current = idx;
      onHoverIndex(idx);
    }
  }, [ranges, onHoverIndex]);

  useEffect(() => {
    const handler = () => {
      if (document.activeElement === textareaRef.current) updateIndex();
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [updateIndex]);

  const handleBlur = useCallback(() => {
    if (lastIndexRef.current !== null) {
      lastIndexRef.current = null;
      onHoverIndex(null);
    }
  }, [onHoverIndex]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <h1 className="text-sm font-semibold text-gray-700 tracking-wide uppercase">WKT Editor</h1>
        <div className="flex gap-2">
          <button
            onClick={onCenter}
            className="text-xs px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors cursor-pointer"
          >
            Center
          </button>
          <button
            onClick={() => {
              if (value) navigator.clipboard.writeText(value);
            }}
            className="text-xs px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors cursor-pointer"
          >
            Copy
          </button>
          <button
            onClick={() => {
              if (!value.trim()) return;
              const quantized = value.replace(/-?\d+\.?\d*/g, (m) => {
                const n = parseFloat(m);
                return isNaN(n) ? m : (Math.round(n * 100) / 100).toString();
              });
              onChange(quantized);
            }}
            className="text-xs px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors cursor-pointer"
          >
            Quantize
          </button>
          <button
            onClick={() => onChange('')}
            className="text-xs px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      </div>
      <p className="px-4 py-1.5 text-xs text-gray-400 border-b border-gray-100">Draw shapes to generate WKT, or paste WKT to visualize it.</p>
      <div className="relative flex-1 min-h-0">
        {/* Mirror div renders colored text */}
        <div
          ref={mirrorRef}
          aria-hidden
          className={`absolute inset-0 w-full h-full ${EDITOR_CLASSES} whitespace-pre-wrap break-words overflow-hidden pointer-events-none`}
        >
          {segments.map((seg, i) => (
            <span
              key={i}
              style={{ color: seg.index === activeIndex ? '#b91c1c' : '#111827' }}
            >
              {seg.text}
            </span>
          ))}
        </div>
        {/* Textarea on top handles input, but its text is transparent */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text');
            if (pasted) {
              e.preventDefault();
              onPaste(pasted);
            }
          }}
          placeholder={"Draw shapes on the map, or paste WKT here...\n\nSupported types:\n  POINT (x y)\n  LINESTRING (x y, x y, ...)\n  MULTILINESTRING ((x y, x y, ...), ...)\n  POLYGON ((x y, x y, ...))"}
          spellCheck={false}
          className={`absolute inset-0 w-full h-full ${EDITOR_CLASSES} resize-none focus:outline-none bg-transparent caret-gray-900 placeholder-gray-400 border-0`}
          style={{ color: 'transparent' }}
        />
      </div>
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-red-600 text-xs font-mono">
          {error}
        </div>
      )}
    </div>
  );
}
