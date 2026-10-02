import { useState } from "react";
import { isInstalledApp } from "./installApp";

// TEMPORARY (admins only, in About): finds which way of saving a file works
// inside Firefox's home-screen app on Android, where Profile Books open as
// about:blank. Remove once Profile Books save there.

const TEST_PDF = "/test-download.pdf"; // a tiny one-page PDF (public/)

async function testPdfBlob() {
    const response = await fetch(TEST_PDF);
    return new Blob([await response.arrayBuffer()], { type: "application/pdf" });
}

function clickLink(href, name, target) {
    const link = document.createElement("a");
    link.href = href;
    if (name) link.download = name;
    if (target) link.target = target;
    document.body.append(link);
    link.click();
    link.remove();
}

function DownloadTest() {
    const [log, setLog] = useState([]);
    const note = (text) => setLog((lines) => [...lines, text]);

    const tests = [
        ["A", "Download (as now)", async () => clickLink(URL.createObjectURL(await testPdfBlob()), "test-A.pdf")],
        [
            "C",
            'Download as a "data" link',
            async () => {
                const reader = new FileReader();
                reader.onload = () => clickLink(reader.result, "test-C.pdf");
                reader.readAsDataURL(await testPdfBlob());
            },
        ],
        ["D", "Open in a new window", async () => window.open(URL.createObjectURL(await testPdfBlob()), "_blank")],
        ["F", "Download from a web address", () => clickLink(TEST_PDF, "test-F.pdf")],
        ["G", "Open the web address in a new window", () => window.open(`${location.origin}${TEST_PDF}`, "_blank")],
        ["H", "Open the web address in this window", () => location.assign(TEST_PDF)],
    ];

    return (
        <section className="DownloadTest">
            <h2>Download test (admin, temporary)</h2>
            <p>
                Tap each, then check Firefox's Downloads. Note which letters work and what you see.
                Installed app: <b>{isInstalledApp() ? "yes" : "no"}</b>
            </p>
            {tests.map(([letter, label, run]) => (
                <button
                    key={letter}
                    type="button"
                    onClick={async () => {
                        try {
                            await run();
                            note(`${letter} tapped`);
                        } catch (error) {
                            note(`${letter}: ${error.message}`);
                        }
                    }}
                >
                    {letter}: {label}
                </button>
            ))}
            {log.length > 0 && <pre>{log.join("\n")}</pre>}
        </section>
    );
}

export default DownloadTest;
