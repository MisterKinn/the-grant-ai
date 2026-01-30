import { useState, useEffect, useCallback } from "react";

interface TableData {
  headers: string[];
  rows: string[][];
}

interface EditableMarkdownTableProps {
  markdown: string;
  onUpdate: (newMarkdown: string) => void;
}

// Parse markdown table string into structured data
function parseMarkdownTable(markdown: string): TableData | null {
  const lines = markdown.trim().split("\n");
  if (lines.length < 2) return null;

  // Check if it looks like a markdown table
  const separatorIndex = lines.findIndex((line) =>
    /^\|[\s\-:|]+\|$/.test(line.trim())
  );
  if (separatorIndex === -1) return null;

  const headerLine = lines[separatorIndex - 1];
  if (!headerLine || !headerLine.includes("|")) return null;

  const headers = headerLine
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell !== "");

  const rows: string[][] = [];
  for (let i = separatorIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || !line.includes("|")) continue;

    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell, idx, arr) => idx > 0 && idx < arr.length - 1 || cell !== "");
    
    // Normalize row to match header length
    while (cells.length < headers.length) {
      cells.push("");
    }
    rows.push(cells.slice(0, headers.length));
  }

  return { headers, rows };
}

// Convert structured data back to markdown table
function tableDataToMarkdown(data: TableData): string {
  const headerRow = `| ${data.headers.join(" | ")} |`;
  const separator = `| ${data.headers.map(() => "---").join(" | ")} |`;
  const bodyRows = data.rows.map((row) => `| ${row.join(" | ")} |`);

  return [headerRow, separator, ...bodyRows].join("\n");
}

export function EditableMarkdownTable({
  markdown,
  onUpdate,
}: EditableMarkdownTableProps) {
  const [tableData, setTableData] = useState<TableData | null>(null);

  useEffect(() => {
    const parsed = parseMarkdownTable(markdown);
    setTableData(parsed);
  }, [markdown]);

  const handleCellChange = useCallback(
    (rowIndex: number, colIndex: number, value: string) => {
      if (!tableData) return;

      const newRows = [...tableData.rows];
      newRows[rowIndex] = [...newRows[rowIndex]];
      newRows[rowIndex][colIndex] = value;

      const newData = { ...tableData, rows: newRows };
      setTableData(newData);
      onUpdate(tableDataToMarkdown(newData));
    },
    [tableData, onUpdate]
  );

  const handleHeaderChange = useCallback(
    (colIndex: number, value: string) => {
      if (!tableData) return;

      const newHeaders = [...tableData.headers];
      newHeaders[colIndex] = value;

      const newData = { ...tableData, headers: newHeaders };
      setTableData(newData);
      onUpdate(tableDataToMarkdown(newData));
    },
    [tableData, onUpdate]
  );

  if (!tableData) {
    return <p className="text-muted-foreground">테이블을 파싱할 수 없습니다.</p>;
  }

  return (
    <table className="w-full my-4 border-collapse" style={{ border: '1px solid hsl(var(--foreground) / 0.3)' }}>
      <thead>
        <tr>
          {tableData.headers.map((header, colIndex) => (
            <th
              key={colIndex}
              style={{ 
                border: '1px solid hsl(var(--foreground) / 0.3)',
                backgroundColor: 'hsl(var(--muted) / 0.5)',
                padding: 0
              }}
            >
              <input
                type="text"
                value={header}
                onChange={(e) => handleHeaderChange(colIndex, e.target.value)}
                style={{ 
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '14px',
                  fontWeight: 600,
                  backgroundColor: 'transparent',
                  border: 'none',
                  outline: 'none',
                  borderRadius: 0
                }}
              />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tableData.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, colIndex) => (
              <td
                key={colIndex}
                style={{ 
                  border: '1px solid hsl(var(--foreground) / 0.3)',
                  padding: 0
                }}
              >
                <input
                  type="text"
                  value={cell}
                  onChange={(e) =>
                    handleCellChange(rowIndex, colIndex, e.target.value)
                  }
                  style={{ 
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '14px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    outline: 'none',
                    borderRadius: 0
                  }}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
