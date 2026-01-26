// -------- BEHAVIOUR FOR DOWNLOAD BUTTONS (HOT SPOTS) --------
(function () {

    function qs(name){
        return new URLSearchParams(window.location.search).get(name);
    }

    const pdb_id = qs("system") || qs("pdb");
    if (!pdb_id) return;

    const baseStatic = `static/data/${pdb_id}`;

    const downloads = [
        {
            buttonId: "download-hot-spots-pdb",
            url: `${baseStatic}/${pdb_id}_hot_spots.pdb`,
            filename: `${pdb_id}_hot_spots.pdb`
        },
        {
            buttonId: "download-aa-structure-pdb",
            url: `${baseStatic}/${pdb_id}_aa.pdb`,
            filename: `${pdb_id}_aa.pdb`
        }
    ];

    function attachHandlers() {
        downloads.forEach(d => {
            const btn = document.getElementById(d.buttonId);
            if (!btn) return;

            btn.addEventListener("click", () => {
                const a = document.createElement("a");
                a.href = d.url;
                a.download = d.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });
        });
    }

    // DOM-safe attach
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", attachHandlers);
    } else {
        attachHandlers();
    }

})();


