const JSZip = require("./node_modules/jszip");
const fs = require("fs");

(async () => {
    const buf26 = fs.readFileSync(
        "/Users/kinn/Desktop/thegrantai/public/template_2026_early.hwpx",
    );
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

    let section0 = await zip26.file("Contents/section0.xml").async("string");

    // Count linesegarray before
    const beforeCount = (
        section0.match(/<hp:linesegarray>.*?<\/hp:linesegarray>/gs) || []
    ).length;
    console.log("linesegarray count before:", beforeCount);

    // REMOVE ALL linesegarray elements
    section0 = section0.replace(
        /<hp:linesegarray>.*?<\/hp:linesegarray>/gs,
        "",
    );

    const afterCount = (
        section0.match(/<hp:linesegarray>.*?<\/hp:linesegarray>/gs) || []
    ).length;
    console.log("linesegarray count after:", afterCount);

    // Now replace ALL placeholders
    section0 = section0.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, "TEST");

    const new26 = new JSZip();

    for (const path of FILE_ORDER) {
        const file = zip26.files[path];
        if (!file) continue;

        if (path === "mimetype") {
            new26.file("mimetype", "application/hwp+zip", {
                compression: "STORE",
            });
        } else if (path === "Contents/section0.xml") {
            new26.file(path, section0, { compression: "DEFLATE" });
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
    fs.writeFileSync("/Users/kinn/Downloads/test26_no_lineseg.hwpx", out26);
    console.log("Saved: ~/Downloads/test26_no_lineseg.hwpx");
    console.log("ALL placeholders replaced after removing linesegarray");
})();
