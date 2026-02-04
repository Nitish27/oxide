import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Check, RotateCcw } from 'lucide-react';
import { cn } from '../utils/cn';

interface PendingChangesProps {
  statements: string[];
  onCommit: (statements: string[]) => void;
  onDiscard: () => void;
  isCommitting?: boolean;
}

export const PendingChanges = ({ 
  statements: initialStatements, 
  onCommit, 
  onDiscard,
  isCommitting = false 
}: PendingChangesProps) => {
  const [expanded, setExpanded] = useState(true);
  const [editedStatements, setEditedStatements] = useState<string[]>(initialStatements);

  // Sync with prop when it significantly changes (e.g., new mutation added)
  // or if we were empty before
  useEffect(() => {
    if (initialStatements.length !== editedStatements.length) {
      setEditedStatements(initialStatements);
    }
  }, [initialStatements]);

  const handleStatementChange = (index: number, value: string) => {
    const next = [...editedStatements];
    next[index] = value;
    setEditedStatements(next);
  };

  if (initialStatements.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-yellow-500/30 bg-[#252526]">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-3 py-2 bg-yellow-500/10 cursor-pointer hover:bg-yellow-500/15 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="text-xs font-medium text-yellow-500">
            {initialStatements.length} pending change(s)
          </span>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onDiscard}
            disabled={isCommitting}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-white border border-border rounded hover:bg-border transition-colors disabled:opacity-50"
          >
            <RotateCcw size={10} />
            Discard
          </button>
          <button
            onClick={() => onCommit(editedStatements)}
            disabled={isCommitting}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-500 transition-colors font-medium disabled:opacity-50"
          >
            <Check size={10} />
            {isCommitting ? 'Committing...' : 'Commit'}
          </button>
        </div>
      </div>

      {/* SQL Preview / Editor */}
      {expanded && (
        <div className="p-3 max-h-48 overflow-auto font-mono text-[11px] space-y-2">
          {editedStatements.map((sql, index) => (
            <div key={index} className="flex items-start gap-2 group">
              <span className="text-text-muted select-none pt-1">{index + 1}.</span>
              <textarea
                value={sql}
                onChange={(e) => handleStatementChange(index, e.target.value)}
                rows={Math.max(1, sql.split('\n').length)}
                className={cn(
                  "flex-1 bg-transparent border-none outline-none resize-none p-1 rounded hover:bg-white/5 focus:bg-white/5",
                  sql.startsWith('INSERT') ? 'text-green-400' :
                  sql.startsWith('UPDATE') ? 'text-yellow-400' :
                  sql.startsWith('DELETE') ? 'text-red-400' : 'text-text-primary'
                )}
                spellCheck={false}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
