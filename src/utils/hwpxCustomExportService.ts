/**
 * Custom HWPX Export Service (Client-Side)
 * Uses the same mechanism as the predefined forms (예창패, 청창패)
 * Downloads original HWPX from Supabase Storage, replaces text, exports
 */

import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

/**
 * HWPX 파일을 올바르게 생성하는 유틸리티 함수
 * CRITICAL: HWPX 파일 구조 요구사항
 * 1. mimetype 파일이 ZIP의 첫 번째 엔트리여야 함
 * 2. mimetype 파일은 압축되지 않아야 함 (STORE 메서드)
 * 3. mimetype 내용은 정확히 "application/hwp+zip"이어야 함
 */
const generateValidHwpxZip = async (
    originalZip: JSZip,
    modifiedFiles: Map<string, string>,
): Promise<ArrayBuffer> => {
    const newZip = new JSZip();
    const allFiles = Object.keys(originalZip.files);

    // 1. mimetype을 첫 번째로 추가 (압축 안 함)
    const mimetypeContent = "application/hwp+zip";
    newZip.file("mimetype", mimetypeContent, { compression: "STORE" });

    // 2. 나머지 파일들을 순서대로 추가
    const orderedFiles = allFiles
        .filter((f) => f !== "mimetype" && !originalZip.files[f].dir)
        .sort();

    for (const filePath of orderedFiles) {
        const file = originalZip.files[filePath];
        if (file.dir) continue;

        // 수정된 파일이면 수정된 내용 사용, 아니면 원본 사용
        if (modifiedFiles.has(filePath)) {
            const modifiedContent = modifiedFiles.get(filePath)!;
            newZip.file(filePath, modifiedContent, { compression: "DEFLATE" });
        } else {
            // 원본 바이너리 그대로 복사
            const content = await file.async("uint8array");

            // 특정 파일들은 압축하지 않음 (이미지, 바이너리 등)
            const shouldStore =
                filePath.endsWith(".png") ||
                filePath.endsWith(".jpg") ||
                filePath.endsWith(".jpeg") ||
                filePath.startsWith("Scripts/");

            newZip.file(filePath, content, {
                compression: shouldStore ? "STORE" : "DEFLATE",
            });
        }
    }

    // ZIP 생성
    return await newZip.generateAsync({
        type: "arraybuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
    });
};

/**
 * Escape special XML characters
 */
const escapeXmlChars = (text: string): string => {
    if (text === undefined || text === null) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
};

/**
 * Format value for HWPX XML with proper line breaks
 *
 * HWPX requires closing current paragraph and opening new ones for line breaks.
 * Working structure: text1</hp:t></hp:run></hp:p><hp:p><hp:run><hp:t>text2
 */
const formatValueForHwpx = (value: string, _prefix: string = "hp"): string => {
    if (!value) return "";

    let s = String(value);

    // Remove trailing markers like 임
    s = s.replace(/임$/, "").trim();

    // Normalize line break types
    s = s
        .replace(/\\n/g, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/\r\n|\r/g, "\n");

    // Treat single newlines as paragraph breaks
    const lines = s
        .split(/\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    if (lines.length <= 1) {
        // Single line - just escape and return
        const text = s.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
        return escapeXmlChars(text);
    }

    // Multiple lines - create paragraph structure
    const escapedLines = lines.map((l) =>
        escapeXmlChars(l.replace(/\s+/g, " ").trim()),
    );

    // Join with HWPX paragraph break structure
    const lineBreak = `</hp:t></hp:run></hp:p><hp:p><hp:run><hp:t>`;

    return escapedLines.join(lineBreak);
};

/**
 * Extract text from HTML table cells
 */
const extractEditedTableCells = (content: string): string[] => {
    const cells: string[] = [];
    const cellPattern = /<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
    let match;
    while ((match = cellPattern.exec(content)) !== null) {
        let text = match[1]
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
        cells.push(text);
    }
    return cells;
};

/**
 * Extract original text nodes from XML
 */
const extractOriginalTextNodes = (xmlContent: string): string[] => {
    const texts: string[] = [];
    const textPattern = /<(?:hp|p|hpx):t[^>]*>([^<]*)<\/(?:hp|p|hpx):t>/g;
    let match;
    while ((match = textPattern.exec(xmlContent)) !== null) {
        texts.push(match[1]);
    }
    return texts;
};

/**
 * Build changes map from original XML and edited HTML content
 */
/**
 * Build changes map from placeholders in edited content
 * Looks for cells with data-placeholder and data-original attributes
 * Compares current text with original to detect changes
 */
const buildChangesMapFromPlaceholders = (
    editedContent: string,
): Map<string, string> => {
    const changes = new Map<string, string>();

    console.log(`[hwpx-custom] Searching for placeholder-based changes...`);

    // Look for cells with data-placeholder attribute
    // Pattern captures: 1=placeholder ID, 2=all other attrs, 3=cell content
    const placeholderPattern =
        /<(?:th|td)[^>]*data-placeholder="([^"]*)"([^>]*)>([\s\S]*?)<\/(?:th|td)>/gi;
    let match;

    while ((match = placeholderPattern.exec(editedContent)) !== null) {
        const placeholderId = match[1];
        const otherAttrs = match[2];
        const userText = match[3]
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();

        // Extract original text from data-original attribute if present
        const originalMatch = otherAttrs.match(/data-original="([^"]*)"/);
        let originalText = "";
        if (originalMatch) {
            originalText = originalMatch[1]
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&amp;/g, "&")
                .replace(/&quot;/g, '"')
                .trim();
        }

        const placeholderMarker = `{{${placeholderId}}}`;

        // If there was original text and user changed it, map original -> new
        if (originalText && userText !== originalText) {
            changes.set(originalText, userText);
            console.log(
                `[hwpx-custom] Text change: "${originalText}" -> "${userText}"`,
            );
        }
        // If original was empty (placeholder only) and user typed something meaningful
        else if (
            !originalText &&
            userText &&
            !userText.match(/^\{\{T\d+_R\d+_C\d+_G\d+\}\}$/)
        ) {
            changes.set(placeholderMarker, userText);
            console.log(
                `[hwpx-custom] Placeholder fill: "${placeholderMarker}" -> "${userText}"`,
            );
        }
        // CRITICAL: If original was empty and user didn't type anything, remove placeholder
        else if (
            !originalText ||
            userText.match(/^\{\{T\d+_R\d+_C\d+_G\d+\}\}$/) ||
            !userText
        ) {
            // Map placeholder to empty string to remove it from the document
            changes.set(placeholderMarker, "");
            console.log(
                `[hwpx-custom] Remove empty placeholder: "${placeholderMarker}" -> ""`,
            );
        }
    }

    console.log(
        `[hwpx-custom] Found ${changes.size} changes (including placeholder removals)`,
    );
    return changes;
};

