import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { UseTableMutationsReturn } from '../hooks/useTableMutations';
import { SortConfig } from '../store/databaseStore';

interface DataTableProps {
  columns: string[];
  data: any[][];
  mutations: UseTableMutationsReturn;
  selectedRowIndex?: number | null;
  onRowClick?: (index: number | null) => void;
  sortConfig?: SortConfig;
  onSort?: (column: string) => void;
  hiddenColumns?: string[];
}

interface EditingCell {
  rowIndex: number;
  columnIndex: number;
}

const DEFAULT_COLUMN_WIDTH = 150;
const MIN_COLUMN_WIDTH = 60;

export const DataTable = ({ 
  columns: columnNames, 
  data,
  mutations,
  selectedRowIndex,
  onRowClick,
  sortConfig,
  onSort,
  hiddenColumns = []
}: DataTableProps) => {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [localData, setLocalData] = useState<any[][]>(data);
  const inputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  
  // Use refs for resize to avoid re-renders during drag
  const columnWidthsRef = useRef<Record<string, number>>({});
  const [, forceUpdate] = useState(0);
  const resizingColumnRef = useRef<string | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);
  const rafId = useRef<number | null>(null);

  // Filter out hidden columns
  const visibleColumnNames = useMemo(() => 
    columnNames.filter(col => !hiddenColumns.includes(col)),
    [columnNames, hiddenColumns]
  );

  // Map original column indices to visible indices
  const columnIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    columnNames.forEach((col, idx) => map.set(col, idx));
    return map;
  }, [columnNames]);

  // Sync local data with props
  useEffect(() => {
    setLocalData(data);
  }, [data]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // Optimized resize handlers using direct DOM manipulation
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColumnRef.current) return;
      
      // Cancel any pending RAF
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
      
      // Use RAF for smooth updates
      rafId.current = requestAnimationFrame(() => {
        const delta = e.clientX - resizeStartX.current;
        const newWidth = Math.max(MIN_COLUMN_WIDTH, resizeStartWidth.current + delta);
        const columnName = resizingColumnRef.current;
        
        if (columnName && tableRef.current) {
          // Direct DOM update for smoothness
          const headerCells = tableRef.current.querySelectorAll('th');
          const bodyCells = tableRef.current.querySelectorAll('td');
          
          headerCells.forEach((cell) => {
            if (cell.getAttribute('data-column') === columnName) {
              cell.style.width = `${newWidth}px`;
              cell.style.minWidth = `${newWidth}px`;
              cell.style.maxWidth = `${newWidth}px`;
            }
          });
          
          bodyCells.forEach((cell) => {
            if (cell.getAttribute('data-column') === columnName) {
              cell.style.width = `${newWidth}px`;
              cell.style.minWidth = `${newWidth}px`;
              cell.style.maxWidth = `${newWidth}px`;
            }
          });
          
          // Also update ref for persistence
          columnWidthsRef.current[columnName] = newWidth;
        }
      });
    };

    const handleMouseUp = () => {
      if (resizingColumnRef.current) {
        resizingColumnRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Force one update to sync state with refs
        forceUpdate(n => n + 1);
      }
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  const handleResizeStart = useCallback((columnName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidthsRef.current[columnName] || DEFAULT_COLUMN_WIDTH;
    resizingColumnRef.current = columnName;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const getColumnWidth = useCallback((columnName: string): number => {
    return columnWidthsRef.current[columnName] || DEFAULT_COLUMN_WIDTH;
  }, []);

  const startEditing = useCallback((rowIndex: number, columnIndex: number, value: any) => {
    setEditingCell({ rowIndex, columnIndex });
    setEditValue(value === null ? '' : String(value));
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;

    const { rowIndex, columnIndex } = editingCell;
    const columnName = columnNames[columnIndex];
    const originalValue = data[rowIndex]?.[columnIndex];
    
    // Parse value back to appropriate type
    let newValue: any = editValue;
    if (editValue === '' || editValue.toLowerCase() === 'null') {
      newValue = null;
    } else if (originalValue !== null && typeof originalValue === 'number') {
      newValue = parseFloat(editValue) || 0;
    } else if (originalValue !== null && typeof originalValue === 'boolean') {
      newValue = editValue.toLowerCase() === 'true';
    }

    // Update local data
    setLocalData(prev => {
      const next = prev.map(row => [...row]);
      if (next[rowIndex]) {
        next[rowIndex][columnIndex] = newValue;
      }
      return next;
    });

    // Track the mutation
    mutations.updateCell(rowIndex, columnName, columnIndex, originalValue, newValue);

    cancelEditing();
  }, [editingCell, editValue, columnNames, data, mutations, cancelEditing]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      cancelEditing();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitEdit();
      // Move to next cell
      if (editingCell) {
        const nextCol = editingCell.columnIndex + 1;
        if (nextCol < columnNames.length) {
          const value = localData[editingCell.rowIndex]?.[nextCol];
          startEditing(editingCell.rowIndex, nextCol, value);
        }
      }
    }
  }, [commitEdit, cancelEditing, editingCell, columnNames.length, localData, startEditing]);

  const getRowStyle = useCallback((rowIndex: number): string => {
    const change = mutations.getRowState(rowIndex);
    if (!change) return '';
    
    switch (change.type) {
      case 'insert': return 'bg-green-500/10 border-l-2 border-l-green-500';
      case 'update': return 'bg-yellow-500/10 border-l-2 border-l-yellow-500';
      case 'delete': return 'bg-red-500/10 border-l-2 border-l-red-500 opacity-50';
      default: return '';
    }
  }, [mutations]);

  const getCellStyle = useCallback((rowIndex: number, columnName: string): string => {
    const change = mutations.getRowState(rowIndex);
    if (change?.type === 'update' && change.cellChanges) {
      const cellChanged = change.cellChanges.some(c => c.columnName === columnName);
      if (cellChanged) return 'bg-yellow-500/20';
    }
    return '';
  }, [mutations]);

  const columns = useMemo(() => {
    const helper = createColumnHelper<any[]>();
    return visibleColumnNames.map((name) => {
      const originalIndex = columnIndexMap.get(name) ?? 0;
      return helper.accessor(row => row[originalIndex], {
        id: name,
        header: () => {
          const isSorted = sortConfig?.column === name;
          const sortDirection = sortConfig?.direction;
          return (
            <div className="flex items-center justify-between w-full h-full">
              <div 
                className="flex items-center gap-1 cursor-pointer select-none group flex-1 min-w-0"
                onClick={() => onSort?.(name)}
              >
                <span className="truncate">{name}</span>
                <span className={`transition-opacity flex-shrink-0 ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                  {isSorted && sortDirection === 'DESC' ? (
                    <ChevronDown size={14} className="text-[#007acc]" />
                  ) : (
                    <ChevronUp size={14} className={isSorted ? 'text-[#007acc]' : 'text-[#666]'} />
                  )}
                </span>
              </div>
            </div>
          );
        },
        cell: info => {
          const value = info.getValue();
          const rowIndex = info.row.index;
          const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.columnIndex === originalIndex;
          const isDeleted = mutations.getRowState(rowIndex)?.type === 'delete';

          if (isEditing) {
            return (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={commitEdit}
                className="w-full bg-accent/20 border border-accent rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
              />
            );
          }

          return (
            <span 
              className={`cursor-text ${isDeleted ? 'line-through' : ''}`}
              onDoubleClick={() => !isDeleted && startEditing(rowIndex, originalIndex, value)}
            >
              {value === null ? (
                <span className="text-text-muted italic">NULL</span>
              ) : typeof value === 'boolean' ? (
                value ? 'true' : 'false'
              ) : (
                String(value)
              )}
            </span>
          );
        },
      });
    });
  }, [visibleColumnNames, columnIndexMap, editingCell, editValue, handleKeyDown, commitEdit, startEditing, mutations, sortConfig, onSort]);

  const table = useReactTable({
    data: localData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const { rows } = table.getRowModel();

  // Empty state
  if (columnNames.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        No data to display
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Table */}
      <div 
        className="flex-1 overflow-auto bg-background"
        style={{ height: '100%', width: '100%' }}
      >
        <table 
          ref={tableRef}
          className="border-collapse text-xs" 
          style={{ tableLayout: 'fixed' }}
        >
          <thead className="sticky top-0 z-10 bg-sidebar border-b border-border shadow-sm">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  const width = getColumnWidth(header.id);
                  return (
                    <th 
                      key={header.id}
                      data-column={header.id}
                      className="px-3 py-2 text-left font-semibold text-text-secondary border-r border-border truncate relative group"
                      style={{ 
                        width,
                        minWidth: MIN_COLUMN_WIDTH,
                        maxWidth: width
                      }}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {/* Resize handle */}
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-transparent hover:bg-[#007acc] transition-colors"
                        onMouseDown={(e) => handleResizeStart(header.id, e)}
                        style={{ transform: 'translateX(50%)' }}
                      />
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr 
                key={row.id}
                onClick={() => onRowClick?.(index)}
                className={`hover:bg-accent/5 border-b border-border group cursor-default outline-none ${
                   selectedRowIndex === index ? 'bg-[#2a2d2e] ring-1 ring-inset ring-accent/50' : ''
                } ${getRowStyle(index)}`}
              >
                {row.getVisibleCells().map(cell => {
                  const width = getColumnWidth(cell.column.id);
                  return (
                    <td 
                      key={cell.id}
                      data-column={cell.column.id}
                      className={`px-3 py-1 border-r border-border truncate whitespace-nowrap overflow-hidden ${getCellStyle(index, cell.column.id)}`}
                      style={{ 
                        width,
                        minWidth: MIN_COLUMN_WIDTH,
                        maxWidth: width
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
