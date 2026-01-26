// static/js/systemInfo.js
(function(){

    // Helper to get URL query param
    function qs(name){
        return new URLSearchParams(window.location.search).get(name);
    }

    const pdb_id = qs("system") || qs("pdb");
    if(!pdb_id){
        console.warn("No system specified in URL query. System info not loaded.");
        return;
    }

    // DOM references
    const systemTab = document.getElementById("system-info-tab");
    if(!systemTab) return;

    const contentDiv = systemTab.querySelector(".data-tab-content");
    if(!contentDiv) return;

    const jsonFile = `/static/data/${pdb_id}/system_info.json`;

    fetch(jsonFile)
        .then(resp => {
            if(!resp.ok) throw new Error("JSON file not found");
            return resp.json();
        })
        .then(data => {
            // Clear placeholder
            contentDiv.innerHTML = "";

            // Build content dynamically
            const html = `
                <h2>${data.system_name || ""}</h2>
                <p><strong>PDB ID:</strong> ${data.pdb_id || ""}</p>
                <p><strong>Membrane composition:</strong> ${data.mb_comp || ""}</p>
                <p><strong>Total simulated time:</strong> ${data.sim_t || ""}</p>
                <p><strong>NanoShaper parameters:</strong> ${data.ns_params || ""}</p>
            `;
            contentDiv.innerHTML = html;
        })
        .catch(err => {
            console.error("Failed to load system info JSON:", err);
            contentDiv.innerHTML = `<p style="color:#900">Failed to load system info.</p>`;
        });

})();

