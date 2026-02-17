interface WktEditorProps {
  value: string;
  onChange: (value: string) => void;
  onPaste: (value: string) => void;
  onCenter: () => void;
  error: string | null;
}

export default function WktEditor({ value, onChange, onPaste, onCenter, error }: WktEditorProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700 tracking-wide uppercase">WKT Output</h2>
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
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text');
          if (pasted) {
            e.preventDefault();
            onPaste(pasted);
          }
        }}
        placeholder={"Draw shapes on the map, or paste WKT here...\n\nSupported types:\n  POINT (x y)\n  LINESTRING (x y, x y, ...)\n  MULTILINESTRING ((x y, x y, ...), ...)\n  POLYGON ((x y, x y, ...))"}
        spellCheck={false}
        className="flex-1 p-4 font-mono text-sm resize-none focus:outline-none bg-white text-gray-900 placeholder-gray-400"
      />
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-red-600 text-xs font-mono">
          {error}
        </div>
      )}
    </div>
  );
}
