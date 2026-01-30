import { useMemo, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EditableMarkdownTable } from "./EditableMarkdownTable";
import { EditableHtmlTable } from "./EditableHtmlTable";

interface EditableMarkdownContentProps {
  content: string;
  onContentChange: (newContent: string) => void;
}

interface ContentSegment {
  type: "text" | "table" | "html-table" | "image";
  content: string;
  startIndex: number;
  endIndex: number;
}

// Split markdown content into text, markdown tables, HTML tables, and images
function splitContentIntoSegments(markdown: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  
  // First, find all HTML tables (from new parser) - match tables with any attributes
  const htmlTablePattern = /<table class="hwpx-table"[^>]*>[\s\S]*?<\/table>/g;
  
  // Find all images - markdown format ![alt](url)
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  
  // Collect all special patterns with their positions
  interface PatternMatch {
    type: "html-table" | "image";
    match: string;
    startIndex: number;
    endIndex: number;
    url?: string;
  }
  
  const allMatches: PatternMatch[] = [];
  
  // Find HTML tables
  let match;
  while ((match = htmlTablePattern.exec(markdown)) !== null) {
    allMatches.push({
      type: "html-table",
      match: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }
  
  // Find images
  while ((match = imagePattern.exec(markdown)) !== null) {
    allMatches.push({
      type: "image",
      match: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      url: match[2], // The URL is in the second capture group
    });
  }
  
  // Sort by position
  allMatches.sort((a, b) => a.startIndex - b.startIndex);
  
  let lastIndex = 0;
  
  for (const pm of allMatches) {
    // Add text before this match
    if (pm.startIndex > lastIndex) {
      const textContent = markdown.slice(lastIndex, pm.startIndex);
      if (textContent.trim()) {
        // Check for markdown tables in the text content
        const textSegments = processTextForMarkdownTables(textContent, lastIndex);
        segments.push(...textSegments);
      }
    }
    
    // Add the matched element
    if (pm.type === "html-table") {
      segments.push({
        type: "html-table",
        content: pm.match,
        startIndex: pm.startIndex,
        endIndex: pm.endIndex,
      });
    } else if (pm.type === "image") {
      segments.push({
        type: "image",
        content: pm.url || pm.match,
        startIndex: pm.startIndex,
        endIndex: pm.endIndex,
      });
    }
    
    lastIndex = pm.endIndex;
  }
  
  // Add remaining text
  if (lastIndex < markdown.length) {
    const remainingContent = markdown.slice(lastIndex);
    if (remainingContent.trim()) {
      const textSegments = processTextForMarkdownTables(remainingContent, lastIndex);
      segments.push(...textSegments);
    }
  }
  
  return segments;
}

// Process text content to find markdown tables
function processTextForMarkdownTables(text: string, baseIndex: number): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const lines = text.split("\n");
  let currentSegment: ContentSegment | null = null;
  let charIndex = baseIndex;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = charIndex;
    const lineEnd = charIndex + line.length;

    const isTableLine = line.trim().startsWith("|") && line.trim().endsWith("|");
    const isSeparator = /^\|[\s\-:|]+\|$/.test(line.trim());

    if (isTableLine || isSeparator) {
      if (currentSegment && currentSegment.type === "text") {
        segments.push(currentSegment);
        currentSegment = null;
      }

      if (!currentSegment) {
        currentSegment = {
          type: "table",
          content: line,
          startIndex: lineStart,
          endIndex: lineEnd,
        };
      } else {
        currentSegment.content += "\n" + line;
        currentSegment.endIndex = lineEnd;
      }
    } else {
      if (currentSegment && currentSegment.type === "table") {
        segments.push(currentSegment);
        currentSegment = null;
      }

      if (!currentSegment) {
        currentSegment = {
          type: "text",
          content: line,
          startIndex: lineStart,
          endIndex: lineEnd,
        };
      } else {
        currentSegment.content += "\n" + line;
        currentSegment.endIndex = lineEnd;
      }
    }

    charIndex = lineEnd + 1;
  }

  if (currentSegment) {
    segments.push(currentSegment);
  }

  return segments;
}

// Editable text block component - inline contentEditable with line break preservation
// Also hides {{placeholder}} patterns from display
function EditableTextBlock({ 
  content, 
  onUpdate 
}: { 
  content: string; 
  onUpdate: (newContent: string) => void;
}) {
  // Filter out placeholder patterns like {{T7_R0_C0_G39}} from display
  const displayContent = content.replace(/\{\{[^}]+\}\}/g, '').trim();
  
  // If content is only placeholders, don't render anything
  if (!displayContent) {
    return null;
  }
  
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // Get innerHTML and convert <br> and <div> to newlines
    let html = e.currentTarget.innerHTML;
    // Replace <br>, <div>, </div> with newlines
    html = html.replace(/<br\s*\/?>/gi, '\n');
    html = html.replace(/<\/div><div>/gi, '\n');
    html = html.replace(/<div>/gi, '\n');
    html = html.replace(/<\/div>/gi, '');
    // Strip remaining HTML tags
    html = html.replace(/<[^>]+>/g, '');
    // Decode HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = html;
    const newText = textarea.value.trim();
    
    if (newText !== displayContent) {
      onUpdate(newText);
    }
  };

  // Split content by newlines and render with proper line breaks
  const lines = displayContent.split('\n');

  return (
    <div
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      style={{
        cursor: 'text',
        padding: '4px 0',
        outline: 'none',
        minHeight: '1.5em',
        whiteSpace: 'pre-wrap',
      }}
    >
      {lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </div>
  );
}

export function EditableMarkdownContent({
  content,
  onContentChange,
}: EditableMarkdownContentProps) {
  // Use ref to track segments to avoid closure issues
  const segmentsRef = useRef<ContentSegment[]>([]);
  const segments = useMemo(() => {
    const parsed = splitContentIntoSegments(content);
    segmentsRef.current = parsed;
    return parsed;
  }, [content]);

  const handleSegmentUpdate = useCallback(
    (segmentIndex: number, newContent: string) => {
      // Use the ref to get current segments state
      const currentSegments = [...segmentsRef.current];
      if (!currentSegments[segmentIndex]) return;
      
      currentSegments[segmentIndex] = {
        ...currentSegments[segmentIndex],
        content: newContent,
      };
      
      // Update the ref immediately so subsequent calls use latest state
      segmentsRef.current = currentSegments;

      const newFullContent = currentSegments.map((s) => s.content).join("\n");
      onContentChange(newFullContent);
    },
    [onContentChange]
  );

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      {segments.map((segment, index) => {
        if (segment.type === "html-table") {
          return (
            <EditableHtmlTable
              key={`html-table-${index}`}
              html={segment.content}
              onUpdate={(newHtml) => handleSegmentUpdate(index, newHtml)}
            />
          );
        }
        
        if (segment.type === "table") {
          return (
            <EditableMarkdownTable
              key={`table-${index}`}
              markdown={segment.content}
              onUpdate={(newMarkdown) => handleSegmentUpdate(index, newMarkdown)}
            />
          );
        }
        
        if (segment.type === "image") {
          return (
            <div key={`image-${index}`} className="my-4">
              <img 
                src={segment.content} 
                alt="HWPX 이미지" 
                className="max-w-full h-auto rounded border"
                loading="lazy"
              />
            </div>
          );
        }

        // Render text content as editable blocks
        return (
          <EditableTextBlock
            key={`text-${index}`}
            content={segment.content}
            onUpdate={(newText) => handleSegmentUpdate(index, newText)}
          />
        );
      })}
    </div>
  );
}
