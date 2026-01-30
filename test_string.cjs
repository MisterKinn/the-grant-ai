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

    // Read section0.xml as string and write back WITHOUT any changes
    const section0Original = await zip26
        .file("Contents/section0.xml")
        .async("uint8array");
    const section0String = await zip26
        .file("Contents/section0.xml")
        .async("string");

    console.log("Original bytes:", section0Original.length);
    console.log("String length:", section0String.length);
    console.log("First 100 chars:", section0String.substring(0, 100));

    const new26 = new JSZip();

    for (const path of FILE_ORDER) {
        const file = zip26.files[path];
        if (!file) continue;

        if (path === "mimetype") {
            new26.file("mimetype", "application/hwp+zip", {
                compression: "STORE",
            });
        } else if (path === "Contents/section0.xml") {
            // Write back the STRING (no modification)
            new26.file(path, section0String, { compression: "DEFLATE" });
            console.log("section0.xml added as STRING (no changes)");
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
    fs.writeFileSync(
        "/Users/kinn/Downloads/test26_string_passthrough.hwpx",
        out26,
    );
    console.log("\nSaved: ~/Downloads/test26_string_passthrough.hwpx");
    console.log(
        "This file has section0.xml read as string and written back with NO changes.",
    );
})();
