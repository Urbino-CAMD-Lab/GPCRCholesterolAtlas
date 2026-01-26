// static/js/nanoshaperViewer.js
// Nanoshaper viewer with sizing, camera, and buttons from template

(function(){

    function qs(name){ return new URLSearchParams(window.location.search).get(name); }
    const pdb_id = qs("system") || qs("pdb");
    if(!pdb_id){
        console.warn("No system specified. Nanoshaper viewer disabled.");
        const c = document.getElementById("pockets-table-container");
        if(c) c.innerHTML = "<p>No system specified. Use <code>system.html?system=7fee</code>.</p>";
        return;
    }

    const nanoDir = `/static/data/${pdb_id}/nanoshaper`;
    const nsPDB = `${nanoDir}/${pdb_id}_nanoshaper.pdb`;
    const pocketsCSV = `${nanoDir}/${pdb_id}_ranked_pockets.csv`;

    const nsContainer = document.getElementById("nanoshaper-viewer");
    const nsStageEl = document.getElementById("ns-stage");
    const pocketsContainer = document.getElementById("pockets-table-container");

    let nsStage = null;
    let pendingPocketIds = null;
    const pocketRegistry = {};

    /* ------------------ SIZING (from first snippet) ------------------ */
    function updateViewerSizes(){
        const leftContainer = document.getElementById("left-container");
        if(!leftContainer) return;
        const leftRect = leftContainer.getBoundingClientRect();
        const cardGap = 20;
        const totalInnerHeight = leftRect.height;
        const availableForCards = totalInnerHeight - cardGap;
        const cardHeight = Math.floor(availableForCards / 2);

        const headerEl = document.getElementById("pocket-card")?.querySelector(".card-header");
        const headerH = headerEl ? headerEl.getBoundingClientRect().height : 28;
        const stageHeight = Math.max(120, cardHeight - headerH - 8);

        if(nsStageEl){
            nsStageEl.style.width = "100%";
            nsStageEl.style.height = stageHeight + "px";
        }

        try{ if(nsStage) nsStage.handleResize(); }catch(e){}
    }
    window.addEventListener("resize", updateViewerSizes);

    /* ------------------ CAMERA CONTROLS & BUTTONS ------------------ */
    function attachControls(nsStage, baselineOrientation){
        const existing = nsContainer.querySelectorAll("#ns-view-controls");
        existing.forEach(el => el.remove());

        const sideOrientation = baselineOrientation.clone();
        const mat = new NGL.Matrix4(); mat.makeRotationX(-Math.PI/2);
        sideOrientation.multiply(mat);
        const topOrientation = sideOrientation.clone();
        topOrientation.multiply(mat);

        const viewDiv = document.createElement("div");
        viewDiv.id = "ns-view-controls";
        viewDiv.className = "controls-box";
        viewDiv.style.position = "absolute";
        viewDiv.style.top = "10px";
        viewDiv.style.right = "10px";

        const sideBtn = document.createElement("button");
        sideBtn.innerHTML = '<i class="material-icons">visibility</i> Side View';
        sideBtn.onclick = () => { try{ nsStage.viewerControls.orient(sideOrientation); }catch(e){} };

        const topBtn = document.createElement("button");
        topBtn.innerHTML = '<i class="material-icons">visibility</i> Top View';
        topBtn.onclick = () => { try{ nsStage.viewerControls.orient(topOrientation); }catch(e){} };

        viewDiv.appendChild(sideBtn);
        viewDiv.appendChild(topBtn);
        nsContainer.appendChild(viewDiv);
    }

    /* ------------------ Nanoshaper Viewer ------------------ */
    function loadNanoshaperViewer(){
        if(!nsStageEl) return;

        nsStage = new NGL.Stage("ns-stage");
        nsStage.setParameters({ backgroundColor:"black", lightIntensity:0.5, ambientColor:0xFFFFFF, lightColor:0xFFFFFF });

        updateViewerSizes();

        nsStage.loadFile(nsPDB).then(comp => {
            comp.addRepresentation("ribbon",{ sele:"all", radius:0.3, color:0x5FB5E3, quality:"high" });
            comp.autoView?.();

            const baseline = nsStage.viewerControls.getOrientation().clone();
            try{ nsStage.viewerControls.orient(baseline); }catch(e){}

            attachControls(nsStage, baseline);

        }).catch(err => {
            console.error("Failed to load nanoshaper pdb:", nsPDB, err);
            nsStageEl.innerHTML = `<div style="color:#900; padding:10px">Failed to load ${nsPDB}</div>`;
        });

        if(pendingPocketIds) loadPocketFilesIntoNanoshaper(pendingPocketIds);
    }

    /* ------------------ Table & Pocket Loading ------------------ */
    function loadPocketsTable(){
        if(!pocketsContainer) return;
        pocketsContainer.innerHTML = "<p>Loading pockets table...</p>";

        fetch(pocketsCSV).then(resp=>{
            if(!resp.ok) throw new Error("CSV not found");
            return resp.text();
        }).then(text=>{
            const lines = text.trim().split(/\r?\n/).filter(Boolean);
            if(lines.length<=0){ pocketsContainer.innerHTML="<p>No pockets CSV content.</p>"; return; }

            const headerLine = lines.shift();
            const rows = lines.map(l=>l.split(",").map(s=>s.trim())).slice(0,5);
            const pocketIds = rows.map(r=>parseInt(r[0],10)).filter(n=>!isNaN(n));
            pendingPocketIds = pocketIds;

            if(nsStage) loadPocketFilesIntoNanoshaper(pocketIds);

            const table = document.createElement("table");
            table.innerHTML = `<thead><tr>
                <th></th><th>Pocket id</th><th>ResIDs</th><th>ResIDs_BW</th><th>Total Score</th>
            </tr></thead><tbody></tbody>`;
            const tbody = table.querySelector("tbody");

            rows.forEach(r=>{
                const pocketId = r[0]||"";
                const resids = r[1]||"";
                const resids_bw = r[2]||"";
                const totalScore = (r[5]!==undefined)?r[5]:(r[r.length-1]||"");
                const tr = document.createElement("tr");
                tr.innerHTML = `<td style="width:40px;text-align:center;">
                    <input type="checkbox" data-pocket="${pocketId}">
                </td><td>${pocketId}</td><td>${resids}</td><td>${resids_bw}</td><td>${totalScore}</td>`;
                tbody.appendChild(tr);
            });

            pocketsContainer.innerHTML="";
            pocketsContainer.appendChild(table);

            pocketsContainer.querySelectorAll('input[data-pocket]').forEach(cb=>{
                cb.addEventListener("change",()=>{
                    const pid = parseInt(cb.dataset.pocket,10);
                    const entry = pocketRegistry[pid];
                    if(!entry) return;
                    if(entry.pdbComp) entry.pdbComp.setVisibility(cb.checked);
                    if(entry.objComp) entry.objComp.setVisibility(cb.checked);
                });
            });

        }).catch(err=>{
            console.error("Failed to fetch pockets CSV:", err);
            pocketsContainer.innerHTML = `<p style="color:#900">Could not load pockets CSV: ${pocketsCSV}</p>`;
        });
    }

    function loadPocketFilesIntoNanoshaper(pocketIds){
        if(!nsStage) return;
        pocketIds.forEach(pid=>{
            if(pocketRegistry[pid]) return;
            const padded = pid.toString().padStart(3,"0");
            const pdbUrl = `${nanoDir}/${padded}.pdb`;
            const objUrl = `${nanoDir}/cav_tri${pid}.obj`;
            pocketRegistry[pid]={ pdbComp:null, objComp:null };

            nsStage.loadFile(pdbUrl).then(comp=>{
                comp.addRepresentation("licorice",{opacity:1.0,radius:0.3,color:"red"});
                comp.setVisibility(false);
                pocketRegistry[pid].pdbComp=comp;
            });

            nsStage.loadFile(objUrl).then(comp=>{
                comp.addRepresentation("surface",{opacity:0.4,color:"blue",surfaceType:"av"});
                comp.setVisibility(false);
                pocketRegistry[pid].objComp=comp;
            });
        });
    }

    // ---------- INIT ----------
    setTimeout(()=>{
        loadPocketsTable();
        loadNanoshaperViewer();
    },0);

})();

// -------- BEHAVIOUR FOR DOWNLOADING CSV BUTTON --------

(function(){

    function qs(name){
        return new URLSearchParams(window.location.search).get(name);
    }

    const pdb_id = qs("system") || qs("pdb");
    if(!pdb_id) return;

    const btn = document.getElementById("download-pockets-csv");
    if(!btn) return;

    const csvUrl = `/static/data/${pdb_id}/nanoshaper/${pdb_id}_ranked_pockets.csv`;

    btn.addEventListener("click", () => {
        const a = document.createElement("a");
        a.href = csvUrl;
        a.download = `${pdb_id}_ranked_pockets.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

})();

