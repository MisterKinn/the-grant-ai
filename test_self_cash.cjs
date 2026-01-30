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

    // Count occurrences
    const count = (section0.match(/\{\{budget_self_cash\}\}/g) || []).length;
    console.log("{{budget_self_cash}} occurrences:", count);

    // Replace ONLY this one
    section0 = section0.replace(/\{\{budget_self_cash\}\}/g, "10000000");

    // Verify
    const afterCount = (section0.match(/\{\{budget_self_cash\}\}/g) || [])
        .length;
    console.log("After replacement:", afterCount);

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
    fs.writeFileSync("/Users/kinn/Downloads/test26_self_cash_only.hwpx", out26);
    console.log("Saved: ~/Downloads/test26_self_cash_only.hwpx");
})();
