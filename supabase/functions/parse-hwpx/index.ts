import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET_NAME = "project_files";

interface TextRegion {
  id: string;
  originalText: string;
  sectionHint: string;
  xmlPath: string;
  startIndex: number;
  endIndex: number;
}

interface ExtractedImage {
  id: string;
  originalPath: string;
  storagePath: string;
  publicUrl: string;
  width?: number;
  height?: number;
  mimeType: string;
}

interface ParsedTemplate {
  placeholders: Array<{
    id: string;
    label: string;
    hint: string;
    originalText: string;
  }>;
  templatePath: string;
  originalFileName: string;
  images: ExtractedImage[];
}

/**
 * Extract images from HWPX BinData folder and upload to storage
 */
async function extractAndUploadImages(
  zip: JSZip,
  userId: string,
  templatePath: string,
  supabaseAdmin: any
): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];
  
  // List all files in the ZIP to find images
  const allFiles = Object.keys(zip.files);
  console.log(`[parse-hwpx] All files in ZIP: ${allFiles.join(", ")}`);
  
  // Look for images in multiple possible locations:
  // 1. BinData/ folder (common in HWPX)
  // 2. Contents/BinData/ folder
  // 3. Any image files anywhere in the archive
  const imagePatterns = [
    /^BinData\//i,
    /^Contents\/BinData\//i,
    /^media\//i,
    /^Pictures\//i,
  ];
  
  const imageExtensions = /\.(png|jpg|jpeg|gif|bmp|emf|wmf|tif|tiff)$/i;
  
  const imageFiles = allFiles.filter(f => {
    // Check if file is in an image folder OR has image extension
    const inImageFolder = imagePatterns.some(pattern => pattern.test(f));
    const hasImageExt = imageExtensions.test(f);
    return (inImageFolder || hasImageExt) && !zip.files[f].dir;
  });

  console.log(`[parse-hwpx] Found ${imageFiles.length} image files: ${imageFiles.join(", ")}`);

  for (const imagePath of imageFiles) {
    try {
      const file = zip.file(imagePath);
      if (!file) {
        console.log(`[parse-hwpx] Could not get file: ${imagePath}`);
        continue;
      }

      const imageData = await file.async("arraybuffer");
      const fileName = imagePath.split("/").pop() || `image_${Date.now()}`;
      const ext = fileName.split(".").pop()?.toLowerCase() || "png";
      
      // Determine MIME type
      let mimeType = "image/png";
      if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
      else if (ext === "gif") mimeType = "image/gif";
      else if (ext === "bmp") mimeType = "image/bmp";
      else if (ext === "emf") mimeType = "image/x-emf";
      else if (ext === "wmf") mimeType = "image/x-wmf";
      else if (ext === "tif" || ext === "tiff") mimeType = "image/tiff";

      // Create storage path
      const storagePath = `${userId}/hwpx_images/${Date.now()}_${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(storagePath, new Uint8Array(imageData), {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        console.error(`[parse-hwpx] Failed to upload image ${imagePath}:`, uploadError);
        continue;
      }

      // Generate signed URL (valid for 7 days)
      const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 days

      if (signedUrlError || !signedUrlData) {
        console.error(`[parse-hwpx] Failed to create signed URL for ${storagePath}:`, signedUrlError);
        continue;
      }

      images.push({
        id: `img_${images.length}`,
        originalPath: imagePath,
        storagePath,
        publicUrl: signedUrlData.signedUrl,
        mimeType,
      });

      console.log(`[parse-hwpx] Uploaded image: ${imagePath} -> ${storagePath}`);
    } catch (error) {
      console.error(`[parse-hwpx] Error processing image ${imagePath}:`, error);
    }
  }

  return images;
}

/**
 * Parse XML to find image references and their positions
 */
function extractImageReferences(xmlContent: string): Array<{
  binItemId: string;
  position: number;
}> {
  const refs: Array<{ binItemId: string; position: number }> = [];
  
  // Look for <hp:pic> or <p:pic> tags with binItem references
  const picPattern = /<(?:hp|p):pic[^>]*>([\s\S]*?)<\/(?:hp|p):pic>/g;
  let match;
  
  while ((match = picPattern.exec(xmlContent)) !== null) {
    const picContent = match[1];
    // Find binItem reference
    const binItemMatch = picContent.match(/binItem\s*=\s*"([^"]+)"/);
    if (binItemMatch) {
      refs.push({
        binItemId: binItemMatch[1],
        position: match.index,
      });
    }
  }
  
  return refs;
}

/**
 * Parse header.xml and content.hpf to map binItem IDs to actual file paths
 * This function tries multiple strategies to find the image mappings
 */
async function parseBinItemMappings(zip: JSZip, images: ExtractedImage[]): Promise<Map<string, string>> {
  const mappings = new Map<string, string>();
  
  // Strategy 1: Parse header.xml for binItem definitions
  const headerPaths = [
    "Contents/header.xml",
    "header.xml",
    "Contents/Header.xml",
  ];
  
  for (const headerPath of headerPaths) {
    const headerFile = zip.file(headerPath);
    if (headerFile) {
      try {
        const headerXml = await headerFile.async("string");
        console.log(`[parse-hwpx] Parsing header file: ${headerPath} (${headerXml.length} chars)`);
        
        // Find binItem definitions with various patterns
        // Pattern: <hp:binItem Id="..." itemPath="BinData/image.png" .../>
        // Pattern: <hh:binItem Id="..." Src="BinData/image.png" .../>
        const binItemRegex = /<(?:hp|hh|hpx)?:?binItem[^>]*>/gi;
        let match;
        while ((match = binItemRegex.exec(headerXml)) !== null) {
          const tag = match[0];
          
          // Extract ID
          const idMatch = tag.match(/\bId\s*=\s*"([^"]+)"/i) || tag.match(/\bitemId\s*=\s*"([^"]+)"/i);
          if (!idMatch) continue;
          const id = idMatch[1];
          
          // Extract path - try multiple attribute names
          const pathMatch = tag.match(/(?:itemPath|Src|path|href)\s*=\s*"([^"]+)"/i);
          if (pathMatch) {
            const path = pathMatch[1];
            mappings.set(id, path);
            console.log(`[parse-hwpx] binItem mapping from header: ${id} -> ${path}`);
          }
        }
      } catch (error) {
        console.error(`[parse-hwpx] Error parsing ${headerPath}:`, error);
      }
    }
  }

  // Strategy 2: Parse content.hpf manifest for binData references
  const manifestPaths = [
    "Contents/content.hpf",
    "content.hpf",
  ];
  
  for (const manifestPath of manifestPaths) {
    const manifestFile = zip.file(manifestPath);
    if (manifestFile) {
      try {
        const manifestXml = await manifestFile.async("string");
        console.log(`[parse-hwpx] Parsing manifest: ${manifestPath}`);
        
        // Pattern: <hp:binData hp:id="binData1" hp:path="BinData/image.png"/>
        const binDataRegex = /<(?:hp|hh|hpx)?:?binData[^>]*>/gi;
        let match;
        while ((match = binDataRegex.exec(manifestXml)) !== null) {
          const tag = match[0];
          
          // Extract ID (various attribute patterns)
          const idMatch = tag.match(/(?:hp:|hh:)?id\s*=\s*"([^"]+)"/i) || 
                         tag.match(/(?:hp:|hh:)?itemId\s*=\s*"([^"]+)"/i);
          // Extract path
          const pathMatch = tag.match(/(?:hp:|hh:)?path\s*=\s*"([^"]+)"/i) ||
                           tag.match(/(?:hp:|hh:)?src\s*=\s*"([^"]+)"/i);
          
          if (idMatch && pathMatch) {
            mappings.set(idMatch[1], pathMatch[1]);
            console.log(`[parse-hwpx] binData mapping from manifest: ${idMatch[1]} -> ${pathMatch[1]}`);
          }
        }
      } catch (error) {
        console.error(`[parse-hwpx] Error parsing ${manifestPath}:`, error);
      }
    }
  }

  // Strategy 3: If no mappings found, create direct mappings from uploaded images
  // This creates mappings like "binData1" -> "BinData/image001.png" based on order
  if (mappings.size === 0 && images.length > 0) {
    console.log(`[parse-hwpx] No binItem mappings found, creating from image files (${images.length} images)`);
    
    // Create a simple sequential mapping
    for (let i = 0; i < images.length; i++) {
      const imagePath = images[i].originalPath;
      const shortName = imagePath.replace(/^.*\//, ''); // Get just the filename
      
      // Try various common ID patterns
      const possibleIds = [
        `binData${i + 1}`,
        `BIN${String(i).padStart(4, '0')}`,
        `image${i + 1}`,
        shortName.replace(/\.[^.]+$/, ''), // filename without extension
      ];
      
      for (const id of possibleIds) {
        if (!mappings.has(id)) {
          mappings.set(id, imagePath);
        }
      }
      // Also map by filename
      mappings.set(shortName, imagePath);
      mappings.set(imagePath, imagePath);
    }
    console.log(`[parse-hwpx] Created ${mappings.size} fallback mappings`);
  }
  
  return mappings;
}

/**
 * Extract text regions from HWPX XML - preserves structure info
 */
function extractTextRegions(xmlContent: string, fileName: string): TextRegion[] {
  const regions: TextRegion[] = [];
  let regionId = 0;
  
  // Find all paragraph elements with text
  const paragraphPattern = /<(?:hp|p):p[^>]*>([\s\S]*?)<\/(?:hp|p):p>/g;
  let match;
  
  while ((match = paragraphPattern.exec(xmlContent)) !== null) {
    const paragraphContent = match[1];
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;
    
    // Extract text from <hp:t> or <p:t> tags within this paragraph
    const textMatches = paragraphContent.matchAll(/<(?:hp|p):t[^>]*>([^<]+)<\/(?:hp|p):t>/g);
    let paragraphText = "";
    
    for (const tm of textMatches) {
      paragraphText += tm[1];
    }
    
    if (paragraphText.trim() && paragraphText.trim().length > 5) {
      // Determine section hint based on content
      let sectionHint = "일반 내용";
      const text = paragraphText.trim();
      
      if (/문제\s*인식|Problem/i.test(text)) sectionHint = "문제 인식";
      else if (/해결\s*방안|Solution/i.test(text)) sectionHint = "해결 방안";
      else if (/시장\s*현황|Market/i.test(text)) sectionHint = "시장 분석";
      else if (/팀\s*구성|Team/i.test(text)) sectionHint = "팀 구성";
      else if (/사업\s*모델|Business\s*Model/i.test(text)) sectionHint = "사업 모델";
      else if (/개발\s*계획|Development/i.test(text)) sectionHint = "개발 계획";
      else if (/자금\s*계획|Budget|예산/i.test(text)) sectionHint = "자금 계획";
      else if (/일반\s*현황/i.test(text)) sectionHint = "일반 현황";
      else if (/개요|요약|Summary/i.test(text)) sectionHint = "개요";
      
      regions.push({
        id: `field_${regionId++}`,
        originalText: paragraphText.trim(),
        sectionHint,
        xmlPath: fileName,
        startIndex,
        endIndex,
      });
    }
  }
  
  return regions;
}

/**
 * Use AI to analyze text regions and generate meaningful placeholder names
 */
async function generatePlaceholders(regions: TextRegion[], lovableApiKey: string): Promise<ParsedTemplate["placeholders"]> {
  const textSummary = regions
    .slice(0, 50) // Limit to first 50 regions
    .map((r, i) => `[${i}] ${r.sectionHint}: "${r.originalText.substring(0, 100)}..."`)
    .join("\n");

  const prompt = `당신은 한글 사업계획서 템플릿 분석 전문가입니다.

아래는 HWPX 문서에서 추출된 텍스트 영역들입니다. 각 영역을 분석하여:
1. 사용자가 편집해야 할 주요 필드를 식별하세요
2. 각 필드에 적절한 placeholder 이름(영문 snake_case)을 부여하세요
3. 사용자에게 보여줄 한글 라벨과 입력 힌트를 작성하세요

**분석할 텍스트 영역:**
${textSummary}

**응답 형식 (JSON 배열만 출력):**
[
  {"id": "company_name", "label": "회사명", "hint": "회사 또는 팀의 이름을 입력하세요", "regionIndex": 0},
  {"id": "business_idea", "label": "사업 아이디어", "hint": "핵심 사업 아이디어를 간단히 설명하세요", "regionIndex": 3}
]

**주의사항:**
- 제목, 장/절 번호, 안내 문구 등 고정 텍스트는 제외
- 실제 내용이 들어갈 영역만 선택 (최대 20개)
- regionIndex는 위 목록의 [숫자]와 일치해야 함`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error("[parse-hwpx] AI API error:", await response.text());
      return fallbackPlaceholders(regions);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";
    
    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("[parse-hwpx] No JSON in AI response");
      return fallbackPlaceholders(regions);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((p: { id: string; label: string; hint: string; regionIndex: number }) => ({
      id: p.id,
      label: p.label,
      hint: p.hint,
      originalText: regions[p.regionIndex]?.originalText || "",
    }));
  } catch (error) {
    console.error("[parse-hwpx] AI placeholder generation failed:", error);
    return fallbackPlaceholders(regions);
  }
}

/**
 * Fallback placeholder generation without AI
 */
function fallbackPlaceholders(regions: TextRegion[]): ParsedTemplate["placeholders"] {
  const uniqueSections = new Map<string, TextRegion>();
  
  for (const region of regions) {
    if (!uniqueSections.has(region.sectionHint)) {
      uniqueSections.set(region.sectionHint, region);
    }
  }
  
  return Array.from(uniqueSections.entries()).slice(0, 15).map(([hint, region], i) => ({
    id: `field_${i}`,
    label: hint,
    hint: `${hint} 내용을 입력하세요`,
    originalText: region.originalText,
  }));
}

/**
 * Generate essential questions for user based on detected fields
 */
function generateEssentialQuestions(placeholders: ParsedTemplate["placeholders"]): Array<{id: string; question: string; required: boolean}> {
  const coreFields = [
    { patterns: ["company", "회사", "팀명"], question: "회사/팀 이름이 무엇인가요?" },
    { patterns: ["business", "아이템", "아이디어"], question: "핵심 사업 아이디어를 설명해주세요." },
    { patterns: ["problem", "문제"], question: "해결하고자 하는 문제점은 무엇인가요?" },
    { patterns: ["solution", "해결"], question: "제시하는 해결 방안은 무엇인가요?" },
    { patterns: ["market", "시장"], question: "목표 시장과 규모는 어떻게 되나요?" },
    { patterns: ["team", "팀"], question: "팀 구성원과 역할을 알려주세요." },
  ];

  const questions: Array<{id: string; question: string; required: boolean}> = [];
  
  for (const p of placeholders) {
    for (const field of coreFields) {
      if (field.patterns.some(pat => p.id.toLowerCase().includes(pat) || p.label.includes(pat))) {
        if (!questions.some(q => q.question === field.question)) {
          questions.push({ id: p.id, question: field.question, required: true });
        }
        break;
      }
    }
  }
  
  return questions.slice(0, 8);
}

/**
 * Build content with interleaved text and images based on XML structure
 */
/**
 * Extract text from table cell, handling nested paragraphs and runs
 * IMPORTANT: Preserves line breaks between paragraphs
 */
function extractCellText(cellXml: string): string {
  // First, find all paragraphs in the cell
  const paragraphPattern = /<(?:hp|p|hpx):p[^>]*>([\s\S]*?)<\/(?:hp|p|hpx):p>/g;
  const paragraphs: string[] = [];
  
  let pMatch;
  while ((pMatch = paragraphPattern.exec(cellXml)) !== null) {
    const paragraphContent = pMatch[1];
    
    // Extract text from this paragraph
    const textPatterns = [
      /<(?:hp|p|hpx):t[^>]*>([^<]*)<\/(?:hp|p|hpx):t>/g,
      /<t[^:>]*>([^<]*)<\/t>/g,
    ];
    
    let paragraphText = "";
    for (const pattern of textPatterns) {
      const matches = paragraphContent.matchAll(pattern);
      for (const tm of matches) {
        paragraphText += tm[1];
      }
    }
    
    if (paragraphText.trim()) {
      paragraphs.push(paragraphText.trim());
    }
  }
  
  // If no paragraphs found, try direct text extraction (fallback)
  if (paragraphs.length === 0) {
    const textPatterns = [
      /<(?:hp|p|hpx):t[^>]*>([^<]*)<\/(?:hp|p|hpx):t>/g,
      /<t[^:>]*>([^<]*)<\/t>/g,
    ];
    
    let text = "";
    for (const pattern of textPatterns) {
      const matches = cellXml.matchAll(pattern);
      for (const tm of matches) {
        text += tm[1];
      }
    }
    return text.trim();
  }
  
  // Join paragraphs with newlines to preserve line breaks
  return paragraphs.join('\n');
}

/**
 * Parse table structure from HWPX XML and convert to HTML table
 * Preserves rowspan and colspan for proper merged cell rendering
 */
/**
 * Global counter for generating unique placeholder IDs across all tables
 */
let globalPlaceholderCounter = 0;

/**
 * Reset the global placeholder counter (call before processing a new document)
 */
function resetPlaceholderCounter(): void {
  globalPlaceholderCounter = 0;
}

interface ParsedCell {
  text: string;
  colspan: number;
  rowspan: number;
  isEmpty: boolean;
}

/**
 * Parse table structure from HWPX XML and convert to HTML table
 * IMPORTANT: Preserves EXACT structure - no row filtering, no cell merging
 * The goal is to replicate the original document layout exactly
 */
function parseTableToHtml(tableXml: string, tableIndex: number): string {
  // Find all rows
  const rowMatches = tableXml.match(/<(?:hp:|hpx:)?tr[^>]*>[\s\S]*?<\/(?:hp:|hpx:)?tr>/g) || [];
  
  console.log(`[parse-hwpx] Table ${tableIndex}: Found ${rowMatches.length} raw table rows`);
  
  if (rowMatches.length === 0) return "";
  
  // Parse all cells into structured data - NO FILTERING
  const parsedRows: ParsedCell[][] = [];
  
  for (let rowIdx = 0; rowIdx < rowMatches.length; rowIdx++) {
    const rowXml = rowMatches[rowIdx];
    const cellMatches = rowXml.match(/<(?:hp:|hpx:)?tc[^>]*>[\s\S]*?<\/(?:hp:|hpx:)?tc>/g) || [];
    
    const parsedCells: ParsedCell[] = [];
    
    for (let cellIdx = 0; cellIdx < cellMatches.length; cellIdx++) {
      const cellXml = cellMatches[cellIdx];
      const cellText = extractCellText(cellXml);
      
      // Extract colspan
      const colspanMatch = cellXml.match(/colSpan\s*=\s*"(\d+)"/i);
      const colspan = colspanMatch ? parseInt(colspanMatch[1], 10) : 1;
      
      // Extract rowspan
      const rowspanMatch = cellXml.match(/rowSpan\s*=\s*"(\d+)"/i);
      const rowspan = rowspanMatch ? parseInt(rowspanMatch[1], 10) : 1;
      
      // Mark empty cells but DO NOT use this for filtering
      const trimmedText = cellText.trim();
      const isPlaceholderMarker = /^\{\{[^}]+\}\}$/.test(trimmedText);
      const isEmpty = !trimmedText || trimmedText === ':' || isPlaceholderMarker;
      
      parsedCells.push({
        text: cellText,
        colspan,
        rowspan,
        isEmpty,
      });
    }
    
    // Only skip completely empty rows (no cells at all)
    if (parsedCells.length > 0) {
      parsedRows.push(parsedCells);
    }
  }
  
  console.log(`[parse-hwpx] Table ${tableIndex}: Parsed ${parsedRows.length} rows with cells: ${parsedRows.map(r => r.length).join(', ')}`);
  
  // Generate HTML - preserve exact structure, no merging
  const htmlRows: string[] = [];
  
  for (let rowIdx = 0; rowIdx < parsedRows.length; rowIdx++) {
    const row = parsedRows[rowIdx];
    const htmlCells: string[] = [];
    
    for (let cellIdx = 0; cellIdx < row.length; cellIdx++) {
      const cell = row[cellIdx];
      
      // Build cell attributes - preserve exact colspan and rowspan
      let attrs = '';
      if (cell.colspan > 1) attrs += ` colspan="${cell.colspan}"`;
      if (cell.rowspan > 1) attrs += ` rowspan="${cell.rowspan}"`;
      
      // Use th for header cells (first row OR cells in first column that have content and rowspan)
      // This helps identify header-like cells in the original document
      const isFirstRow = rowIdx === 0;
      const isFirstColumnWithRowspan = cellIdx === 0 && cell.rowspan > 1 && cell.text.trim().length > 0;
      const tag = isFirstRow ? 'th' : 'td';
      
      // GLOBALLY UNIQUE placeholder ID
      const placeholderId = `T${tableIndex}_R${rowIdx}_C${cellIdx}_G${globalPlaceholderCounter++}`;
      attrs += ` data-placeholder="${placeholderId}"`;
      
      // Store original text for change tracking
      const originalText = cell.text || '';
      const escapedOriginal = originalText.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      attrs += ` data-original="${escapedOriginal}"`;
      
      const escapedText = (cell.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      htmlCells.push(`<${tag}${attrs}>${escapedText}</${tag}>`);
    }
    
    if (htmlCells.length > 0) {
      htmlRows.push(`<tr>${htmlCells.join('')}</tr>`);
    }
  }
  
  if (htmlRows.length === 0) return "";
  
  console.log(`[parse-hwpx] Table ${tableIndex}: Generated ${htmlRows.length} HTML rows`);
  
  return `<table class="hwpx-table" data-table-index="${tableIndex}">${htmlRows.join('')}</table>`;
}

/**
 * Inject placeholders into empty table cells in XML content
 * Returns modified XML with {{FIELD_row_col}} markers in empty cells
 * 
 * IMPORTANT: This must match the logic in parseTableToHtml for consistency
 */
function injectPlaceholdersIntoXml(xmlContent: string): { modifiedXml: string; placeholderCount: number } {
  let placeholderCount = 0;
  let modifiedXml = xmlContent;
  let globalInjectCounter = 0;
  
  // Find all tables using match() for more reliable extraction
  const tableMatches = xmlContent.match(/<(?:hp:|hpx:)?tbl[^>]*>[\s\S]*?<\/(?:hp:|hpx:)?tbl>/g) || [];
  
  for (let tableIdx = 0; tableIdx < tableMatches.length; tableIdx++) {
    const tableXml = tableMatches[tableIdx];
    let modifiedTableXml = tableXml;
    
    // Find all rows in this table
    const rowMatches = tableXml.match(/<(?:hp:|hpx:)?tr[^>]*>[\s\S]*?<\/(?:hp:|hpx:)?tr>/g) || [];
    
    for (let rowIdx = 0; rowIdx < rowMatches.length; rowIdx++) {
      const rowXml = rowMatches[rowIdx];
      let modifiedRowXml = rowXml;
      
      // Find all cells in this row
      const cellMatches = rowXml.match(/<(?:hp:|hpx:)?tc[^>]*>[\s\S]*?<\/(?:hp:|hpx:)?tc>/g) || [];
      
      for (let cellIdx = 0; cellIdx < cellMatches.length; cellIdx++) {
        const cellXml = cellMatches[cellIdx];
        
        // Extract all text content from cell using extractCellText logic
        const textPatterns = [
          /<(?:hp|p|hpx):t[^>]*>([^<]*)<\/(?:hp|p|hpx):t>/g,
          /<t[^:>]*>([^<]*)<\/t>/g,
        ];
        
        let cellText = "";
        for (const pattern of textPatterns) {
          const matches = cellXml.matchAll(pattern);
          for (const tm of matches) {
            cellText += tm[1];
          }
        }
        
        // Check if cell is empty or whitespace-only (same as parseTableToHtml)
        const isEmptyOrWhitespace = !cellText || cellText.trim() === '';
        
        if (isEmptyOrWhitespace) {
          // GLOBALLY UNIQUE placeholder ID matching parseTableToHtml format
          const placeholderId = `T${tableIdx}_R${rowIdx}_C${cellIdx}_G${globalInjectCounter++}`;
          const placeholderText = `{{${placeholderId}}}`;
          
          // Try to find an empty text tag to inject into
          const emptyTextPattern = /(<(?:hp|p|hpx):t[^>]*>)\s*(<\/(?:hp|p|hpx):t>)/;
          const emptyTextMatch = cellXml.match(emptyTextPattern);
          
          if (emptyTextMatch) {
            // Found an empty text tag - inject placeholder
            const modifiedCellXml = cellXml.replace(
              emptyTextPattern,
              `$1${placeholderText}$2`
            );
            modifiedRowXml = modifiedRowXml.replace(cellXml, modifiedCellXml);
            placeholderCount++;
            console.log(`[parse-hwpx] Injected placeholder into empty tag: ${placeholderId}`);
          } else {
            // No empty text tag found - try to find ANY text tag and append placeholder
            const anyTextPattern = /(<(?:hp|p|hpx):t[^>]*>)([^<]*)(<\/(?:hp|p|hpx):t>)/;
            const anyTextMatch = cellXml.match(anyTextPattern);
            
            if (anyTextMatch) {
              // FIXED: Append placeholder AFTER existing text content (keep $2)
              const modifiedCellXml = cellXml.replace(
                anyTextPattern,
                `$1$2${placeholderText}$3`
              );
              modifiedRowXml = modifiedRowXml.replace(cellXml, modifiedCellXml);
              placeholderCount++;
              console.log(`[parse-hwpx] Appended placeholder to existing text: ${placeholderId}`);
            } else {
              // No text tag at all - need to find a paragraph and add text tag
              // Look for <hp:p> or <p:p> paragraph tags
              const paragraphPattern = /(<(?:hp|p|hpx):p[^>]*>)([\s\S]*?)(<\/(?:hp|p|hpx):p>)/;
              const paragraphMatch = cellXml.match(paragraphPattern);
              
              if (paragraphMatch) {
                // Insert a text run with placeholder after paragraph opening
                const textRun = `<hp:run><hp:t>${placeholderText}</hp:t></hp:run>`;
                const modifiedCellXml = cellXml.replace(
                  paragraphPattern,
                  `$1${textRun}$2$3`
                );
                modifiedRowXml = modifiedRowXml.replace(cellXml, modifiedCellXml);
                placeholderCount++;
                console.log(`[parse-hwpx] Created new text run for placeholder: ${placeholderId}`);
              } else {
                console.log(`[parse-hwpx] Could not inject placeholder ${placeholderId} - no suitable location found`);
              }
            }
          }
        }
      }
      
      modifiedTableXml = modifiedTableXml.replace(rowXml, modifiedRowXml);
    }
    
    modifiedXml = modifiedXml.replace(tableXml, modifiedTableXml);
  }
  
  console.log(`[parse-hwpx] Total placeholders injected into XML: ${placeholderCount}`);
  return { modifiedXml, placeholderCount };
}

/**
 * Parse table structure from HWPX XML and convert to Markdown
 * Handles merged cells (rowspan/colspan) by expanding them
 */
function parseTableToMarkdown(tableXml: string): string {
  const rows: string[][] = [];
  
  // Find all table rows - use more flexible pattern for nested content
  // Pattern matches <hp:tr>, <tr>, or <hpx:tr>
  const rowMatches = tableXml.match(/<(?:hp:|hpx:)?tr[^>]*>[\s\S]*?<\/(?:hp:|hpx:)?tr>/g) || [];
  
  console.log(`[parse-hwpx] Found ${rowMatches.length} table rows`);
  
  for (const rowXml of rowMatches) {
    const cells: string[] = [];
    
    // Find all table cells - handles <hp:tc>, <tc>, <hpx:tc>
    const cellMatches = rowXml.match(/<(?:hp:|hpx:)?tc[^>]*>[\s\S]*?<\/(?:hp:|hpx:)?tc>/g) || [];
    
    for (const cellXml of cellMatches) {
      const cellText = extractCellText(cellXml);
      // For merged cells, we might need to handle colspan
      const colspanMatch = cellXml.match(/colSpan\s*=\s*"(\d+)"/i);
      const colspan = colspanMatch ? parseInt(colspanMatch[1], 10) : 1;
      
      cells.push(cellText || " ");
      // Add empty cells for colspan > 1
      for (let c = 1; c < colspan; c++) {
        cells.push(" ");
      }
    }
    
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  
  console.log(`[parse-hwpx] Extracted ${rows.length} rows with cells: ${rows.map(r => r.length).join(', ')}`);
  
  if (rows.length === 0) return "";
  
  // Normalize column count
  const maxCols = Math.max(...rows.map(r => r.length));
  rows.forEach(row => {
    while (row.length < maxCols) {
      row.push(" ");
    }
  });
  
  // Convert to Markdown table
  const lines: string[] = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowLine = "| " + row.map(c => c.replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ") + " |";
    lines.push(rowLine);
    
    // Add header separator after first row
    if (i === 0) {
      const separator = "| " + row.map(() => "---").join(" | ") + " |";
      lines.push(separator);
    }
  }
  
  return lines.join("\n");
}

async function buildContentWithImages(
  zip: JSZip,
  sectionFiles: string[],
  images: ExtractedImage[],
  binItemMappings: Map<string, string>
): Promise<{ plainText: string; contentBlocks: Array<{ type: 'text' | 'image' | 'table'; content: string }> }> {
  const contentBlocks: Array<{ type: 'text' | 'image' | 'table'; content: string }> = [];
  let fullPlainText = "";

  // Create a map from BinData paths to uploaded image URLs
  const imageUrlMap = new Map<string, string>();
  for (const img of images) {
    const shortPath = img.originalPath.replace(/^BinData\//, "");
    imageUrlMap.set(shortPath, img.publicUrl);
    imageUrlMap.set(img.originalPath, img.publicUrl);
  }

  let globalTableIndex = 0;

  for (const sectionFile of sectionFiles) {
    const xmlContent = await zip.file(sectionFile)?.async("string");
    if (!xmlContent) continue;

    // FIXED: Process content in document order by finding ALL top-level elements and sorting by position
    // This ensures titles like "Ⅱ. 인력 현황" appear before their associated tables
    
    interface ContentElement {
      type: 'paragraph' | 'table' | 'image';
      position: number;
      content: string;
      xml: string;
    }
    
    const elements: ContentElement[] = [];
    
    // Find all tables with their positions
    const tablePattern = /<(?:hp:|hpx:)?tbl[^>]*>[\s\S]*?<\/(?:hp:|hpx:)?tbl>/g;
    let tableMatch;
    while ((tableMatch = tablePattern.exec(xmlContent)) !== null) {
      elements.push({
        type: 'table',
        position: tableMatch.index,
        content: '', // Will be filled later
        xml: tableMatch[0],
      });
    }
    
    // Find all paragraphs with their positions (excluding those inside tables, except for images)
    const tablePositions = elements
      .filter(e => e.type === 'table')
      .map(e => ({ start: e.position, end: e.position + e.xml.length }));
    
    // ALSO find images INSIDE tables - they need special handling
    // Look for picture elements anywhere in the document
    const picPattern = /<(?:hp|p|hpx):pic[^>]*>[\s\S]*?<\/(?:hp|p|hpx):pic>/g;
    let picMatch;
    while ((picMatch = picPattern.exec(xmlContent)) !== null) {
      const position = picMatch.index;
      const picElement = picMatch[0];
      
      // Try multiple patterns to find the image reference
      const binItemMatch = picElement.match(/binItem\s*=\s*"([^"]+)"/) ||
                          picElement.match(/(?:hp:|hh:|hpx:)?binItemRef\s*=\s*"([^"]+)"/) ||
                          picElement.match(/(?:hp:|hh:|hpx:)?id\s*=\s*"([^"]+)"/) ||
                          picElement.match(/(?:hp:|hh:|hpx:)?itemRef\s*=\s*"([^"]+)"/);
      
      if (binItemMatch) {
        const binItemId = binItemMatch[1];
        console.log(`[parse-hwpx] Found pic element with binItem: ${binItemId}`);
        
        // Try various mappings to find the image URL
        let imageUrl = null;
        const filePath = binItemMappings.get(binItemId);
        
        if (filePath) {
          imageUrl = imageUrlMap.get(filePath) || 
                     imageUrlMap.get(`BinData/${filePath}`) ||
                     imageUrlMap.get(filePath.replace(/^BinData\//, ''));
        }
        
        // If still not found, try direct lookup by ID in imageUrlMap
        if (!imageUrl) {
          for (const [path, url] of imageUrlMap.entries()) {
            if (path.includes(binItemId) || binItemId.includes(path.split('/').pop() || '')) {
              imageUrl = url;
              break;
            }
          }
        }
        
        // If still not found and we have images, use position-based fallback
        if (!imageUrl && images.length > 0) {
          // Find the next unused image
          const imageIndex = elements.filter(e => e.type === 'image').length;
          if (imageIndex < images.length) {
            imageUrl = images[imageIndex].publicUrl;
            console.log(`[parse-hwpx] Using position-based image fallback: index ${imageIndex}`);
          }
        }
        
        if (imageUrl) {
          elements.push({
            type: 'image',
            position,
            content: imageUrl,
            xml: picElement,
          });
          console.log(`[parse-hwpx] Added image at position ${position}: ${binItemId} -> URL found`);
        } else {
          console.log(`[parse-hwpx] Could not find URL for image: ${binItemId}`);
        }
      }
    }
    
    const paragraphPattern = /<(?:hp|p|hpx):p[^>]*>[\s\S]*?<\/(?:hp|p|hpx):p>/g;
    let pMatch;
    
    while ((pMatch = paragraphPattern.exec(xmlContent)) !== null) {
      const position = pMatch.index;
      
      // Skip if this paragraph is inside a table
      const isInsideTable = tablePositions.some(tp => position >= tp.start && position < tp.end);
      if (isInsideTable) continue;
      
      const element = pMatch[0];
      
      // Skip if this is a picture element (already handled above)
      if (element.includes(":pic")) {
        continue;
      }
      
      // Extract text from paragraph
      const textMatches = element.matchAll(/<(?:hp|p|hpx):t[^>]*>([^<]*)<\/(?:hp|p|hpx):t>/g);
      let paragraphText = "";
      for (const tm of textMatches) {
        paragraphText += tm[1];
      }
      
      if (paragraphText.trim()) {
        elements.push({
          type: 'paragraph',
          position,
          content: paragraphText.trim(),
          xml: element,
        });
      }
    }
    
    // Sort all elements by position to maintain document order
    elements.sort((a, b) => a.position - b.position);
    
    const imageCount = elements.filter(e => e.type === 'image').length;
    console.log(`[parse-hwpx] Found ${elements.length} elements in ${sectionFile} (${elements.filter(e => e.type === 'table').length} tables, ${elements.filter(e => e.type === 'paragraph').length} paragraphs, ${imageCount} images)`);
    
    // Process elements in order
    for (const elem of elements) {
      if (elem.type === 'table') {
        const htmlTable = parseTableToHtml(elem.xml, globalTableIndex++);
        if (htmlTable) {
          contentBlocks.push({ type: 'table', content: htmlTable });
          fullPlainText += htmlTable + "\n\n";
        }
      } else if (elem.type === 'image') {
        contentBlocks.push({ type: 'image', content: elem.content });
        fullPlainText += `[이미지]\n\n`;
      } else if (elem.type === 'paragraph') {
        contentBlocks.push({ type: 'text', content: elem.content });
        fullPlainText += elem.content + "\n\n";
      }
    }
  }

  // If no images were found in XML but we have uploaded images, add them at the end
  // This is a fallback for cases where images are in the file but not referenced in XML
  const foundImages = contentBlocks.filter(b => b.type === 'image').length;
  if (foundImages === 0 && images.length > 0) {
    // Filter out preview images (typically in Preview/ folder)
    const contentImages = images.filter(img => 
      !img.originalPath.toLowerCase().includes('preview') &&
      !img.originalPath.toLowerCase().includes('prv')
    );
    
    if (contentImages.length > 0) {
      console.log(`[parse-hwpx] Adding ${contentImages.length} standalone images as fallback`);
      for (const img of contentImages) {
        contentBlocks.push({ type: 'image', content: img.publicUrl });
        fullPlainText += `[이미지]\n\n`;
      }
    }
  }

  console.log(`[parse-hwpx] Final content blocks: ${contentBlocks.length} total, ${contentBlocks.filter(b => b.type === 'image').length} images`);

  return { plainText: fullPlainText, contentBlocks };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: corsHeaders }
      );
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Get file path from request
    const { filePath, mode = "analyze" } = await req.json();
    if (!filePath) {
      return new Response(
        JSON.stringify({ error: "filePath is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`[parse-hwpx] Parsing file: ${filePath}, mode: ${mode}`);

    // Download file from storage
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from(BUCKET_NAME)
      .download(filePath);

    if (downloadError || !fileData) {
      console.error(`[parse-hwpx] Download error:`, downloadError);
      return new Response(
        JSON.stringify({ error: "Failed to download file" }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Load HWPX as ZIP
    const arrayBuffer = await fileData.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    console.log(`[parse-hwpx] ZIP loaded, files:`, Object.keys(zip.files).join(", "));

    // Extract and upload images from BinData
    const images = await extractAndUploadImages(zip, user.id, filePath, supabaseAdmin);
    console.log(`[parse-hwpx] Extracted ${images.length} images`);

    // Parse binItem mappings from header (pass images so we can create fallback mappings)
    const binItemMappings = await parseBinItemMappings(zip, images);

    // Find and parse section XML files
    const allRegions: TextRegion[] = [];
    const sectionFiles = Object.keys(zip.files)
      .filter(f => f.startsWith("Contents/") && f.endsWith(".xml") && f.includes("section"))
      .sort();

    console.log(`[parse-hwpx] Found section files:`, sectionFiles);

    // Reset global counter before processing and inject placeholders
    resetPlaceholderCounter();
    let totalPlaceholders = 0;
    for (const sectionFile of sectionFiles) {
      const xmlContent = await zip.file(sectionFile)?.async("string");
      if (xmlContent) {
        const regions = extractTextRegions(xmlContent, sectionFile);
        allRegions.push(...regions);
        console.log(`[parse-hwpx] Extracted ${regions.length} regions from ${sectionFile}`);
        
        // Inject placeholders into empty cells
        const { modifiedXml, placeholderCount } = injectPlaceholdersIntoXml(xmlContent);
        if (placeholderCount > 0) {
          zip.file(sectionFile, modifiedXml);
          totalPlaceholders += placeholderCount;
          console.log(`[parse-hwpx] Injected ${placeholderCount} placeholders into ${sectionFile}`);
        }
      }
    }

    // Save modified HWPX with placeholders to storage
    let modifiedTemplatePath = filePath;
    if (totalPlaceholders > 0) {
      const modifiedArrayBuffer = await zip.generateAsync({
        type: "arraybuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      
      // Create path for modified template
      const pathParts = filePath.split('/');
      const fileName = pathParts.pop() || 'template.hwpx';
      const basePath = pathParts.join('/');
      modifiedTemplatePath = `${basePath}/${Date.now()}_modified_${fileName}`;
      
      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(modifiedTemplatePath, new Uint8Array(modifiedArrayBuffer), {
          contentType: "application/vnd.hancom.hwpx",
          upsert: true,
        });
      
      if (uploadError) {
        console.error(`[parse-hwpx] Failed to upload modified template:`, uploadError);
        // Fall back to original template
        modifiedTemplatePath = filePath;
      } else {
        console.log(`[parse-hwpx] Saved modified template with ${totalPlaceholders} placeholders to: ${modifiedTemplatePath}`);
      }
    }

    // If no section files, try any XML
    if (allRegions.length === 0) {
      for (const fileName of Object.keys(zip.files)) {
        if (fileName.endsWith(".xml")) {
          const xmlContent = await zip.file(fileName)?.async("string");
          if (xmlContent && (xmlContent.includes("<hp:t") || xmlContent.includes("<p:t"))) {
            const regions = extractTextRegions(xmlContent, fileName);
            allRegions.push(...regions);
          }
        }
      }
    }

    console.log(`[parse-hwpx] Total regions extracted: ${allRegions.length}`);

    // Build content with images interleaved (use modified zip with placeholders)
    const { plainText, contentBlocks } = await buildContentWithImages(
      zip, 
      sectionFiles, 
      images, 
      binItemMappings
    );

    // Generate placeholders using AI
    let placeholders: ParsedTemplate["placeholders"] = [];
    if (LOVABLE_API_KEY && allRegions.length > 0) {
      placeholders = await generatePlaceholders(allRegions, LOVABLE_API_KEY);
    } else {
      placeholders = fallbackPlaceholders(allRegions);
    }

    // Generate essential questions
    const essentialQuestions = generateEssentialQuestions(placeholders);

    // Extract metadata
    const metadata = {
      fileCount: Object.keys(zip.files).length,
      hasImages: images.length > 0,
      xmlFiles: Object.keys(zip.files).filter(f => f.endsWith(".xml")),
      sectionCount: sectionFiles.length,
    };

    // Return analysis result with images
    return new Response(
      JSON.stringify({
        success: true,
        templatePath: modifiedTemplatePath, // Use modified template with placeholders
        originalTemplatePath: filePath,
        placeholders,
        essentialQuestions,
        regionCount: allRegions.length,
        placeholderCount: totalPlaceholders,
        metadata,
        plainText,
        images,
        contentBlocks,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("[parse-hwpx] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: corsHeaders }
    );
  }
});
