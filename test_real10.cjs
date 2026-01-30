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
    const placeholders = [
        ...new Set(section0.match(/\{\{[a-zA-Z0-9_]+\}\}/g) || []),
    ];

    const testValues = {
        "{{info_company_name}}": "테스트회사",
        "{{info_est_date}}": "2024-01-01",
        "{{business_type}}": "예비창업자",
        "{{representative_type}}": "단독",
        "{{info_reg_number}}": "123-45-67890",
        "{{info_address}}": "서울특별시 강남구",
        "{{item_name}}": "AI 서비스 플랫폼",
        "{{target_output}}": "웹 서비스 프로토타입",
        "{{budget_gov}}": "50000000",
        "{{budget_self_cash}}": "10000000",
    };

    for (const ph of placeholders.slice(0, 10)) {
        const value = testValues[ph] || "TEST";
        section0 = section0.replace(
            new RegExp(ph.replace(/[{}]/g, "\\$&"), "g"),
            value,
        );
    }
    console.log("Replaced 10 placeholders");
    console.log("Placeholders 8-10:", placeholders.slice(7, 10));

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
    fs.writeFileSync("/Users/kinn/Downloads/test26_real10.hwpx", out26);
    console.log("Saved: ~/Downloads/test26_real10.hwpx");
})();
