// static/js/viewer.js
// Loads three viewers:
// - main replica viewer (viewer-stage)
// - aggregated viewer (agg-stage)
// - nanoshaper viewer (ns-stage in Ranked Pockets tab)
// Table shows Pocket id, ResIDs, ResIDs_BW, Total Score (first 5 rows).
// Checkboxes are present but currently inert (no behavior attached to viewers).

(function(){

    // small helper to read query param
    function qs(name){ return new URLSearchParams(window.location.search).get(name); }
    const pdb_id = qs("system") || qs("pdb");
    if(!pdb_id){
        console.warn("No system specified in URL query (e.g. ?system=7fee). Viewer disabled.");
        // show a message in the pockets area
        const c = document.getElementById("pockets-table-container");
        if(c) c.innerHTML = "<p>No system specified. Use <code>system.html?system=7fee</code>.</p>";
        return;
    }

    // base static paths
    const baseStatic = `/static/data/${pdb_id}`;
    const replicas = {
        1: { pdb: `${baseStatic}/${pdb_id}_rep_1.pdb`, xtc: `${baseStatic}/${pdb_id}_rep_1.xtc` },
        2: { pdb: `${baseStatic}/${pdb_id}_rep_2.pdb`, xtc: `${baseStatic}/${pdb_id}_rep_2.xtc` }
    };
    const aaUrl = `${baseStatic}/${pdb_id}_aa.pdb`;
    const hotspotsUrl = `${baseStatic}/${pdb_id}_hot_spots.pdb`;
    const nanoDir = `${baseStatic}/nanoshaper`;
    const nsPDB = `${nanoDir}/${pdb_id}_nanoshaper.pdb`;

    // DOM refs
    const mainContainer = document.getElementById("main-container");
    const leftContainer = document.getElementById("left-container");

    const viewerStageEl = document.getElementById("viewer-stage"); // main replica viewer
    const aggStageEl = document.getElementById("agg-stage");       // aggregated viewer
    const nsStageEl = document.getElementById("ns-stage");         // nanoshaper viewer

    const viewerContainer = document.getElementById("viewer-container");
    const aggContainer = document.getElementById("agg-viewer-container");
    const nsContainer = document.getElementById("nanoshaper-viewer");

    // pockets table container
    const pocketsContainer = document.getElementById("pockets-table-container");

    // global NGL stages
    let currentStage = null;  // main replica stage
    window.aggStage = null;
    let nsStage = null;

    // representations we toggle in main viewer controls
    let cholRep = null;
    let proteinBeadsRep = null;
    
    // track if pockets are loaded
    let pendingPocketIds = null;


    const pocketRegistry = {};
    
    // sizing behaviour:
    // - left column: two cards each occupy 50% of left column height (CSS flex), but the inner stage
    //   must be a centered square. JS computes the largest possible square that fits in each left-card content area.
    function updateViewerSizes(){
        // compute available height for left column content (leftContainer's inner height)
        const leftRect = leftContainer.getBoundingClientRect();
        const cardGap = 20; // matches CSS gap
        const horizontalPadding = 10 * 2; // left-container padding left+right
        // Each card's content area height roughly:
        const totalInnerHeight = leftRect.height;
        // subtract gap between cards
        const availableForCards = totalInnerHeight - cardGap;
        const cardHeight = Math.max(100, Math.floor(availableForCards / 2)); // each card height
        // For each card, we set the inner square size as min(cardHeight minus headers/paddings, and leftContainer available width)
        const leftWidth = Math.max(240, leftRect.width - horizontalPadding);

        // compute header heights to subtract: find header elements inside each left-card
        const replicaCard = document.getElementById("replica-card");
        const aggCard = document.getElementById("agg-card");

        function computeInnerSquareSize(cardEl){
            if(!cardEl) return 200;
            // find header height (card-header)
            const header = cardEl.querySelector(".card-header");
            const headerH = header ? header.getBoundingClientRect().height : 28;
            // find tabs height if present
            const tabs = cardEl.querySelector("#tabs");
            const tabsH = tabs ? tabs.getBoundingClientRect().height : 0;
            // available vertical inside the card for viewer area
            const availableV = cardHeight - headerH - tabsH - 16; // margins/padding approx
            const square = Math.max(120, Math.min(availableV, leftWidth - 24)); // leave some horizontal padding
            return Math.floor(square);
        }

        const square1 = computeInnerSquareSize(replicaCard);
        const square2 = computeInnerSquareSize(aggCard);
        const squareSize = Math.min(square1, square2);

        // apply size to inner stage containers so they are centered and square
        if(viewerStageEl){
            viewerStageEl.style.width = squareSize + "px";
            viewerStageEl.style.height = squareSize + "px";
        }
        if(aggStageEl){
            aggStageEl.style.width = squareSize + "px";
            aggStageEl.style.height = squareSize + "px";
        }

        // ensure left container width is adjusted so viewer squares fit comfortably
        leftContainer.style.width = (squareSize + 60) + "px";

        // Right-side: nsContainer should fill its flex area; we ensure nsStageEl fills nsContainer
        if(nsContainer){
            // nsStageEl is already width:100% height:100% in CSS
            // but call handleResize on nsStage if exists
        }

        // Notify NGL to resize
        try{ if(currentStage) currentStage.handleResize(); }catch(e){}
        try{ if(window.aggStage) window.aggStage.handleResize(); }catch(e){}
        try{ if(nsStage) nsStage.handleResize(); }catch(e){}
    }

    window.addEventListener("resize", updateViewerSizes);

    // ---------- UTIL: attach controls (shared style) ----------
    function attachControls(stage, structComp, trajComp, container, stateObj){
        // remove existing overlays
        const existing = container.querySelectorAll("#traj-controls, #view-controls");
        existing.forEach(el => el.remove());

        // trajectory controls (if any)
        if(trajComp){
            const frameCount = (trajComp && trajComp.trajectory) ? (trajComp.trajectory.frameCount || (trajComp.boxes ? trajComp.boxes.length : 1)) : 1;
            let currentFrame = 0;
            let intervalId = null;
            const fps = 20;
            const delay = 1000 / fps;

            const controlsDiv = document.createElement("div");
            controlsDiv.id = "traj-controls";
            controlsDiv.className = "controls-box";

            const prevBtn = document.createElement("button"); prevBtn.innerHTML = '<i class="material-icons">skip_previous</i>';
            const playPauseBtn = document.createElement("button"); playPauseBtn.innerHTML = '<i class="material-icons">play_arrow</i>';
            const nextBtn = document.createElement("button"); nextBtn.innerHTML = '<i class="material-icons">skip_next</i>';
            const slider = document.createElement("input"); slider.type = "range"; slider.min = 0; slider.max = Math.max(0, frameCount - 1); slider.value = 0;

            function setFrame(f){
                currentFrame = f;
                try{ trajComp.setFrame(f); }catch(e){}
                slider.value = f;
            }

            playPauseBtn.onclick = function(){
                const icon = playPauseBtn.querySelector("i");
                if(intervalId === null){
                    intervalId = setInterval(()=>{ currentFrame = (currentFrame + 1) % frameCount; setFrame(currentFrame); }, delay);
                    icon.textContent = "pause";
                } else {
                    clearInterval(intervalId);
                    intervalId = null;
                    icon.textContent = "play_arrow";
                }
            };
            prevBtn.onclick = ()=> { if(intervalId === null) setFrame((currentFrame - 1 + frameCount) % frameCount); };
            nextBtn.onclick = ()=> { if(intervalId === null) setFrame((currentFrame + 1) % frameCount); };
            slider.oninput = function(){
                if(intervalId !== null){ clearInterval(intervalId); intervalId = null; playPauseBtn.querySelector("i").textContent = "play_arrow"; }
                setFrame(parseInt(slider.value));
            };

            [prevBtn, playPauseBtn, nextBtn, slider].forEach(n => controlsDiv.appendChild(n));
            // place at bottom center
            container.appendChild(controlsDiv);
            controlsDiv.style.position = "absolute";
            controlsDiv.style.left = "50%";
            controlsDiv.style.bottom = "10px";
            controlsDiv.style.transform = "translateX(-50%)";
        }

        // view controls (top/side/toggles)
        const viewDiv = document.createElement("div");
        viewDiv.id = "view-controls";
        viewDiv.className = "controls-box";
        viewDiv.style.position = "absolute";
        viewDiv.style.top = "10px";
        viewDiv.style.right = "10px";

        const sideBtn = document.createElement("button"); sideBtn.innerHTML = '<i class="material-icons">visibility</i> Side View';
        const topBtn = document.createElement("button"); topBtn.innerHTML = '<i class="material-icons">visibility</i> Top View';
        const toggleCholBtn = document.createElement("button"); toggleCholBtn.textContent = "Toggle CHOL";
        const toggleBeadsBtn = document.createElement("button"); toggleBeadsBtn.textContent = "Toggle Protein Beads";

        sideBtn.onclick = function(){ if(stage && stateObj && stateObj.startOrientation) stage.viewerControls.orient(stateObj.startOrientation); };
        topBtn.onclick = function(){ if(stage && stateObj && stateObj.topOrientation) stage.viewerControls.orient(stateObj.topOrientation); };
        toggleCholBtn.onclick = function(){ try{ cholRep && cholRep.setVisibility && cholRep.setVisibility(!cholRep.getVisibility()); }catch(e){} };
        toggleBeadsBtn.onclick = function(){ try{ proteinBeadsRep && proteinBeadsRep.setVisibility && proteinBeadsRep.setVisibility(!proteinBeadsRep.getVisibility()); }catch(e){} };

        [sideBtn, topBtn, toggleCholBtn, toggleBeadsBtn].forEach(b => viewDiv.appendChild(b));
        container.appendChild(viewDiv);
    }

    // ---------- Load main replica viewer ----------
    function disposeCurrentStage(){
        if(currentStage){
            try{ currentStage.removeAllComponents(); }catch(e){}
            try{ currentStage.dispose(); }catch(e){}
        }
        // clear DOM
        if(viewerStageEl) viewerStageEl.innerHTML = "";
        currentStage = null;
        cholRep = null;
        proteinBeadsRep = null;
    }

    function loadReplica(replicaNumber){
        disposeCurrentStage();

        // stage attaches to the DOM node that has an id (use the viewerStageEl parent container)
        currentStage = new NGL.Stage("viewer-stage");
        currentStage.setParameters({ lightIntensity:0.5, ambientColor:0xFFFFFF, lightColor:0xFFFFFF, backgroundColor:"black" });

        // ensure sizes set
        updateViewerSizes();
        try{ currentStage.handleResize(); }catch(e){}

        const pdbUrl = replicas[replicaNumber].pdb;
        const xtcUrl = replicas[replicaNumber].xtc;

        currentStage.loadFile(pdbUrl).then(structComp => {
            // CHOL
            try{ cholRep = structComp.addRepresentation("spacefill", { sele: "CHOL", color: 0xE6BC3E, opacity: 0.3 }); }catch(e){}

            // colormaker + beads
            try{
                const schemeId = NGL.ColormakerRegistry.addScheme(function(params){
                    this.atomColor = function(atom){
                        if(atom.atomname === "BB") return 0xFFFFFF;
                        return 0xB006D6;
                    };
                });
                proteinBeadsRep = structComp.addRepresentation("licorice", {
                    sele: "not CHOL",
                    radius: 0.3,
                    multipleBond: true,
                    opacity: 0.7,
                    visible: false,
                    color: schemeId
                });
            }catch(e){}

            // ribbon
            try{
                structComp.addRepresentation("ribbon", {
                    sele: "not CHOL",
                    color: 0x5FB5E3,
                    quality: "high",
                    radiusType: "uniform",
                    radius: 0.3,
                    multipleBond: false,
                    flatShaded: true
                });
            }catch(e){}

            // rotation as used previously
            try{ structComp.setRotation([-Math.PI/2, 0, 0]); }catch(e){}

            // Wait one tick then autoView, capture orientations, load trajectory
            setTimeout(()=> {
                try{ currentStage.handleResize(); }catch(e){}
                try{ structComp.autoView(); }catch(e){}

                const startOrientation = currentStage.viewerControls.getOrientation().clone();
                const mat = new NGL.Matrix4(); mat.makeRotationX(-Math.PI/2);
                const topOrientation = startOrientation.clone(); topOrientation.multiply(mat);
                const stageState = { startOrientation: startOrientation, topOrientation: topOrientation };

                // Load trajectory if available
                NGL.autoLoad(xtcUrl).then(traj => {
                    const trajComp = structComp.addTrajectory(traj);
                    attachControls(currentStage, structComp, trajComp, viewerContainer, stageState);
                }).catch(err => {
                    // no traj -> still attach view controls
                    attachControls(currentStage, structComp, null, viewerContainer, stageState);
                });

            }, 0);

        }).catch(err => {
            console.error("Failed to load PDB:", pdbUrl, err);
            if(viewerStageEl) viewerStageEl.innerHTML = `<div style="color:#900;padding:10px">Failed to load ${pdbUrl}</div>`;
        });
    }

    // ---------- Aggregated viewer (second viewer) ----------
    function loadAggregatedViewer(){
        const stage = new NGL.Stage("agg-stage");
        window.aggStage = stage;
        stage.setParameters({ backgroundColor:"black", lightIntensity:0.5, ambientColor:0xFFFFFF, lightColor:0xFFFFFF });

        updateViewerSizes();
        try{ stage.handleResize(); }catch(e){}

        let licoriceRep = null;
        let surfaceRep = null;

        stage.loadFile(aaUrl).then(aaComp => {
            aaComp.addRepresentation("ribbon", { sele: "all", radius: 0.3, color: 0x5FB5E3, quality: "high" });

            stage.loadFile(hotspotsUrl).then(hotComp => {
                licoriceRep = hotComp.addRepresentation("licorice", { sele: "protein", radius: 0.3, color: 0x1A39FF });
                surfaceRep = hotComp.addRepresentation("surface", { sele: "chain D", color: 0xD783F2, surfaceType: "av", opacity: 0.5 });

                // apply rotations
                try{ aaComp.setRotation([-Math.PI/2, 0, 0]); }catch(e){}
                try{ hotComp.setRotation([-Math.PI/2, 0, 0]); }catch(e){}

                updateViewerSizes();
                try{ stage.handleResize(); }catch(e){}
                try{ stage.autoView(); }catch(e){}

                // canonical orients
                const startOrientation = stage.viewerControls.getOrientation().clone();
                const topOrientation = startOrientation.clone();
                const mat = new NGL.Matrix4(); mat.makeRotationX(-Math.PI/2); topOrientation.multiply(mat);

                // ensure start is side
                try{ stage.viewerControls.orient(startOrientation); }catch(e){}

                // attach view controls with toggles (licorice/surface)
                const existing = aggContainer.querySelectorAll("#view-controls");
                existing.forEach(el => el.remove());

                const viewDiv = document.createElement("div");
                viewDiv.id = "view-controls";
                viewDiv.className = "controls-box";
                viewDiv.style.position = "absolute";
                viewDiv.style.top = "10px";
                viewDiv.style.right = "10px";

                const sideBtn = document.createElement("button"); sideBtn.innerHTML = '<i class="material-icons">visibility</i> Side View';
                const topBtn = document.createElement("button"); topBtn.innerHTML = '<i class="material-icons">visibility</i> Top View';
                const toggleLicBtn = document.createElement("button"); toggleLicBtn.textContent = "Toggle Licorice";
                const toggleSurfBtn = document.createElement("button"); toggleSurfBtn.textContent = "Toggle Surface";

                sideBtn.onclick = () => stage.viewerControls.orient(startOrientation);
                topBtn.onclick = () => stage.viewerControls.orient(topOrientation);
                toggleLicBtn.onclick = () => { if(licoriceRep) licoriceRep.setVisibility(!licoriceRep.getVisibility()); };
                toggleSurfBtn.onclick = () => { if(surfaceRep) surfaceRep.setVisibility(!surfaceRep.getVisibility()); };

                [sideBtn, topBtn, toggleLicBtn, toggleSurfBtn].forEach(b => viewDiv.appendChild(b));
                aggContainer.appendChild(viewDiv);

                // after hotspots are loaded, load the pockets table
                loadPocketsTable();

            }).catch(err => {
                console.error("Failed to load hotspots:", hotspotsUrl, err);
                loadPocketsTable();
            });
        }).catch(err => {
            console.error("Failed to load AA PDB:", aaUrl, err);
            loadPocketsTable();
        });
    }

    // ---------- Pockets table (first 5 rows), columns: Pocket id, ResIDs, ResIDs_BW, Total Score ----------
    // Checkboxes are included but inert (no event listeners).
    function loadPocketsTable(){
        if(!pocketsContainer) return;
        pocketsContainer.innerHTML = "<p>Loading pockets table...</p>";

        fetch(`${nanoDir}/${pdb_id}_ranked_pockets.csv`).then(resp => {
            if(!resp.ok) throw new Error("CSV not found");
            return resp.text();
        }).then(text => {
            const lines = text.trim().split(/\r?\n/).filter(Boolean);
            if(lines.length <= 0){
                pocketsContainer.innerHTML = "<p>No pockets CSV content.</p>";
                return;
            }
            // header is first line
            const headerLine = lines.shift();
            const rows = lines.map(l => l.split(",").map(s => s.trim())).slice(0,5); // only first 5 rows
            
            // map pocket ids
            const pocketIds = rows
                .map(r => parseInt(r[0], 10))
                .filter(n => !isNaN(n));
            
            pendingPocketIds = pocketIds;
            
            // If nanoshaper viewer already exists, load immediately
            if(nsStage){
                loadPocketFilesIntoNanoshaper(pocketIds);
            }
            

            // build table
            const table = document.createElement("table");
            table.innerHTML = `<thead><tr>
                <th></th>
                <th>Pocket id</th>
                <th>ResIDs</th>
                <th>ResIDs_BW</th>
                <th>Total Score</th>
            </tr></thead><tbody></tbody>`;
            const tbody = table.querySelector("tbody");

            rows.forEach(r => {
                // CSV fields: Pocket id,ResIDs,ResIDs_BW,Contributing Points,Outlier Score,Total Score
                const pocketId = r[0] || "";
                const resids = r[1] || "";
                const resids_bw = r[2] || "";
                const totalScore = (r[5] !== undefined) ? r[5] : (r[r.length - 1] || "");

                const tr = document.createElement("tr");
                tr.innerHTML = `<td style="width:40px; text-align:center;"><input type="checkbox" data-pocket="${pocketId}"></td>
                                <td>${pocketId}</td>
                                <td>${resids}</td>
                                <td>${resids_bw}</td>
                                <td>${totalScore}</td>`;
                tbody.appendChild(tr);
            });

            pocketsContainer.innerHTML = "";
            pocketsContainer.appendChild(table);
            
            // Checkbox → pocket visibility
            pocketsContainer.querySelectorAll('input[data-pocket]')
            .forEach(cb => {
                cb.addEventListener("change", () => {
                    const pid = parseInt(cb.dataset.pocket,10);
                    const entry = pocketRegistry[pid];
                    if(!entry) return;
                    if(entry.pdbComp) entry.pdbComp.setVisibility(cb.checked);
                    if(entry.objComp) entry.objComp.setVisibility(cb.checked);
                });
            });

            // IMPORTANT: checkboxes are intentionally inert (no behavior attached).
            // We still keep them in the DOM so you can wire them later.
        }).catch(err => {
            console.error("Failed to fetch pockets CSV:", err);
            pocketsContainer.innerHTML = `<p style="color:#900">Could not load pockets CSV: ${nanoDir}/${pdb_id}_ranked_pockets.csv</p>`;
        });
    }

    // ---------- Nanoshaper viewer (third viewer) ----------
    // The ns-stage is rectangular and should fill the nanoshaper-viewer area.
    // It has Top View and Side View buttons styled the same as other viewers.
    function loadNanoshaperViewer(){
        if(!nsStageEl) return;

        nsStage = new NGL.Stage("ns-stage");
        nsStage.setParameters({ backgroundColor: "black", lightIntensity: 0.5, ambientColor: 0xFFFFFF, lightColor: 0xFFFFFF });

        // ensure nsStage resizes to container
        try{ nsStage.handleResize(); }catch(e){}

        nsStage.loadFile(nsPDB).then(comp => {
            // use ribbon representation (matching other viewers)
            try{ comp.addRepresentation("ribbon", { sele: "all", radius: 0.3, color: 0x5FB5E3, quality: "high" }); }catch(e){}
            try{ nsStage.autoView(); }catch(e){}

            // Determine the TRUE starting orientation:
            //  - we consider nsStage.viewerControls.getOrientation() as baseline (what autoView gave)
            //  - TRUE starting position is rotated X by -90 degrees relative to baseline (as requested).
            const baseline = nsStage.viewerControls.getOrientation().clone();
            const mat = new NGL.Matrix4(); mat.makeRotationX(-Math.PI/2);
            const sideOrientation = baseline.clone(); sideOrientation.multiply(mat);
            const topOrientation = sideOrientation.clone(); topOrientation.multiply(mat);

            // set initial to sideOrientation (TRUE starting position)
            try{ nsStage.viewerControls.orient(sideOrientation); }catch(e){}

            // add top/side buttons (styled identical)
            const existing = nsContainer.querySelectorAll("#ns-view-controls");
            existing.forEach(el => el.remove());

            const viewDiv = document.createElement("div");
            viewDiv.id = "ns-view-controls";
            viewDiv.className = "controls-box";
            viewDiv.style.position = "absolute";
            viewDiv.style.top = "10px";
            viewDiv.style.right = "10px";

            const sideBtn = document.createElement("button"); sideBtn.innerHTML = '<i class="material-icons">visibility</i> Side View';
            const topBtn = document.createElement("button"); topBtn.innerHTML = '<i class="material-icons">visibility</i> Top View';

            sideBtn.onclick = () => { try{ nsStage.viewerControls.orient(sideOrientation); }catch(e){} };
            topBtn.onclick = () => { try{ nsStage.viewerControls.orient(topOrientation); }catch(e){} };

            viewDiv.appendChild(sideBtn);
            viewDiv.appendChild(topBtn);
            nsContainer.appendChild(viewDiv);

            // Make the nsStage adapt its height to nsContainer (table + viewer share ranked-pockets tab).
            // We'll set nsStageEl height to fill nsContainer; nsContainer is flex: 1 so it expands.
            function resizeNS(){
                // nsStageEl already set to width:100% height:100% via CSS, but ensure NGL resizes
                try{ nsStage.handleResize(); }catch(e){}
            }
            window.addEventListener("resize", resizeNS);
            // initial call
            setTimeout(resizeNS, 50);

        }).catch(err => {
            console.error("Failed to load nanoshaper pdb:", nsPDB, err);
            nsStageEl.innerHTML = `<div style="color:#900; padding:10px">Failed to load ${nsPDB}</div>`;
        });
        
        // If pockets table already loaded, load pocket files now
        if(pendingPocketIds){
            loadPocketFilesIntoNanoshaper(pendingPocketIds);
        }
    }

    function loadPocketFilesIntoNanoshaper(pocketIds){
        if(!nsStage) return;

        pocketIds.forEach(pid => {
            if(pocketRegistry[pid]) return;

            const padded = pid.toString().padStart(3, "0");
            const pdbUrl = `${nanoDir}/${padded}.pdb`;
            const objUrl = `${nanoDir}/cav_tri${pid}.obj`;

            pocketRegistry[pid] = { pdbComp:null, objComp:null };

            nsStage.loadFile(pdbUrl).then(comp => {
                comp.addRepresentation("licorice", { opacity:1.0, radius: 0.3, color: "red" });
                comp.setVisibility(false);
                pocketRegistry[pid].pdbComp = comp;
            });

            nsStage.loadFile(objUrl).then(comp => {
                comp.addRepresentation("surface", { opacity:0.4, color: "blue", surfaceType: "av" });
                comp.setVisibility(false);
                pocketRegistry[pid].objComp = comp;
            });
        });
    }

    // ---------- set up replica tab buttons ----------
    document.querySelectorAll(".tab-button").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const rep = parseInt(btn.dataset.replica, 10);
            loadReplica(rep);
        });
    });

    // ---------- initial load ----------
    // wait a tick so layout settles, then compute sizes and load everything
    setTimeout(() => {
        updateViewerSizes();
        loadReplica(1);
        loadAggregatedViewer();
        loadPocketsTable();
        loadNanoshaperViewer();
    }, 0);

})();