/**
 * Build changes map using explicit edit markers (legacy approach)
 * The editedContent should contain data-original attributes with the original text
 * Format: <td data-original="원본텍스트">수정된텍스트</td>
 */
const buildChangesMapFromMarkers = (
    editedContent: string,
): Map<string, string> => {
    const changes = new Map<string, string>();

    // Debug: Check if content has data-original attributes
    const hasDataOriginal = editedContent.includes("data-original");
    const hasDataPlaceholder = editedContent.includes("data-placeholder");
    console.log(
        `[hwpx-custom] Content has data-original: ${hasDataOriginal}, data-placeholder: ${hasDataPlaceholder}`,
    );

    // First try placeholder-based changes
    if (hasDataPlaceholder) {
        return buildChangesMapFromPlaceholders(editedContent);
    }

    // Fallback to data-original based changes
    const markerPattern =
        /<(?:th|td)[^>]*data-original="([^"]*)"[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
    let match;

    while ((match = markerPattern.exec(editedContent)) !== null) {
        const original = match[1]
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();

        const edited = match[2]
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();

        if (original !== edited && original.length > 0 && edited.length > 0) {
            changes.set(original, edited);
            console.log(`[hwpx-custom] Change: "${original}" -> "${edited}"`);
        }
    }

    console.log(`[hwpx-custom] Found ${changes.size} changes from markers`);
    return changes;
};

/**
 * Export custom HWPX file with text replacements (Client-Side)
 * Same mechanism as hwpxExportService.ts
 */
