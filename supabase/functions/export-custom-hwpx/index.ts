// @ts-nocheck - Deno types not available in VS Code
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

const BUCKET_NAME = "project_files";

/**
 * Escape special XML characters
 */
function escapeXml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/**
 * Extract original text nodes from XML in order
 */
function extractOriginalTextNodes(xmlContent: string): string[] {
    const texts: string[] = [];
    const textPattern = /<(?:hp|p|hpx):t[^>]*>([^<]*)<\/(?:hp|p|hpx):t>/g;
    let match;
    while ((match = textPattern.exec(xmlContent)) !== null) {
        texts.push(match[1]);
    }
    return texts;
}

/**
 * Extract text from edited HTML tables
 */
function extractEditedTableCells(content: string): string[] {
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
}

/**
 * Build a map of original cell text to edited cell text
 * Only includes cells where the user made actual changes
 */
function buildChangesMap(
    originalXml: string,
    editedContent: string,
): Map<string, string> {
    const changes = new Map<string, string>();

    // Extract original texts from XML
    const originalTexts = extractOriginalTextNodes(originalXml);

    // Extract edited texts from HTML tables
    const editedCells = extractEditedTableCells(editedContent);

    console.log(
        `[export] Original text nodes: ${originalTexts.length}, Edited cells: ${editedCells.length}`,
    );

    // Map each edited cell back to its original if changed
    // We need to match by position in table cells
    // This is tricky - we'll track which original texts correspond to table cells

    // For now, create a simple approach:
    // Find text nodes that exist in original but have different values in edited
    for (
        let i = 0;
        i < Math.min(originalTexts.length, editedCells.length);
        i++
    ) {
        const original = originalTexts[i].trim();
        const edited = editedCells[i];

        if (original !== edited && edited.length > 0) {
            changes.set(original, edited);
        }
    }

    console.log(`[export] Found ${changes.size} actual changes`);

    return changes;
}

/**
 * Apply only the specific text changes to the XML, preserving everything else
 */
