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

    // Read section0.xml and do a simple replacement
    let section0 = await zip26.file("Contents/section0.xml").async("string");

    // Count placeholders before
    const before = (section0.match(/\{\{[a-zA-Z0-9_]+\}\}/g) || []).length;
    console.log("플레이스홀더 수 (치환 전):", before);

    // Simple replacement - just replace with plain text, no XML tags
    section0 = section0.replace(/\{\{info_company_name\}\}/g, "테스트회사");
    section0 = section0.replace(/\{\{budget_total\}\}/g, "100000000");
    section0 = section0.replace(/\{\{item_name\}\}/g, "AI 서비스");

    // Remove all remaining placeholders (replace with empty string)
    section0 = section0.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, "");

    const after = (section0.match(/\{\{[a-zA-Z0-9_]+\}\}/g) || []).length;
    console.log("플레이스홀더 수 (치환 후):", after);

    const new26 = new JSZip();

    for (const path of FILE_ORDER) {
        const file = zip26.files[path];
        if (!file) continue;

        if (path === "mimetype") {
            new26.file("mimetype", "application/hwp+zip", {
                compression: "STORE",
            });
        } else if (path === "Contents/section0.xml") {
            // Use modified section0
            new26.file(path, section0, { compression: "DEFLATE" });
            console.log("치환된 section0.xml 추가");
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

    fs.writeFileSync("/Users/kinn/Desktop/test26_with_replace.hwpx", out26);
    console.log("\n재생성 2026:", out26.length, "bytes");
    console.log("파일 저장: ~/Desktop/test26_with_replace.hwpx");
    console.log("\n이 파일을 한글에서 열어보세요!");
})();
