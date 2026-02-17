import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Play, Square, Clock, Database as DatabaseIcon } from 'lucide-react';
import { SQLEditor } from './SQLEditor';
import { QueryResultsTable } from './QueryResultsTable';
import { useDatabaseStore } from '../store/databaseStore';

interface TabContentQueryProps {
  id: string;
  initialQuery?: string;
  connectionId: string;
}

export const TabContentQuery = ({ id, initialQuery = '', connectionId }: TabContentQueryProps) => {
  const { updateTab, addToHistory, activeDatabase } = useDatabaseStore();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<{ columns: string[]; rows: any[][] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ time: number; rows: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const generationRef = useRef(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  const startTimer = () => {
    setElapsed(0);
    elapsedTimerRef.current = setInterval(() => {
      setElapsed(prev => prev + 100);
    }, 100);
  };

  const stopTimer = () => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  const handleQueryChange = (value: string | undefined) => {
    const newVal = value || '';
    setQuery(newVal);
    updateTab(id, { query: newVal });
  };

  const stopQuery = useCallback(() => {
    generationRef.current += 1;
    setLoading(false);
    stopTimer();
    setError('Query cancelled by user');
    setResults(null);
    setStats(null);
  }, []);

  const runQuery = useCallback(async () => {
    if (!query.trim()) return;
    if (loading) {
      stopQuery();
      return;
    }

    const currentGen = ++generationRef.current;
    setLoading(true);
    setError(null);
    startTimer();
    const start = performance.now();

    try {
      const result = await invoke<any>('execute_query', { 
        connectionId, 
        sql: query 
      });

      // If generation changed (user clicked Stop), discard result
      if (currentGen !== generationRef.current) return;

      if (result && result.columns) {
        setResults({ columns: result.columns, rows: result.rows });
        const time = result.execution_time_ms || Math.round(performance.now() - start);
        const rowsCount = result.rows.length;
        
        setStats({ 
          time, 
          rows: rowsCount 
        });

        // Add to history
        addToHistory({
          sql: query,
          connectionId,
          database: activeDatabase || undefined,
          executionTimeMs: time,
          rowsAffected: rowsCount
        });
      }
    } catch (err: any) {
      if (currentGen !== generationRef.current) return;
      console.error("[ERROR] Query execution failed:", err);
      setError(err.toString());
      setResults(null);
      setStats(null);
    } finally {
      if (currentGen === generationRef.current) {
        setLoading(false);
        stopTimer();
      }
    }
  }, [query, connectionId, loading, stopQuery]);

  const formatElapsed = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1e]">
      {/* Query Toolbar */}
      <div className="h-9 px-4 flex items-center gap-4 bg-[#2C2C2C] border-b border-[#1e1e1e] shrink-0">
        <button 
          onClick={runQuery}
          className={`flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-bold transition-colors ${
            loading 
              ? 'bg-red-600 hover:bg-red-500 text-white' 
              : 'bg-accent hover:bg-accent/90 text-white'
          }`}
        >
          {loading ? (
            <>
              <Square size={10} fill="currentColor" />
              STOP
            </>
          ) : (
            <>
              <Play size={12} fill="currentColor" />
              RUN
            </>
          )}
        </button>

        {loading && (
          <div className="flex items-center gap-1.5 text-[10px] text-yellow-400 font-mono animate-pulse">
            <Clock size={12} />
            <span>{formatElapsed(elapsed)}</span>
          </div>
        )}
        
        <div className="flex-1" />

        {stats && !loading && (
          <div className="flex items-center gap-3 text-[10px] text-text-muted">
            <div className="flex items-center gap-1">
              <Clock size={12} />
              <span>{stats.time}ms</span>
            </div>
            <div className="flex items-center gap-1">
              <DatabaseIcon size={12} />
              <span>{stats.rows} rows</span>
            </div>
          </div>
        )}
      </div>

      {/* Editor & Results Split (Simple vertical for now) */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 border-b border-[#3C3C3C] relative min-h-[100px]">
          <SQLEditor 
            value={query} 
            onChange={handleQueryChange} 
            onRun={runQuery}
          />
        </div>
        
        <div className="h-[40%] min-h-[150px] bg-[#1a1a1a] flex flex-col relative overflow-hidden">
          <div className="px-3 py-1 bg-[#252526] text-[10px] font-bold text-text-muted uppercase tracking-wider border-b border-[#1e1e1e]">
            Results
          </div>
          
          <div className="flex-1 overflow-auto relative">
            {error ? (
              <div className={`p-4 font-mono text-[11px] ${error === 'Query cancelled by user' ? 'text-yellow-400 bg-yellow-500/5' : 'text-red-500 bg-red-500/5'}`}>
                <span className="font-bold">{error === 'Query cancelled by user' ? 'Cancelled:' : 'Error:'}</span> {error}
              </div>
            ) : results ? (
              <QueryResultsTable columns={results.columns} data={results.rows} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-text-muted text-[11px] italic h-full">
                {loading ? 'Executing query...' : 'Execute a query to see results'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