async function applyMinimalChanges(
    zip: JSZip,
    editedContent: string,
    sectionFiles: string[],
): Promise<JSZip> {
    for (const sectionFile of sectionFiles) {
        const xmlContent = await zip.file(sectionFile)?.async("string");
        if (!xmlContent) continue;

        // Build map of changes
        const changesMap = buildChangesMap(xmlContent, editedContent);

        if (changesMap.size === 0) {
            console.log(
                `[export] No changes detected for ${sectionFile}, keeping original`,
            );
            continue;
        }

        // Apply only the changes - replace specific text content
        let newXmlContent = xmlContent;

        for (const [originalText, newText] of changesMap) {
            // Create a pattern to find this specific text in a text tag
            const escapedOriginal = originalText.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&",
            );
            const pattern = new RegExp(
                `(<(?:hp|p|hpx):t[^>]*>)${escapedOriginal}(<\\/(?:hp|p|hpx):t>)`,
                "g",
            );

            newXmlContent = newXmlContent.replace(
                pattern,
                `$1${escapeXml(newText)}$2`,
            );
        }

        zip.file(sectionFile, newXmlContent);
        console.log(
            `[export] Applied ${changesMap.size} changes to ${sectionFile}`,
        );
    }

    return zip;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
            "SUPABASE_SERVICE_ROLE_KEY",
        );

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error("Missing Supabase configuration");
        }

        // Authenticate user
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY!, {
            global: { headers: { Authorization: authHeader } },
        });

        const {
            data: { user },
            error: authError,
        } = await supabaseUser.auth.getUser();
        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: "Authentication failed" }),
                {
                    status: 401,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        // Get request data
        const { templatePath, editedContent, title, passthrough } =
            await req.json();

        if (!templatePath) {
            return new Response(
                JSON.stringify({ error: "templatePath is required" }),
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        console.log(
            `[export-custom-hwpx] Exporting: ${templatePath}, passthrough: ${passthrough}`,
        );

        // Download original template from storage
        const supabaseAdmin = createClient(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
        );
        const { data: fileData, error: downloadError } =
            await supabaseAdmin.storage
                .from(BUCKET_NAME)
                .download(templatePath);

        if (downloadError || !fileData) {
            console.error(
                `[export-custom-hwpx] Download error:`,
                downloadError,
            );
            return new Response(
                JSON.stringify({ error: "Failed to download template file" }),
                {
                    status: 404,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        // Get original file as ArrayBuffer
        const originalArrayBuffer = await fileData.arrayBuffer();
        console.log(
            `[export-custom-hwpx] Original file size: ${originalArrayBuffer.byteLength} bytes`,
        );

        // PASSTHROUGH MODE: Just return the original file as-is (for testing)
        if (passthrough) {
            console.log(
                `[export-custom-hwpx] Passthrough mode - returning original file`,
            );
            return new Response(originalArrayBuffer, {
                status: 200,
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/vnd.hancom.hwpx",
                    "Content-Disposition": `attachment; filename="${encodeURIComponent(title || "document")}.hwpx"`,
                    "Content-Length": originalArrayBuffer.byteLength.toString(),
                },
            });
        }

        // Load HWPX as ZIP
        const zip = await JSZip.loadAsync(originalArrayBuffer);

        console.log(
            `[export-custom-hwpx] ZIP loaded, files:`,
            Object.keys(zip.files).length,
        );

        // Find section XML files
        const sectionFiles = Object.keys(zip.files)
            .filter(
                (f) =>
                    f.startsWith("Contents/") &&
                    f.endsWith(".xml") &&
                    f.includes("section"),
            )
            .sort();

        console.log(`[export-custom-hwpx] Section files:`, sectionFiles);

        // Apply minimal changes - only update text that was actually modified
        if (editedContent) {
            for (const sectionFile of sectionFiles) {
                const xmlContent = await zip.file(sectionFile)?.async("string");
                if (!xmlContent) continue;

                // Build map of changes
                const changesMap = buildChangesMap(xmlContent, editedContent);

                if (changesMap.size === 0) {
                    console.log(
                        `[export] No changes detected for ${sectionFile}, keeping original`,
                    );
                    continue;
                }

                // Apply only the changes - replace specific text content
                let newXmlContent = xmlContent;

                for (const [originalText, newText] of changesMap) {
                    // Create a pattern to find this specific text in a text tag
                    const escapedOriginal = originalText.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&",
                    );
                    const pattern = new RegExp(
                        `(<(?:hp|p|hpx):t[^>]*>)${escapedOriginal}(<\\/(?:hp|p|hpx):t>)`,
                        "g",
                    );

                    newXmlContent = newXmlContent.replace(
                        pattern,
                        `$1${escapeXml(newText)}$2`,
                    );
                }

                // Update the file in the ZIP with same compression options
                zip.file(sectionFile, newXmlContent, {
                    compression: "DEFLATE",
                });
                console.log(
                    `[export] Applied ${changesMap.size} changes to ${sectionFile}`,
                );
            }
        }

        // Generate the modified HWPX file
        // Critical: mimetype must be STORED (no compression) as first file for HWPX/ODF format
        const newZip = new JSZip();

        // First, add mimetype uncompressed (required for HWPX format)
        const mimetypeContent = await zip.file("mimetype")?.async("string");
        if (mimetypeContent) {
            newZip.file("mimetype", mimetypeContent, { compression: "STORE" });
        }

        // Then add all other files with their original content
        for (const [filename, file] of Object.entries(zip.files)) {
            if (filename === "mimetype" || file.dir) continue;

            const content = await file.async("arraybuffer");
            newZip.file(filename, content, { compression: "DEFLATE" });
        }

        const modifiedHwpx = await newZip.generateAsync({
            type: "arraybuffer",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
        });

        console.log(
            `[export-custom-hwpx] Generated HWPX size: ${modifiedHwpx.byteLength} bytes`,
        );

        // Return the file as binary response
        return new Response(modifiedHwpx, {
            status: 200,
            headers: {
                ...corsHeaders,
                "Content-Type": "application/vnd.hancom.hwpx",
                "Content-Disposition": `attachment; filename="${encodeURIComponent(title || "document")}.hwpx"`,
                "Content-Length": modifiedHwpx.byteLength.toString(),
            },
        });
    } catch (error) {
        console.error("[export-custom-hwpx] Error:", error);
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
        return new Response(JSON.stringify({ error: errorMessage }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
