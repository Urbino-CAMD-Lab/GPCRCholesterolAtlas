// static/js/aggregatedViewer.js
// Fully follows the replica viewer template: AA + hotspots

(function(){

    /* ------------------ UTIL ------------------ */
    function qs(name){
        return new URLSearchParams(window.location.search).get(name);
    }

    const pdb_id = qs("system") || qs("pdb");
    if(!pdb_id){
        console.warn("No system specified in URL query. Aggregated viewer disabled.");
        return;
    }

    const baseStatic = `/static/data/${pdb_id}`;
    const aaUrl = `${baseStatic}/${pdb_id}_aa.pdb`;
    const hotspotsUrl = `${baseStatic}/${pdb_id}_hot_spots.pdb`;

    /* ------------------ DOM ------------------ */
    const leftContainer    = document.getElementById("left-container");
    const aggCard          = document.getElementById("agg-card");
    const viewerStageEl    = document.getElementById("agg-stage");
    const viewerContainer  = document.getElementById("agg-viewer-container");

    /* ------------------ STATE ------------------ */
    let currentStage = null;
    let licoriceRep = null;
    let surfaceRep = null;

    /* ------------------ SIZING ------------------ */
    function updateViewerSizes(){
        const leftRect = leftContainer.getBoundingClientRect();
        const cardGap = 20;        // same as CSS gap
        const horizontalPadding = 16;

        const totalInnerHeight = leftRect.height;
        const availableForCards = totalInnerHeight - cardGap;

        // Each card gets half the available height
        const cardHeight = Math.floor(availableForCards / 2);

        const headerEl = aggCard.querySelector(".card-header");
        const headerH = headerEl ? headerEl.getBoundingClientRect().height : 28;

        const stageHeight = Math.max(120, cardHeight - headerH - 8);

        viewerStageEl.style.width  = "100%";
        viewerStageEl.style.height = stageHeight + "px";

        try{ if(currentStage) currentStage.handleResize(); }catch(e){}
    }

    window.addEventListener("resize", updateViewerSizes);

    /* ------------------ CONTROLS ------------------ */
    function attachControls(stage, licorice, surface, stateObj){
        viewerContainer.querySelectorAll("#view-controls").forEach(el => el.remove());

        const viewDiv = document.createElement("div");
        viewDiv.id = "view-controls";
        viewDiv.className = "controls-box";

        const sideBtn = document.createElement("button");
        sideBtn.innerHTML = '<i class="material-icons">visibility</i> Side View';

        const topBtn = document.createElement("button");
        topBtn.innerHTML = '<i class="material-icons">visibility</i> Top View';

        const toggleLicBtn = document.createElement("button");
        toggleLicBtn.textContent = "Toggle outlier residues";

        const toggleSurfBtn = document.createElement("button");
        toggleSurfBtn.textContent = "Toggle cholesterol SDF";

        sideBtn.onclick = () => stage.viewerControls.orient(stateObj.startOrientation);
        topBtn.onclick  = () => stage.viewerControls.orient(stateObj.topOrientation);
        toggleLicBtn.onclick  = () => { if(licorice) licorice.setVisibility(!licorice.getVisibility()); };
        toggleSurfBtn.onclick = () => { if(surface) surface.setVisibility(!surface.getVisibility()); };

        [sideBtn, topBtn, toggleLicBtn, toggleSurfBtn].forEach(b => viewDiv.appendChild(b));
        viewerContainer.appendChild(viewDiv);
    }

    /* ------------------ STAGE LIFECYCLE ------------------ */
    function disposeCurrentStage(){
        if(currentStage){
            try{ currentStage.removeAllComponents(); }catch(e){}
            try{ currentStage.dispose(); }catch(e){}
        }
        viewerStageEl.innerHTML = "";
        currentStage = null;
        licoriceRep = null;
        surfaceRep = null;
    }

    function loadAggregatedViewer(){
        disposeCurrentStage();

        currentStage = new NGL.Stage("agg-stage");
        currentStage.setParameters({
            backgroundColor: "black",
            lightIntensity: 0.5,
            ambientColor: 0xFFFFFF,
            lightColor: 0xFFFFFF
        });

        updateViewerSizes();

        currentStage.loadFile(aaUrl).then(aaComp => {
            aaComp.addRepresentation("ribbon", {
                sele: "all",
                color: 0x5FB5E3,
                radius: 0.3,
                quality: "high"
            });

            currentStage.loadFile(hotspotsUrl).then(hotComp => {

                licoriceRep = hotComp.addRepresentation("licorice", {
                    sele: "protein",
                    radius: 0.3,
                    color: 0xDE1D1D
                });

                surfaceRep = hotComp.addRepresentation("surface", {
                    sele: "chain D",
                    color: 0xFFFFFF,
                    surfaceType: "av",
                    opacity: 0.3
                });

                // Apply canonical rotation
                aaComp.setRotation([-Math.PI/2, 0, 0]);
                hotComp.setRotation([-Math.PI/2, 0, 0]);

                // AutoView
                aaComp.autoView();

                // Orientations
                const startOrientation = currentStage.viewerControls.getOrientation().clone();
                const mat = new NGL.Matrix4().makeRotationX(-Math.PI/2);
                const topOrientation = startOrientation.clone().multiply(mat);

                try{ currentStage.viewerControls.orient(startOrientation); }catch(e){}

                attachControls(currentStage, licoriceRep, surfaceRep, { startOrientation, topOrientation });

                updateViewerSizes();

            }).catch(err => console.error("Failed to load hotspots:", err));

        }).catch(err => console.error("Failed to load AA PDB:", err));
    }

    /* ------------------ INIT ------------------ */
    setTimeout(() => {
        updateViewerSizes();
        loadAggregatedViewer();
    }, 0);

})();



