import { useState, useCallback, useEffect, useRef, memo } from "react";
import { Plus, Minus } from "lucide-react";

interface CellData {
  text: string;
  originalText: string; // Track original for change detection
  placeholderId: string | null; // Placeholder ID if this is an editable field
  rowspan: number;
  colspan: number;
  isHeader: boolean;
}

interface TableData {
  rows: CellData[][];
}

interface EditableHtmlTableProps {
  html: string;
  onUpdate: (newHtml: string) => void;
}

/**
 * Parse HTML table string into structured data
 */
function parseHtmlTable(html: string): TableData | null {
  const rows: CellData[][] = [];
  
  // Extract all <tr> elements
  const rowMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  
  for (const rowHtml of rowMatches) {
    const cells: CellData[] = [];
    
    // Match both th and td cells
    const cellPattern = /<(th|td)([^>]*)>([\s\S]*?)<\/\1>/gi;
    let match;
    
    while ((match = cellPattern.exec(rowHtml)) !== null) {
      const tag = match[1].toLowerCase();
      const attrs = match[2];
      const content = match[3];
      
      // Extract colspan
      const colspanMatch = attrs.match(/colspan\s*=\s*"(\d+)"/i);
      const colspan = colspanMatch ? parseInt(colspanMatch[1], 10) : 1;
      
      // Extract rowspan
      const rowspanMatch = attrs.match(/rowspan\s*=\s*"(\d+)"/i);
      const rowspan = rowspanMatch ? parseInt(rowspanMatch[1], 10) : 1;
      
      // Extract placeholder ID if present
      const placeholderMatch = attrs.match(/data-placeholder\s*=\s*"([^"]+)"/i);
      const placeholderId = placeholderMatch ? placeholderMatch[1] : null;
      
      // Extract data-original if present (used for non-empty cells)
      const originalMatch = attrs.match(/data-original\s*=\s*"([^"]+)"/i);
      const originalFromAttr = originalMatch ? originalMatch[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .trim() : null;
      
      // Decode HTML entities
      let text = content
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .trim();
      
      // AGGRESSIVE: Strip ALL placeholder markers from text
      // Supports both old format ({{FIELD_0_0}}) and new format ({{T0_R0_C0_G0}})
      // Remove them whether they're the entire text or embedded within
      let displayText = text
        .replace(/\{\{(FIELD_\d+_\d+|T\d+_R\d+_C\d+_G\d+)\}\}/g, '')
        .trim();
      
      // Use the original from attribute if available (for cells that had original text)
      const actualOriginal = originalFromAttr || displayText;
      
      cells.push({
        text: displayText,
        originalText: actualOriginal, // Store original for change tracking
        placeholderId,
        rowspan,
        colspan,
        isHeader: tag === 'th',
      });
    }
    
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  
  return rows.length > 0 ? { rows } : null;
}

/**
 * Convert table data back to HTML
 * Preserves data-placeholder attribute for export functionality
 */