export const exportCustomHwpx = async (
    templatePath: string,
    editedContent: string,
    fileName: string,
): Promise<void> => {
    try {
        console.log(`🚀 Custom HWPX Export (Client-Side): ${fileName}`);
        console.log(`📁 Template path: ${templatePath}`);

        // 1. Download original HWPX from Supabase Storage
        const { data: fileData, error: downloadError } = await supabase.storage
            .from("project_files")
            .download(templatePath);

        if (downloadError || !fileData) {
            throw new Error(
                `Failed to download template: ${downloadError?.message}`,
            );
        }

        const originalArrayBuffer = await fileData.arrayBuffer();
        console.log(
            `📦 Original file size: ${originalArrayBuffer.byteLength} bytes`,
        );

        // 2. Load HWPX as ZIP (same as hwpxExportService)
        const zip = await JSZip.loadAsync(originalArrayBuffer);
        console.log(`📂 ZIP loaded, files: ${Object.keys(zip.files).length}`);

        // 3. Find section XML files
        const sectionFiles = Object.keys(zip.files)
            .filter(
                (f) =>
                    f.startsWith("Contents/") &&
                    f.endsWith(".xml") &&
                    f.includes("section"),
            )
            .sort();

        console.log(`📄 Section files:`, sectionFiles);

        // 수정된 파일을 추적하기 위한 Map
        const modifiedFiles = new Map<string, string>();

        // 4. Apply text replacements to section files
        for (const sectionFile of sectionFiles) {
            const xmlContent = await zip.file(sectionFile)?.async("string");
            if (!xmlContent) continue;

            const changesMap = buildChangesMapFromMarkers(editedContent);

            let newXmlContent = xmlContent;

            // Detect namespace prefix (hp, p, or hpx)
            const prefixMatch = xmlContent.match(/<(\w+):p\b/);
            const prefix = prefixMatch ? prefixMatch[1] : "hp";

            // Apply specific changes from changesMap using simple text replacement
            for (const [originalText, newText] of changesMap) {
                const escapedOriginal = originalText.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&",
                );
                const pattern = new RegExp(
                    `(<(?:hp|p|hpx):t[^>]*>)${escapedOriginal}(<\\/(?:hp|p|hpx):t>)`,
                    "g",
                );
                // Use formatValueForHwpx for clean text replacement (no line break injection)
                const formattedText = formatValueForHwpx(newText, prefix);
                newXmlContent = newXmlContent.replace(
                    pattern,
                    `$1${formattedText}$2`,
                );
                console.log(
                    `📝 Applied replacement for: "${originalText.substring(0, 30)}..."`,
                );
            }

            // NUCLEAR OPTION: Force remove ALL remaining placeholder patterns
            // This catches any placeholders that weren't in the changesMap
            const placeholderPatterns = [
                // New format: {{T0_R0_C0_G0}}
                /\{\{T\d+_R\d+_C\d+_G\d+\}\}/g,
                // Old format: {{FIELD_0_0}}
                /\{\{FIELD_\d+_\d+\}\}/g,
            ];

            for (const pattern of placeholderPatterns) {
                const beforeLength = newXmlContent.length;
                newXmlContent = newXmlContent.replace(pattern, "");
                const afterLength = newXmlContent.length;
                if (beforeLength !== afterLength) {
                    console.log(
                        `🔥 Force-removed placeholders matching ${pattern} (saved ${beforeLength - afterLength} chars)`,
                    );
                }
            }

            // 수정된 파일을 Map에 저장
            modifiedFiles.set(sectionFile, newXmlContent);
            console.log(
                `✅ Applied changes to ${sectionFile} (changesMap: ${changesMap.size})`,
            );
        }

        // 5. Generate HWPX with proper mimetype handling
        const arrayBuffer = await generateValidHwpxZip(zip, modifiedFiles);

        console.log(`📦 Generated HWPX size: ${arrayBuffer.byteLength} bytes`);

        if (arrayBuffer.byteLength < 100) {
            throw new Error("Generated HWPX file is too small");
        }

        // 6. Download file (same as hwpxExportService)
        const finalName = fileName.endsWith(".hwpx")
            ? fileName
            : `${fileName}.hwpx`;
        const blob = new Blob([arrayBuffer], {
            type: "application/vnd.hancom.hwpx",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = finalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        console.log(`✅ Custom HWPX export complete: ${finalName}`);
    } catch (e) {
        console.error("❌ Custom HWPX Export Error:", e);
        throw e;
    }
};

/**
 * Simple passthrough - download and re-save original file (for testing)
 */
export const exportCustomHwpxPassthrough = async (
    templatePath: string,
    fileName: string,
): Promise<void> => {
    try {
        console.log(`🔄 Passthrough test: ${fileName}`);

        const { data: fileData, error: downloadError } = await supabase.storage
            .from("project_files")
            .download(templatePath);

        if (downloadError || !fileData) {
            throw new Error(
                `Failed to download template: ${downloadError?.message}`,
            );
        }

        const arrayBuffer = await fileData.arrayBuffer();
        console.log(`📦 Original file size: ${arrayBuffer.byteLength} bytes`);

        // Just save the original file as-is
        const finalName = fileName.endsWith(".hwpx")
            ? fileName
            : `${fileName}.hwpx`;
        const blob = new Blob([arrayBuffer], {
            type: "application/vnd.hancom.hwpx",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = finalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        console.log(`✅ Passthrough complete: ${finalName}`);
    } catch (e) {
        console.error("❌ Passthrough Error:", e);
        throw e;
    }
};

/**
 * Test 2: Load via JSZip and regenerate WITHOUT any changes
 * This tests if JSZip itself corrupts the file
 */
export const exportCustomHwpxJszipOnly = async (
    templatePath: string,
    fileName: string,
): Promise<void> => {
    try {
        console.log(`🔬 JSZip-only test (no modifications): ${fileName}`);

        const { data: fileData, error: downloadError } = await supabase.storage
            .from("project_files")
            .download(templatePath);

        if (downloadError || !fileData) {
            throw new Error(
                `Failed to download template: ${downloadError?.message}`,
            );
        }

        const originalArrayBuffer = await fileData.arrayBuffer();
        console.log(
            `📦 Original file size: ${originalArrayBuffer.byteLength} bytes`,
        );

        // Load with JSZip
        const zip = await JSZip.loadAsync(originalArrayBuffer);
        console.log(`📂 ZIP loaded, files: ${Object.keys(zip.files).length}`);

        // Regenerate WITHOUT any modifications
        const regeneratedBuffer = await zip.generateAsync({
            type: "arraybuffer",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
        });

        console.log(
            `📦 Regenerated size: ${regeneratedBuffer.byteLength} bytes`,
        );

        const finalName = fileName.endsWith(".hwpx")
            ? fileName
            : `${fileName}.hwpx`;
        const blob = new Blob([regeneratedBuffer], {
            type: "application/vnd.hancom.hwpx",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = finalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        console.log(`✅ JSZip-only test complete: ${finalName}`);
    } catch (e) {
        console.error("❌ JSZip-only Error:", e);
        throw e;
    }
};

/**
 * Test 4: Read section XML as string, write it back unchanged
 * Tests if zip.file(name, string) corrupts the encoding
 */
export const exportCustomHwpxReadWriteOnly = async (
    templatePath: string,
    fileName: string,
): Promise<void> => {
    try {
        console.log(`🔬 Read/Write test (no text changes): ${fileName}`);

        const { data: fileData, error: downloadError } = await supabase.storage
            .from("project_files")
            .download(templatePath);

        if (downloadError || !fileData) {
            throw new Error(
                `Failed to download template: ${downloadError?.message}`,
            );
        }

        const originalArrayBuffer = await fileData.arrayBuffer();
        const zip = await JSZip.loadAsync(originalArrayBuffer);

        // Find section files
        const sectionFiles = Object.keys(zip.files)
            .filter(
                (f) =>
                    f.startsWith("Contents/") &&
                    f.endsWith(".xml") &&
                    f.includes("section"),
            )
            .sort();

        console.log(`📄 Section files:`, sectionFiles);

        // Read and write back the EXACT same content
        for (const sectionFile of sectionFiles) {
            const xmlContent = await zip.file(sectionFile)?.async("string");
            if (!xmlContent) continue;

            // Write the EXACT same string back (no modifications at all)
            zip.file(sectionFile, xmlContent);
            console.log(
                `📝 Re-wrote ${sectionFile} (${xmlContent.length} chars)`,
            );
        }

        const regeneratedBuffer = await zip.generateAsync({
            type: "arraybuffer",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
        });

        console.log(
            `📦 Regenerated size: ${regeneratedBuffer.byteLength} bytes`,
        );

        const finalName = fileName.endsWith(".hwpx")
            ? fileName
            : `${fileName}.hwpx`;
        const blob = new Blob([regeneratedBuffer], {
            type: "application/vnd.hancom.hwpx",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = finalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        console.log(`✅ Read/Write test complete: ${finalName}`);
    } catch (e) {
        console.error("❌ Read/Write Error:", e);
        throw e;
    }
};

/**
 * Test 5: Simple hardcoded text replacement
 * Tests if ANY replacement breaks it, or just the complex logic
 */
export const exportCustomHwpxSimpleReplace = async (
    templatePath: string,
    fileName: string,
): Promise<void> => {
    try {
        console.log(`🔬 Simple replace test: ${fileName}`);

        const { data: fileData, error: downloadError } = await supabase.storage
            .from("project_files")
            .download(templatePath);

        if (downloadError || !fileData) {
            throw new Error(
                `Failed to download template: ${downloadError?.message}`,
            );
        }

        const originalArrayBuffer = await fileData.arrayBuffer();
        const zip = await JSZip.loadAsync(originalArrayBuffer);

        const sectionFiles = Object.keys(zip.files)
            .filter(
                (f) =>
                    f.startsWith("Contents/") &&
                    f.endsWith(".xml") &&
                    f.includes("section"),
            )
            .sort();

        for (const sectionFile of sectionFiles) {
            const xmlContent = await zip.file(sectionFile)?.async("string");
            if (!xmlContent) continue;

            // Simple replacement: just add "TEST" to the beginning of a common word
            // This is a minimal test to see if any string replacement breaks it
            const newXmlContent = xmlContent.replace(/소    속/g, "TEST소속");

            zip.file(sectionFile, newXmlContent);
            console.log(`📝 Simple replace in ${sectionFile}`);
        }

        const regeneratedBuffer = await zip.generateAsync({
            type: "arraybuffer",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
        });

        const finalName = fileName.endsWith(".hwpx")
            ? fileName
            : `${fileName}.hwpx`;
        const blob = new Blob([regeneratedBuffer], {
            type: "application/vnd.hancom.hwpx",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = finalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        console.log(`✅ Simple replace test complete: ${finalName}`);
    } catch (e) {
        console.error("❌ Simple replace Error:", e);
        throw e;
    }
};

/**
 * Test 5: Use the SAME regex pattern as exportCustomHwpx but with hardcoded values
 * Tests if the regex pattern itself breaks things
 */
export const exportCustomHwpxRegexTest = async (
    templatePath: string,
    fileName: string,
): Promise<void> => {
    try {
        console.log(`🔬 Regex pattern test: ${fileName}`);

        const { data: fileData, error: downloadError } = await supabase.storage
            .from("project_files")
            .download(templatePath);

        if (downloadError || !fileData) {
            throw new Error(
                `Failed to download template: ${downloadError?.message}`,
            );
        }

        const originalArrayBuffer = await fileData.arrayBuffer();
        const zip = await JSZip.loadAsync(originalArrayBuffer);

        const sectionFiles = Object.keys(zip.files)
            .filter(
                (f) =>
                    f.startsWith("Contents/") &&
                    f.endsWith(".xml") &&
                    f.includes("section"),
            )
            .sort();

        for (const sectionFile of sectionFiles) {
            let xmlContent = await zip.file(sectionFile)?.async("string");
            if (!xmlContent) continue;

            // Use the SAME regex pattern as the full export, but hardcoded values
            const originalText = "소    속";
            const newText = "TEST소속";

            const escapedOriginal = originalText.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&",
            );
            const pattern = new RegExp(
                `(<(?:hp|p|hpx):t[^>]*>)${escapedOriginal}(<\\/(?:hp|p|hpx):t>)`,
                "g",
            );

            // Check if pattern matches
            const matches = xmlContent.match(pattern);
            console.log(`Pattern matches: ${matches?.length || 0}`);

            xmlContent = xmlContent.replace(pattern, `$1${newText}$2`);

            zip.file(sectionFile, xmlContent);
            console.log(`📝 Regex replace in ${sectionFile}`);
        }

        const regeneratedBuffer = await zip.generateAsync({
            type: "arraybuffer",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
        });

        const finalName = fileName.endsWith(".hwpx")
            ? fileName
            : `${fileName}.hwpx`;
        const blob = new Blob([regeneratedBuffer], {
            type: "application/vnd.hancom.hwpx",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = finalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        console.log(`✅ Regex pattern test complete: ${finalName}`);
    } catch (e) {
        console.error("❌ Regex pattern Error:", e);
        throw e;
    }
};

/**
 * Test 6: Test with escapeXmlChars (the difference from Test 5)
 * This tests if double-escaping is the issue
 */
export const exportCustomHwpxEscapeTest = async (
    templatePath: string,
    fileName: string,
): Promise<void> => {
    try {
        console.log(`🔬 Escape XML test: ${fileName}`);

        const { data: fileData, error: downloadError } = await supabase.storage
            .from("project_files")
            .download(templatePath);

        if (downloadError || !fileData) {
            throw new Error(
                `Failed to download template: ${downloadError?.message}`,
            );
        }

        const originalArrayBuffer = await fileData.arrayBuffer();
        const zip = await JSZip.loadAsync(originalArrayBuffer);

        const sectionFiles = Object.keys(zip.files)
            .filter(
                (f) =>
                    f.startsWith("Contents/") &&
                    f.endsWith(".xml") &&
                    f.includes("section"),
            )
            .sort();

        for (const sectionFile of sectionFiles) {
            let xmlContent = await zip.file(sectionFile)?.async("string");
            if (!xmlContent) continue;

            const originalText = "소    속";
            const newText = "TEST소속";

            const escapedOriginal = originalText.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&",
            );
            const pattern = new RegExp(
                `(<(?:hp|p|hpx):t[^>]*>)${escapedOriginal}(<\\/(?:hp|p|hpx):t>)`,
                "g",
            );

            // Use escapeXmlChars like the full export does
            xmlContent = xmlContent.replace(
                pattern,
                `$1${escapeXmlChars(newText)}$2`,
            );

            zip.file(sectionFile, xmlContent);
            console.log(`📝 Escape XML replace in ${sectionFile}`);
        }

        const regeneratedBuffer = await zip.generateAsync({
            type: "arraybuffer",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
        });

        const finalName = fileName.endsWith(".hwpx")
            ? fileName
            : `${fileName}.hwpx`;
        const blob = new Blob([regeneratedBuffer], {
            type: "application/vnd.hancom.hwpx",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = finalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        console.log(`✅ Escape XML test complete: ${finalName}`);
    } catch (e) {
        console.error("❌ Escape XML Error:", e);
        throw e;
    }
};

/**
 * Test 8: LINE BREAK ONLY TEST
 * Tests ONLY line breaks with multiple methods
 * Replaces "소    속" with "첫줄\n둘째줄\n셋째줄" using different line break methods
 */
export const exportCustomHwpxLineBreakTest = async (
    templatePath: string,
    fileName: string,
): Promise<void> => {
    try {
        console.log(`🔬 LINE BREAK TEST (XML Structure): ${fileName}`);

        const { data: fileData, error: downloadError } = await supabase.storage
            .from("project_files")
            .download(templatePath);

        if (downloadError || !fileData) {
            throw new Error(
                `Failed to download template: ${downloadError?.message}`,
            );
        }

        const originalArrayBuffer = await fileData.arrayBuffer();
        const zip = await JSZip.loadAsync(originalArrayBuffer);

        const sectionFiles = Object.keys(zip.files)
            .filter(
                (f) =>
                    f.startsWith("Contents/") &&
                    f.endsWith(".xml") &&
                    f.includes("section"),
            )
            .sort();

        for (const sectionFile of sectionFiles) {
            let xmlContent = await zip.file(sectionFile)?.async("string");
            if (!xmlContent) continue;

            // HWPX requires MULTIPLE <hp:run> elements for line breaks, not text characters!
            // Test: Replace "소    속" label's value with multiple runs

            // Method 1: Multiple <hp:run> elements (most likely to work)
            const multiRunValue = `</hp:t></hp:run><hp:run><hp:t>첫째줄</hp:t></hp:run><hp:run><hp:t>둘째줄</hp:t></hp:run><hp:run><hp:t>셋째줄`;

            // Method 2: Using hp:linesegarray if available
            const lineSegValue = `첫줄</hp:t></hp:run></hp:p><hp:p><hp:run><hp:t>둘째줄</hp:t></hp:run></hp:p><hp:p><hp:run><hp:t>셋째줄`;

            const tests = [
                // Test 1: Multiple runs (소속 field)
                {
                    original: "소    속",
                    // Replace the text, creating multiple runs
                    newValue: multiRunValue,
                },
                // Test 2: Multiple paragraphs (직급 field)
                {
                    original: "직    급",
                    newValue: lineSegValue,
                },
                // Test 3: Simple text with HP specific line break element
                {
                    original: "성    명",
                    newValue: `이름1</hp:t></hp:run><hp:lineseg/><hp:run><hp:t>이름2</hp:t></hp:run><hp:lineseg/><hp:run><hp:t>이름3`,
                },
                // Test 4: Try ctrl char within run
                {
                    original: "생년월일",
                    newValue: `년월1</hp:t><hp:t>년월2</hp:t><hp:t>년월3`,
                },
            ];

            for (const test of tests) {
                const escapedOriginal = test.original.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&",
                );
                const pattern = new RegExp(
                    `(<(?:hp|p|hpx):t[^>]*>)${escapedOriginal}(<\\/(?:hp|p|hpx):t>)`,
                    "g",
                );

                const matches = xmlContent.match(pattern);
                if (matches && matches.length > 0) {
                    xmlContent = xmlContent.replace(
                        pattern,
                        `$1${test.newValue}$2`,
                    );
                    console.log(
                        `✅ Replaced "${test.original}" with structured XML`,
                    );
                }
            }

            zip.file(sectionFile, xmlContent);
        }

        const regeneratedBuffer = await zip.generateAsync({
            type: "arraybuffer",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
        });

        const finalName = fileName.endsWith(".hwpx")
            ? fileName
            : `${fileName}.hwpx`;
        const blob = new Blob([regeneratedBuffer], {
            type: "application/vnd.hancom.hwpx",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = finalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        console.log(`✅ Line break XML structure test complete: ${finalName}`);
        console.log(`📋 Check these fields in HWP:`);
        console.log(`   - 소속: Multiple <hp:run> elements`);
        console.log(`   - 직급: Multiple <hp:p> paragraphs`);
        console.log(`   - 성명: <hp:lineseg/> elements`);
        console.log(`   - 생년월일: Multiple <hp:t> in one run`);
    } catch (e) {
        console.error("❌ Line break XML test Error:", e);
        throw e;
    }
};

const normalizeLabel = (text: string): string => {
    return text
        .replace(/\s+/g, "") // Remove all spaces
        .replace(/[※:()（）\-_]/g, "") // Remove special chars
        .toLowerCase();
};

/**
 * Parse markdown/HTML content to extract label→value pairs
 * Handles: HTML tables, markdown tables, and "label: value" patterns
 */
const parseContentToLabelValueMap = (content: string): Map<string, string> => {
    const labelValueMap = new Map<string, string>();

    console.log(`[hwpx-parse] Parsing content, length: ${content.length}`);
    console.log(
        `[hwpx-parse] Content preview: ${content.substring(0, 200)}...`,
    );

    // STRATEGY 1: Parse HTML tables directly
    // Find all table rows and extract label-value pairs
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowPattern.exec(content)) !== null) {
        const rowHtml = rowMatch[1];

        // Extract all cells from this row
        const cells: string[] = [];
        const cellPattern = /<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
        let cellMatch;

        while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
            let cellText = cellMatch[1]
                .replace(/<[^>]+>/g, " ") // Remove nested tags
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&amp;/g, "&")
                .replace(/&nbsp;/g, " ")
                .replace(/\{\{[^}]+\}\}/g, "") // Remove placeholders
                .trim();
            cells.push(cellText);
        }

        // Process cells in pairs: [label, value, label, value, ...]
        for (let i = 0; i < cells.length - 1; i++) {
            const potentialLabel = cells[i];
            const potentialValue = cells[i + 1];

            // Skip if label is too short, empty, or looks like a value (long text)
            if (
                !potentialLabel ||
                potentialLabel.length < 2 ||
                potentialLabel.length > 30
            )
                continue;
            if (!potentialValue || potentialValue.length === 0) continue;

            // Skip common header/non-label texts
            if (
                ["항목", "구분", "내용", "비고", "※"].some((skip) =>
                    potentialLabel.includes(skip),
                )
            )
                continue;

            const normalized = normalizeLabel(potentialLabel);
            if (normalized.length >= 2 && !labelValueMap.has(normalized)) {
                labelValueMap.set(normalized, potentialValue);
                console.log(
                    `[hwpx-parse] HTML table: "${potentialLabel}" → "${potentialValue.substring(0, 30)}..."`,
                );
            }
        }
    }

    // STRATEGY 2: Parse markdown tables | label | value |
    const lines = content.split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
        if (trimmed.match(/^\|[\s\-:|]+\|$/)) continue; // Skip separator rows

        const cells = trimmed
            .slice(1, -1)
            .split("|")
            .map((c) => c.trim().replace(/\*\*/g, ""));

        if (cells.length >= 2) {
            const label = cells[0]?.trim();
            const value = cells[1]?.trim();
            if (
                label &&
                value &&
                value !== "-" &&
                label !== "항목" &&
                label !== "구분" &&
                !label.match(/^[\-:]+$/)
            ) {
                const normalized = normalizeLabel(label);
                if (normalized.length >= 2 && !labelValueMap.has(normalized)) {
                    labelValueMap.set(normalized, value);
                    console.log(
                        `[hwpx-parse] MD table: "${label}" → "${value.substring(0, 30)}..."`,
                    );
                }
            }
        }
    }

    // STRATEGY 3: Parse "라벨: 값" or "라벨：값" patterns
    const textContent = content
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ");
    const colonPattern = /([^:：\n]{2,30})[：:]([^\n]+)/g;
    let colonMatch;

    while ((colonMatch = colonPattern.exec(textContent)) !== null) {
        const label = colonMatch[1].replace(/\*\*/g, "").trim();
        const value = colonMatch[2].trim();
        if (label && value && label.length >= 2) {
            const normalized = normalizeLabel(label);
            if (!labelValueMap.has(normalized)) {
                labelValueMap.set(normalized, value);
                console.log(
                    `[hwpx-parse] Colon: "${label}" → "${value.substring(0, 30)}..."`,
                );
            }
        }
    }

    console.log(
        `[hwpx-parse] Total parsed: ${labelValueMap.size} label-value pairs`,
    );
    console.log(
        `[hwpx-parse] Labels found:`,
        Array.from(labelValueMap.keys()).slice(0, 10),
    );

    return labelValueMap;
};

/**
 * Extract all text nodes from XML and their positions
 */
interface TextNodeInfo {
    text: string;
    position: number;
    isInTable: boolean;
    tableDepth: number;
}

const extractAllTextNodes = (xmlContent: string): TextNodeInfo[] => {
    const nodes: TextNodeInfo[] = [];
    const textPattern = /<(?:hp|p|hpx):t[^>]*>([^<]*)<\/(?:hp|p|hpx):t>/g;

    let match;
    while ((match = textPattern.exec(xmlContent)) !== null) {
        const text = match[1];
        const position = match.index;

        // Check if inside table by counting table tags before this position
        const beforeContent = xmlContent.substring(0, position);
        const tableOpens = (beforeContent.match(/<hp:tbl[^>]*>/g) || []).length;
        const tableCloses = (beforeContent.match(/<\/hp:tbl>/g) || []).length;
        const isInTable = tableOpens > tableCloses;
        const tableDepth = tableOpens - tableCloses;

        nodes.push({ text, position, isInTable, tableDepth });
    }

    return nodes;
};

/**
 * Build DIRECT replacements by finding placeholder positions and their nearest labels
 * This is a completely rewritten approach:
 * 1. Find all placeholders and their exact positions
 * 2. Find the nearest label BEFORE each placeholder
 * 3. Look up that label in our value map
 */
const buildDirectReplacements = (
    xmlContent: string,
    labelValueMap: Map<string, string>,
): Map<string, string> => {
    const replacements = new Map<string, string>();

    // Get all text nodes
    const textNodes = extractAllTextNodes(xmlContent);

    // Find placeholder positions
    const placeholderPattern = /\{\{T\d+_R\d+_C\d+_G\d+\}\}/g;
    let match;

    while ((match = placeholderPattern.exec(xmlContent)) !== null) {
        const placeholder = match[0];
        const placeholderPos = match.index;

        // Find the nearest non-empty, non-placeholder text node BEFORE this placeholder
        let nearestLabel = "";
        let nearestDistance = Infinity;

        for (const node of textNodes) {
            const text = node.text.trim();

            // Skip empty, placeholder, or very short nodes
            if (!text || text.match(/^\{\{/) || text.length < 2) continue;

            // Only consider nodes BEFORE the placeholder
            if (node.position < placeholderPos) {
                const distance = placeholderPos - node.position;
                // Prefer closer labels, but within a reasonable range (5000 chars)
                if (distance < nearestDistance && distance < 5000) {
                    nearestDistance = distance;
                    nearestLabel = text;
                }
            }
        }

        if (nearestLabel) {
            const normalizedLabel = normalizeLabel(nearestLabel);

            // Try to find a matching value
            // Try exact match first
            let value = labelValueMap.get(normalizedLabel);

            // Try fuzzy matching if exact doesn't work
            if (!value) {
                for (const [key, val] of labelValueMap) {
                    // Check if label contains key or key contains label
                    if (
                        normalizedLabel.includes(key) ||
                        key.includes(normalizedLabel)
                    ) {
                        value = val;
                        break;
                    }
                }
            }

            if (value) {
                replacements.set(placeholder, value);
                console.log(
                    `[hwpx-export] ✓ "${nearestLabel}" -> ${placeholder.substring(0, 15)}... = "${value.substring(0, 40)}..."`,
                );
            }
        }
    }

    console.log(`[hwpx-custom] Built ${replacements.size} direct replacements`);
    return replacements;
};

/**
 * NUCLEAR APPROACH: Directly inject values into XML by finding labels and replacing next empty cells
 * This bypasses the placeholder system entirely when it fails
 */
const directXmlInjection = (
    xmlContent: string,
    labelValueMap: Map<string, string>,
): string => {
    let modifiedXml = xmlContent;
    let injectionCount = 0;

    // For each label we have a value for, find it in the XML and inject value in adjacent cell
    for (const [normalizedLabel, value] of labelValueMap) {
        // Find the raw label text in XML (may have spaces)
        const textPattern = /<(?:hp|p|hpx):t[^>]*>([^<]*)<\/(?:hp|p|hpx):t>/g;
        let match;

        while ((match = textPattern.exec(modifiedXml)) !== null) {
            const textContent = match[1];
            const normalizedText = normalizeLabel(textContent);

            // Check if this text matches our label
            if (
                normalizedText === normalizedLabel ||
                (normalizedText.length > 2 &&
                    normalizedLabel.includes(normalizedText)) ||
                (normalizedLabel.length > 2 &&
                    normalizedText.includes(normalizedLabel))
            ) {
                // Find the next placeholder after this position
                const afterPosition = match.index + match[0].length;
                const afterContent = modifiedXml.substring(
                    afterPosition,
                    afterPosition + 3000,
                );

                // Look for next placeholder
                const nextPlaceholder = afterContent.match(
                    /\{\{T\d+_R\d+_C\d+_G\d+\}\}/,
                );

                if (nextPlaceholder) {
                    const escapedPlaceholder = nextPlaceholder[0].replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&",
                    );
                    const beforeReplace = modifiedXml.length;
                    // Use formatValueForHwpx for multi-line support
                    const prefixMatch = modifiedXml.match(/<(\w+):p\b/);
                    const nsPrefix = prefixMatch ? prefixMatch[1] : "hp";
                    modifiedXml = modifiedXml.replace(
                        new RegExp(escapedPlaceholder),
                        formatValueForHwpx(value, nsPrefix),
                    );

                    if (modifiedXml.length !== beforeReplace) {
                        injectionCount++;
                        console.log(
                            `[hwpx-inject] ✓ Injected after "${textContent}": "${value.substring(0, 30)}..."`,
                        );
                    }
                }
            }
        }
    }

    console.log(
        `[hwpx-custom] Direct injection: ${injectionCount} values injected`,
    );
    return modifiedXml;
};

/**
 * Full export with contextual matching
 */
export const exportCustomHwpxFull = async (
    templatePath: string,
    markdownContent: string,
    fileName: string,
): Promise<void> => {
    try {
        console.log(
            `🚀 Custom HWPX Export (NEW Direct Injection): ${fileName}`,
        );

        // 1. Download original HWPX
        const { data: fileData, error: downloadError } = await supabase.storage
            .from("project_files")
            .download(templatePath);

        if (downloadError || !fileData) {
            throw new Error(
                `Failed to download template: ${downloadError?.message}`,
            );
        }

        const originalArrayBuffer = await fileData.arrayBuffer();
        console.log(
            `📦 Original file size: ${originalArrayBuffer.byteLength} bytes`,
        );

        // 2. Parse content to label→value
        const labelValueMap = parseContentToLabelValueMap(
            markdownContent || "",
        );

        // Debug: log all labels and values
        console.log(
            `[hwpx-custom] Labels found:`,
            Array.from(labelValueMap.keys()),
        );
        console.log(
            `[hwpx-custom] Values sample:`,
            Array.from(labelValueMap.entries()).slice(0, 5),
        );

        // 3. Load HWPX as ZIP
        const zip = await JSZip.loadAsync(originalArrayBuffer);

        // 4. Find section XML files
        const sectionFiles = Object.keys(zip.files)
            .filter(
                (f) =>
                    f.startsWith("Contents/") &&
                    f.endsWith(".xml") &&
                    f.includes("section"),
            )
            .sort();

        // 수정된 파일을 추적하기 위한 Map
        const modifiedFiles = new Map<string, string>();

        // 5. Process each section
        for (const sectionFile of sectionFiles) {
            let xmlContent = await zip.file(sectionFile)?.async("string");
            if (!xmlContent) continue;

            // Debug: Check if placeholders exist
            const placeholderCheck = xmlContent.match(
                /\{\{T\d+_R\d+_C\d+_G\d+\}\}/g,
            );
            console.log(
                `[hwpx-custom] Placeholders in ${sectionFile}: ${placeholderCheck?.length || 0}`,
            );

            // Method 1: Build direct replacements based on placeholder positions
            const directReplacements = buildDirectReplacements(
                xmlContent,
                labelValueMap,
            );

            // Detect namespace prefix for multi-line formatting
            const prefixMatch = xmlContent.match(/<(\w+):p\b/);
            const nsPrefix = prefixMatch ? prefixMatch[1] : "hp";

            // Apply direct replacements with multi-line support
            for (const [placeholder, value] of directReplacements) {
                const escapedPlaceholder = placeholder.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&",
                );
                xmlContent = xmlContent.replace(
                    new RegExp(escapedPlaceholder, "g"),
                    formatValueForHwpx(value, nsPrefix),
                );
            }

            // Method 2: Nuclear direct injection for remaining placeholders
            xmlContent = directXmlInjection(xmlContent, labelValueMap);

            // Final cleanup: Remove ALL remaining placeholders
            xmlContent = xmlContent.replace(/\{\{T\d+_R\d+_C\d+_G\d+\}\}/g, "");
            xmlContent = xmlContent.replace(/\{\{FIELD_\d+_\d+\}\}/g, "");

            modifiedFiles.set(sectionFile, xmlContent);
            console.log(`✅ Processed ${sectionFile}`);
        }

        // 6. Generate HWPX with proper mimetype handling
        const arrayBuffer = await generateValidHwpxZip(zip, modifiedFiles);

        // 7. Download
        const finalName = fileName.endsWith(".hwpx")
            ? fileName
            : `${fileName}.hwpx`;
        const blob = new Blob([arrayBuffer], {
            type: "application/vnd.hancom.hwpx",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = finalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        console.log(`✅ Custom HWPX export complete: ${finalName}`);
    } catch (e) {
        console.error("❌ Custom HWPX Export Error:", e);
        throw e;
    }
};
