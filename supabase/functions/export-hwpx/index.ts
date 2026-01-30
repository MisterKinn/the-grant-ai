import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { ZipWriter, BlobWriter, TextReader } from "https://deno.land/x/zipjs@v2.7.32/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParagraphItem {
  type: 'heading' | 'paragraph' | 'listItem';
  level?: number;
  text: string;
  bold?: boolean;
}

// Recursively extract all text from any node structure
function extractAllTextDeep(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.text) return node.text;
  if (node.content && Array.isArray(node.content)) {
    return node.content.map((child: any) => extractAllTextDeep(child)).join(' ');
  }
  return '';
}

// Strip HTML tags
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function extractText(content: any[]): string {
  if (!content) return '';
  return content.map(c => c.text || '').join('');
}

function extractParagraphs(content: any, plainText: string): ParagraphItem[] {
  const paragraphs: ParagraphItem[] = [];

  console.log("extractParagraphs called with content type:", typeof content);
  console.log("Content has .content?", !!content?.content);
  console.log("Content.content length:", content?.content?.length);

  if (!content?.content || !Array.isArray(content.content)) {
    console.log("No structured content, falling back to plainText");
    const lines = (plainText || '').split('\n').filter(line => line.trim());
    for (const line of lines) {
      if (line.startsWith('# ')) {
        paragraphs.push({ type: 'heading', level: 1, text: line.substring(2) });
      } else if (line.startsWith('## ')) {
        paragraphs.push({ type: 'heading', level: 2, text: line.substring(3) });
      } else if (line.startsWith('### ')) {
        paragraphs.push({ type: 'heading', level: 3, text: line.substring(4) });
      } else {
        paragraphs.push({ type: 'paragraph', text: line });
      }
    }
    return paragraphs;
  }

  function processListItems(items: any[], ordered: boolean) {
    if (!items) return;
    let index = 0;
    for (const item of items) {
      try {
        if (item.type === 'listItem') {
          index++;
          const paragraphNode = item.content?.find((c: any) => c.type === 'paragraph');
          if (paragraphNode) {
            const text = extractText(paragraphNode.content);
            const prefix = ordered ? `${index}. ` : '• ';
            paragraphs.push({ type: 'listItem', text: prefix + text });
          }
          // Handle nested lists
          for (const child of item.content || []) {
            if (child.type === 'bulletList' && child.content) {
              processListItems(child.content, false);
            } else if (child.type === 'orderedList' && child.content) {
              processListItems(child.content, true);
            }
          }
        }
      } catch (e) {
        console.error("Error processing list item:", e);
      }
    }
  }

  function processTable(node: any) {
    if (!node.content) return;
    for (const row of node.content) {
      try {
        if (row.type === 'tableRow' && row.content) {
          const cells: string[] = [];
          for (const cell of row.content) {
            if (cell.content) {
              // Handle colspan - extract all text from cell
              let cellText = '';
              for (const n of cell.content) {
                const text = extractText(n.content);
                if (text) {
                  cellText += (cellText ? ' ' : '') + text;
                }
                // Also try extracting from nested content
                if (!text && n.content) {
                  cellText += extractAllTextDeep(n);
                }
              }
              cells.push(cellText.trim());
            }
          }
          if (cells.length > 0 && cells.some(c => c.trim())) {
            paragraphs.push({ type: 'paragraph', text: '| ' + cells.join(' | ') + ' |' });
          }
        }
      } catch (e) {
        console.error("Error processing table row:", e);
      }
    }
  }

  function processNode(node: any) {
    try {
      console.log(`Processing node: type=${node?.type}`);
      
      if (node.type === 'heading') {
        const level = node.attrs?.level || 1;
        const text = extractText(node.content);
        paragraphs.push({ type: 'heading', level, text });
      } else if (node.type === 'paragraph') {
        const text = extractText(node.content);
        if (text.trim()) {
          const isBold = node.content?.some((c: any) => c.marks?.some((m: any) => m.type === 'bold'));
          paragraphs.push({ type: 'paragraph', text, bold: isBold });
        }
      } else if (node.type === 'bulletList' || node.type === 'orderedList') {
        processListItems(node.content, node.type === 'orderedList');
      } else if (node.type === 'table') {
        processTable(node);
      } else {
        // FALLBACK: Handle unknown node types
        console.log(`Unknown node type: ${node?.type}, attempting text extraction`);
        let text = extractAllTextDeep(node);
        if (text.includes('<')) {
          text = stripHtml(text);
        }
        if (text.trim()) {
          paragraphs.push({ type: 'paragraph', text: text.trim() });
        }
      }
    } catch (e) {
      console.error(`Error processing node type ${node?.type}:`, e);
      try {
        const fallbackText = extractAllTextDeep(node);
        if (fallbackText.trim()) {
          paragraphs.push({ type: 'paragraph', text: fallbackText.trim() });
        }
      } catch (fallbackError) {
        console.error('Fallback extraction also failed:', fallbackError);
      }
    }
  }

  console.log(`Processing ${content.content.length} nodes for HWP export`);
  
  for (let i = 0; i < content.content.length; i++) {
    const node = content.content[i];
    processNode(node);
  }

  console.log(`Extracted ${paragraphs.length} paragraphs total`);
  return paragraphs;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateSectionXml(title: string, paragraphs: ParagraphItem[]): string {
  let paraElements = '';

  // Add title
  paraElements += `
    <hp:p paraPrIDRef="1" styleIDRef="0">
      <hp:run charPrIDRef="1">
        <hp:t>${escapeXml(title)}</hp:t>
      </hp:run>
    </hp:p>`;

  // Add content paragraphs
  for (const para of paragraphs) {
    const charPrId = para.type === 'heading' || para.bold ? '1' : '0';
    const paraPrId = para.type === 'heading' ? '1' : '0';

    paraElements += `
    <hp:p paraPrIDRef="${paraPrId}" styleIDRef="0">
      <hp:run charPrIDRef="${charPrId}">
        <hp:t>${escapeXml(para.text)}</hp:t>
      </hp:run>
    </hp:p>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpx/2016/para" xmlns:hs="http://www.hancom.co.kr/hwpx/2016/section">
  <hs:p id="0">
    <hs:secPr textDirection="HORIZONTAL" spaceColumns="1134">
      <hs:pageSize width="59528" height="84188"/>
      <hs:pageMar left="8504" right="8504" top="5668" bottom="4252" header="4252" footer="4252"/>
    </hs:secPr>
  </hs:p>${paraElements}
</hs:sec>`;
}

// Generate HWPX (Open XML format for Hangul Word Processor)
function generateHwpxContent(title: string, plainText: string, content: any): { [key: string]: string } {
  const files: { [key: string]: string } = {};

  // Convert content to paragraphs
  const paragraphs = extractParagraphs(content, plainText);

  // [Content_Types].xml
  files["[Content_Types].xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/Contents/section0.xml" ContentType="application/hwpx-section+xml"/>
  <Override PartName="/Contents/content.hpf" ContentType="application/hwpx-contents+xml"/>
  <Override PartName="/header.xml" ContentType="application/hwpx-header+xml"/>
  <Override PartName="/settings.xml" ContentType="application/hwpx-settings+xml"/>
</Types>`;

  // _rels/.rels
  files["_rels/.rels"] = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://www.hancom.co.kr/hwpx/2016/office/document" Target="Contents/content.hpf"/>
  <Relationship Id="rId2" Type="http://www.hancom.co.kr/hwpx/2016/office/header" Target="header.xml"/>
  <Relationship Id="rId3" Type="http://www.hancom.co.kr/hwpx/2016/office/settings" Target="settings.xml"/>
</Relationships>`;

  // header.xml
  files["header.xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpx/2016/head" version="1.1">
  <hh:beginNum page="1" footnote="1" endnote="1" picture="1" table="1" equation="1"/>
  <hh:refList>
    <hh:fontfaces>
      <hh:fontface lang="HANGUL" count="1">
        <hh:font id="0" face="맑은 고딕" type="TTF"/>
      </hh:fontface>
      <hh:fontface lang="LATIN" count="1">
        <hh:font id="0" face="맑은 고딕" type="TTF"/>
      </hh:fontface>
    </hh:fontfaces>
    <hh:charProperties count="2">
      <hh:charPr id="0" height="1000" textColor="0" shadeColor="4294967295">
        <hh:fontRef hangul="0" latin="0"/>
      </hh:charPr>
      <hh:charPr id="1" height="1400" textColor="0" shadeColor="4294967295" bold="1">
        <hh:fontRef hangul="0" latin="0"/>
      </hh:charPr>
    </hh:charProperties>
    <hh:paraProperties count="2">
      <hh:paraPr id="0" align="JUSTIFY">
        <hh:margin left="0" right="0" prev="0" next="0"/>
        <hh:lineSpacing type="PERCENT" value="160"/>
      </hh:paraPr>
      <hh:paraPr id="1" align="LEFT">
        <hh:margin left="0" right="0" prev="400" next="400"/>
        <hh:lineSpacing type="PERCENT" value="160"/>
      </hh:paraPr>
    </hh:paraProperties>
  </hh:refList>
</hh:head>`;

  // settings.xml
  files["settings.xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<hs:settings xmlns:hs="http://www.hancom.co.kr/hwpx/2016/settings">
  <hs:beginNumber page="1"/>
</hs:settings>`;

  // Contents/content.hpf
  files["Contents/content.hpf"] = `<?xml version="1.0" encoding="UTF-8"?>
<hpf:package xmlns:hpf="http://www.hancom.co.kr/hwpx/2016/package">
  <hpf:contentIds>
    <hpf:entry section="0" name="Contents/section0.xml"/>
  </hpf:contentIds>
</hpf:package>`;

  // Contents/_rels/content.hpf.rels
  files["Contents/_rels/content.hpf.rels"] = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://www.hancom.co.kr/hwpx/2016/office/section" Target="section0.xml"/>
</Relationships>`;

  // Contents/section0.xml - Main content
  files["Contents/section0.xml"] = generateSectionXml(title, paragraphs);

  return files;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.warn('[export-hwpx] Missing or invalid authorization header');
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      console.warn('[export-hwpx] Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[export-hwpx] Authenticated user:', user.id);

    const { title, content, plainText } = await req.json();

    console.log("Generating HWPX for:", title);
    console.log("Content nodes count:", content?.content?.length || 0);
    console.log("PlainText length:", plainText?.length || 0);

    // Generate HWPX content
    const hwpxFiles = generateHwpxContent(title || "문서", plainText || "", content);

    // Create ZIP archive using zip.js
    const blobWriter = new BlobWriter("application/vnd.hancom.hwpx");
    const zipWriter = new ZipWriter(blobWriter);

    for (const [path, fileContent] of Object.entries(hwpxFiles)) {
      await zipWriter.add(path, new TextReader(fileContent));
    }

    const zipBlob = await zipWriter.close();
    const arrayBuffer = await zipBlob.arrayBuffer();

    console.log("HWPX generated successfully, size:", arrayBuffer.byteLength);

    return new Response(arrayBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/vnd.hancom.hwpx",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(title || "문서")}.hwpx"`,
      },
    });
  } catch (e) {
    console.error("HWPX export error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