function tableDataToHtml(data: TableData): string {
  const rowsHtml = data.rows.map(row => {
    const cellsHtml = row.map(cell => {
      const tag = cell.isHeader ? 'th' : 'td';
      let attrs = '';
      if (cell.colspan > 1) attrs += ` colspan="${cell.colspan}"`;
      if (cell.rowspan > 1) attrs += ` rowspan="${cell.rowspan}"`;
      
      // Always preserve placeholder ID if present (needed for export)
      if (cell.placeholderId) {
        attrs += ` data-placeholder="${cell.placeholderId}"`;
      }
      
      // ALWAYS add data-original if we have original text (for change tracking during export)
      if (cell.originalText.length > 0) {
        const escapedOriginal = cell.originalText
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        attrs += ` data-original="${escapedOriginal}"`;
      }
      
      const escapedText = cell.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<${tag}${attrs}>${escapedText}</${tag}>`;
    }).join('');
    return `<tr>${cellsHtml}</tr>`;
  }).join('');
  
  return `<table class="hwpx-table">${rowsHtml}</table>`;
}

/**
 * Memoized cell component to prevent re-rendering of other cells when one is edited
 */
const EditableCell = memo(function EditableCell({
  cell,
  rowIndex,
  cellIndex,
  onCellChange,
  inputStyle,
  cellStyle,
}: {
  cell: CellData;
  rowIndex: number;
  cellIndex: number;
  onCellChange: (rowIndex: number, cellIndex: number, value: string) => void;
  inputStyle: React.CSSProperties;
  cellStyle: React.CSSProperties;
}) {
  const CellTag = cell.isHeader ? 'th' : 'td';
  const isEditable = !!cell.placeholderId;
  
  // Use local state for immediate responsiveness
  const [localValue, setLocalValue] = useState(cell.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Sync local state with props only on initial mount or when cell identity changes
  const cellIdRef = useRef(cell.placeholderId);
  useEffect(() => {
    if (cellIdRef.current !== cell.placeholderId) {
      cellIdRef.current = cell.placeholderId;
      setLocalValue(cell.text);
    }
  }, [cell.placeholderId, cell.text]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
  }, []);

  // Debounced update to parent - only on blur to avoid constant re-renders
  const handleBlur = useCallback(() => {
    if (localValue !== cell.text) {
      onCellChange(rowIndex, cellIndex, localValue);
    }
  }, [localValue, cell.text, onCellChange, rowIndex, cellIndex]);

  return (
    <CellTag
      rowSpan={cell.rowspan > 1 ? cell.rowspan : undefined}
      colSpan={cell.colspan > 1 ? cell.colspan : undefined}
      style={{
        ...cellStyle,
        fontWeight: cell.isHeader ? 600 : 400,
        backgroundColor: cell.isHeader ? 'hsl(var(--muted) / 0.3)' : 'transparent',
      }}
    >
      {isEditable ? (
        <textarea
          ref={textareaRef}
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          style={{
            ...inputStyle,
            fontWeight: cell.isHeader ? 600 : 400,
            height: 'auto',
          }}
          rows={Math.max(3, localValue.split('\n').length + 1)}
        />
      ) : (
        <div
          style={{
            ...inputStyle,
            fontWeight: cell.isHeader ? 600 : 400,
            whiteSpace: 'pre-wrap',
          }}
        >
          {cell.text}
        </div>
      )}
    </CellTag>
  );
});

/**
 * Memoized title cell component
 */
const EditableTitleCell = memo(function EditableTitleCell({
  cell,
  rowIndex,
  onCellChange,
}: {
  cell: CellData;
  rowIndex: number;
  onCellChange: (rowIndex: number, cellIndex: number, value: string) => void;
}) {
  const isEditable = !!cell.placeholderId;
  const [localValue, setLocalValue] = useState(cell.text);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  }, []);

  const handleBlur = useCallback(() => {
    if (localValue !== cell.text) {
      onCellChange(rowIndex, 0, localValue);
    }
  }, [localValue, cell.text, onCellChange, rowIndex]);

  return (
    <div
      style={{
        padding: 0,
        textAlign: 'left',
        marginBottom: '8px',
      }}
    >
      {isEditable ? (
        <input
          type="text"
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          style={{
            width: '100%',
            padding: '8px 0',
            fontSize: '18px',
            fontWeight: 700,
            textAlign: 'left',
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
          }}
        />
      ) : (
        <div
          style={{
            padding: '8px 0',
            fontSize: '18px',
            fontWeight: 700,
          }}
        >
          {cell.text}
        </div>
      )}
    </div>
  );
});

function EditableHtmlTableInner({ html, onUpdate }: EditableHtmlTableProps) {
  const [tableData, setTableData] = useState<TableData | null>(() => parseHtmlTable(html));
  const initialHtmlRef = useRef(html);
  const pendingUpdateRef = useRef<string | null>(null);

  // Only re-parse if the HTML source is completely different (not from our own updates)
  useEffect(() => {
    // If this is the same HTML we just sent out, skip re-parsing
    if (pendingUpdateRef.current === html) {
      pendingUpdateRef.current = null;
      return;
    }
    
    // Only re-parse on truly external changes (very different HTML)
    const parsed = parseHtmlTable(html);
    if (parsed) {
      setTableData(parsed);
    }
    initialHtmlRef.current = html;
  }, [html]);

  const handleCellChange = useCallback(
    (rowIndex: number, cellIndex: number, value: string) => {
      setTableData(prevData => {
        if (!prevData) return prevData;

        const newRows = prevData.rows.map((row, rIdx) => {
          if (rIdx !== rowIndex) return row;
          return row.map((cell, cIdx) => {
            if (cIdx !== cellIndex) return cell;
            return { ...cell, text: value };
          });
        });

        const newData = { rows: newRows };
        const newHtml = tableDataToHtml(newData);
        
        // Track that we're about to send this HTML so we don't re-parse it
        pendingUpdateRef.current = newHtml;
        
        // Use setTimeout to batch updates and avoid blocking the UI
        setTimeout(() => {
          onUpdate(newHtml);
        }, 0);
        
        return newData;
      });
    },
    [onUpdate]
  );

  // Add a new row to the table (copies structure from last row)
  const handleAddRow = useCallback(() => {
    setTableData(prevData => {
      if (!prevData || prevData.rows.length === 0) return prevData;
      
      const lastRow = prevData.rows[prevData.rows.length - 1];
      const newRow: CellData[] = lastRow.map((cell, idx) => ({
        text: '',
        originalText: '',
        placeholderId: `NEW_R${prevData.rows.length}_C${idx}`,
        rowspan: 1,
        colspan: cell.colspan,
        isHeader: false,
      }));
      
      const newData = { rows: [...prevData.rows, newRow] };
      const newHtml = tableDataToHtml(newData);
      pendingUpdateRef.current = newHtml;
      setTimeout(() => onUpdate(newHtml), 0);
      
      return newData;
    });
  }, [onUpdate]);

  // Remove the last row from the table
  const handleRemoveRow = useCallback(() => {
    setTableData(prevData => {
      if (!prevData || prevData.rows.length <= 1) return prevData;
      
      const newRows = prevData.rows.slice(0, -1);
      const newData = { rows: newRows };
      const newHtml = tableDataToHtml(newData);
      pendingUpdateRef.current = newHtml;
      setTimeout(() => onUpdate(newHtml), 0);
      
      return newData;
    });
  }, [onUpdate]);

  if (!tableData) {
    return <p className="text-muted-foreground">테이블을 파싱할 수 없습니다.</p>;
  }

  // Check if this is a single-column table (all rows have only 1 cell)
  const isSingleColumnTable = tableData.rows.every(row => row.length === 1);

  // Detect if this is a TITLE table - VERY STRICT detection
  const isTitleTable = isSingleColumnTable && 
    tableData.rows.length === 1 && 
    tableData.rows[0]?.[0] && 
    (() => {
      const cellText = tableData.rows[0][0].text.trim();
      const hasRomanNumeral = /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\.\s/.test(cellText);
      const hasSectionNumber = /^\d+\.\s/.test(cellText);
      const hasKoreanMarker = /^[가나다라마바사아자차카타파하]\.\s/.test(cellText);
      return cellText.length < 60 && (hasRomanNumeral || hasSectionNumber || hasKoreanMarker);
    })();

  // For TITLE tables - render as styled title headers
  if (isTitleTable && tableData.rows.length > 0) {
    return (
      <div style={{ marginTop: '16px', marginBottom: '16px' }}>
        {tableData.rows.map((row, rowIndex) => {
          const cell = row[0];
          if (!cell) return null;
          
          return (
            <EditableTitleCell
              key={`title-${rowIndex}-${cell.placeholderId || 'static'}`}
              cell={cell}
              rowIndex={rowIndex}
              onCellChange={handleCellChange}
            />
          );
        })}
      </div>
    );
  }

  const cellStyle: React.CSSProperties = {
    border: '1px solid hsl(var(--foreground) / 0.3)',
    padding: 0,
    verticalAlign: 'top',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '60px',
    padding: '12px 16px',
    fontSize: '14px',
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    borderRadius: 0,
    resize: 'none',
    overflow: 'hidden',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
  };

  return (
    <div style={{ marginTop: '16px', marginBottom: '16px' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid hsl(var(--foreground) / 0.3)',
          tableLayout: 'auto',
        }}
      >
        <tbody>
          {tableData.rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <EditableCell
                  key={`cell-${rowIndex}-${cellIndex}-${cell.placeholderId || 'static'}`}
                  cell={cell}
                  rowIndex={rowIndex}
                  cellIndex={cellIndex}
                  onCellChange={handleCellChange}
                  inputStyle={inputStyle}
                  cellStyle={cellStyle}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* Row controls */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-end', 
        gap: '8px', 
        marginTop: '8px',
      }}>
        <button
          onClick={handleRemoveRow}
          disabled={tableData.rows.length <= 1}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 12px',
            fontSize: '13px',
            color: tableData.rows.length <= 1 ? 'hsl(var(--muted-foreground) / 0.5)' : 'hsl(var(--muted-foreground))',
            backgroundColor: 'transparent',
            border: '1px solid hsl(var(--border))',
            borderRadius: '4px',
            cursor: tableData.rows.length <= 1 ? 'not-allowed' : 'pointer',
          }}
        >
          <Minus size={14} />
          행 삭제
        </button>
        <button
          onClick={handleAddRow}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 12px',
            fontSize: '13px',
            color: 'hsl(var(--muted-foreground))',
            backgroundColor: 'transparent',
            border: '1px solid hsl(var(--border))',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <Plus size={14} />
          행 추가
        </button>
      </div>
    </div>
  );
}

// Export memoized version to prevent unnecessary re-renders from parent
export const EditableHtmlTable = memo(EditableHtmlTableInner);
