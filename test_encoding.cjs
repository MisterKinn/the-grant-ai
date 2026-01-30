const JSZip = require("./node_modules/jszip");
const fs = require("fs");

(async () => {
    const buf26 = fs.readFileSync(
        "/Users/kinn/Desktop/thegrantai/public/template_2026_early.hwpx",
    );
    console.log("원본 2026:", buf26.length, "bytes");

    const zip26 = await JSZip.loadAsync(buf26);

    const FILE_ORDER = [
        "mimetype",
        "version.xml",
        "Contents/header.xml",
        "Contents/section0.xml",
        "Preview/PrvText.txt",
        "Scripts/headerScripts",
        "Scripts/sourceScripts",
        "settings.xml",
        "Preview/PrvImage.png",
        "META-INF/container.rdf",
        "Contents/content.hpf",
        "META-INF/container.xml",
        "META-INF/manifest.xml",
    ];

    // Read section0.xml as uint8array first
    const section0Bytes = await zip26
        .file("Contents/section0.xml")
        .async("uint8array");
    console.log("section0.xml 원본 크기:", section0Bytes.length, "bytes");

    // Decode as UTF-8
    const decoder = new TextDecoder("utf-8");
    let section0 = decoder.decode(section0Bytes);

    // Check for BOM
    if (section0.charCodeAt(0) === 0xfeff) {
        console.log("BOM detected!");
    }

    // Simple replacement
    section0 = section0.replace(/\{\{info_company_name\}\}/g, "TestCompany");
    section0 = section0.replace(/\{\{budget_total\}\}/g, "100000000");
    section0 = section0.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, "");

    // Encode back to UTF-8
    const encoder = new TextEncoder();
    const section0Modified = encoder.encode(section0);
    console.log("section0.xml 수정 후 크기:", section0Modified.length, "bytes");

    const new26 = new JSZip();

    for (const path of FILE_ORDER) {
        const file = zip26.files[path];
        if (!file) continue;

        if (path === "mimetype") {
            new26.file("mimetype", "application/hwp+zip", {
                compression: "STORE",
            });
        } else if (path === "Contents/section0.xml") {
            // Use modified section0 as Uint8Array
            new26.file(path, section0Modified, { compression: "DEFLATE" });
            console.log("치환된 section0.xml 추가 (Uint8Array)");
        } else {
            const content = await file.async("uint8array");
            const shouldStore =
                path.endsWith(".png") || path.startsWith("Scripts/");
            new26.file(path, content, {
                compression: shouldStore ? "STORE" : "DEFLATE",
            });
        }
    }

    const out26 = await new26.generateAsync({ type: "nodebuffer" });

    fs.writeFileSync("/Users/kinn/Downloads/test26_encoding_fix.hwpx", out26);
    console.log("\n파일 저장: ~/Downloads/test26_encoding_fix.hwpx");
})();
