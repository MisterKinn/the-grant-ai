/**
 * HWPX Parser Utility
 * Handles client-side parsing and conversion of HWPX content
 */

import { supabase } from "@/integrations/supabase/client";

export interface PlaceholderField {
  id: string;
  label: string;
  hint: string;
  originalText: string;
}

export interface EssentialQuestion {
  id: string;
  question: string;
  required: boolean;
}

export interface ExtractedImage {
  id: string;
  originalPath: string;
  storagePath: string;
  publicUrl: string;
  mimeType: string;
}

export interface ContentBlock {
  type: 'text' | 'image' | 'table';
  content: string;
}

export interface ParsedHwpxResult {
  success: boolean;
  templatePath: string;
  originalTemplatePath?: string;
  placeholders: PlaceholderField[];
  essentialQuestions: EssentialQuestion[];
  regionCount: number;
  placeholderCount?: number;
  plainText: string;
  images: ExtractedImage[];
  contentBlocks: ContentBlock[];
  metadata: {
    fileCount: number;
    hasImages: boolean;
    xmlFiles: string[];
    sectionCount: number;
  };
  error?: string;
}

/**
 * Call the parse-hwpx Edge Function to analyze an uploaded HWPX file
 * Returns detected placeholders, essential questions, and extracted images
 */
export async function parseHwpxFile(filePath: string): Promise<ParsedHwpxResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      return createErrorResult("Authentication required");
    }

    const response = await supabase.functions.invoke("parse-hwpx", {
      body: { filePath, mode: "analyze" },
    });

    if (response.error) {
      console.error("[hwpxParser] Edge function error:", response.error);
      return createErrorResult(response.error.message || "Failed to parse HWPX file");
    }

    return response.data as ParsedHwpxResult;
  } catch (error) {
    console.error("[hwpxParser] Error:", error);
    return createErrorResult(error instanceof Error ? error.message : "Unknown error");
  }
}

function createErrorResult(errorMessage: string): ParsedHwpxResult {
  return {
    success: false,
    templatePath: "",
    placeholders: [],
    essentialQuestions: [],
    regionCount: 0,
    plainText: "",
    images: [],
    contentBlocks: [],
    metadata: { fileCount: 0, hasImages: false, xmlFiles: [], sectionCount: 0 },
    error: errorMessage,
  };
}

/**
 * Convert content blocks (text + images + tables) to Markdown format for Tiptap
 * Also strips placeholder markers from display
 */
export function contentBlocksToMarkdown(blocks: ContentBlock[]): string {
  return blocks.map(block => {
    if (block.type === 'image') {
      return `![이미지](${block.content})`;
    }
    // Tables are already in Markdown format from the parser
    if (block.type === 'table') {
      return block.content;
    }
    // Strip placeholder patterns from text content
    const cleanedContent = block.content.replace(/\{\{[^}]+\}\}/g, '').trim();
    return cleanedContent;
  }).filter(content => content.length > 0).join("\n\n");
}

/**
 * Validate if content is valid Tiptap JSON
 */
export function isValidTiptapContent(content: unknown): boolean {
  if (!content || typeof content !== "object") return false;
  const doc = content as { type?: string; content?: unknown[] };
  return doc.type === "doc" && Array.isArray(doc.content);
}

/**
 * Create empty Tiptap document
 */
export function createEmptyDocument(): object {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

/**
 * Convert placeholder responses to Tiptap content for editing
 */
export function createTiptapFromPlaceholders(
  placeholders: PlaceholderField[],
  userInputs: Record<string, string>
): object {
  const content: object[] = [];
  
  for (const placeholder of placeholders) {
    // Add label as heading
    content.push({
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: placeholder.label }],
    });
    
    // Add user input or original text
    const text = userInputs[placeholder.id] || placeholder.originalText || placeholder.hint;
    content.push({
      type: "paragraph",
      content: [{ type: "text", text }],
    });
    
    // Add spacing
    content.push({ type: "paragraph" });
  }
  
  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}
