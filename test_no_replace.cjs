const JSZip = require("./node_modules/jszip");
const fs = require("fs");

(async () => {
    // 2026 템플릿 로드
    const buf26 = fs.readFileSync(
        "/Users/kinn/Desktop/thegrantai/public/template_2026_early.hwpx",
    );
    console.log("원본 2026:", buf26.length, "bytes");

    const zip26 = await JSZip.loadAsync(buf26);
    const files = Object.keys(zip26.files);
    console.log("파일 수:", files.length);

    // 파일 순서 (2025와 동일하게)
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

    const new26 = new JSZip();

    for (const path of FILE_ORDER) {
        const file = zip26.files[path];
        if (!file) {
            console.log("파일 없음:", path);
            continue;
        }

        if (path === "mimetype") {
            // mimetype은 정확히 STORE로
            new26.file("mimetype", "application/hwp+zip", {
                compression: "STORE",
            });
            console.log("추가: mimetype (STORE)");
        } else {
            const content = await file.async("uint8array");
            const shouldStore =
                path.endsWith(".png") || path.startsWith("Scripts/");
            new26.file(path, content, {
                compression: shouldStore ? "STORE" : "DEFLATE",
            });
            console.log(`추가: ${path} (${shouldStore ? "STORE" : "DEFLATE"})`);
        }
    }

    // 생성 - compression 옵션 없이!
    const out26 = await new26.generateAsync({
        type: "nodebuffer",
    });

    fs.writeFileSync("/tmp/test26_no_replace.hwpx", out26);
    console.log("\n재생성 2026:", out26.length, "bytes");
    console.log("파일 저장: /tmp/test26_no_replace.hwpx");
    console.log("\n이 파일을 한글에서 열어보세요!");
})();
