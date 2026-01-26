// static/js/replicaViewer.js


(function(){

    /* ------------------ UTIL ------------------ */
    function qs(name){
        return new URLSearchParams(window.location.search).get(name);
    }

    const pdb_id = qs("system") || qs("pdb");
    if(!pdb_id){
        console.warn("No system specified in URL query. Replica viewer disabled.");
        return;
    }

    const baseStatic = `/static/data/${pdb_id}`;
    const replicas = {
        1: { pdb: `${baseStatic}/${pdb_id}_rep_1.pdb`, xtc: `${baseStatic}/${pdb_id}_rep_1.xtc` },
        2: { pdb: `${baseStatic}/${pdb_id}_rep_2.pdb`, xtc: `${baseStatic}/${pdb_id}_rep_2.xtc` }
    };

    /* ------------------ DOM ------------------ */
    const viewerStageEl   = document.getElementById("viewer-stage");
    const viewerContainer = document.getElementById("viewer-container");

    /* ------------------ STATE ------------------ */
    let currentStage = null;
    let cholRep = null;
    let proteinBeadsRep = null;

    /* ------------------ SIZING ------------------ */
    function updateViewerSizes(){

        if(viewerStageEl){
            viewerStageEl.style.width  = "100%";
            viewerStageEl.style.height = "100%";
        }

        try{
            if(currentStage) currentStage.handleResize();
        }catch(e){}
    }

    window.addEventListener("resize", updateViewerSizes);

    /* ------------------ CONTROLS ------------------ */
    function attachControls(stage, structComp, trajComp, container, stateObj){

        container.querySelectorAll("#traj-controls, #view-controls")
            .forEach(el => el.remove());

        /* ---- trajectory controls ---- */
        if(trajComp){
            const frameCount = trajComp.trajectory.frameCount || 1;
            let currentFrame = 0;
            let intervalId = null;
            const fps = 20;
            const delay = 1000 / fps;

            const controlsDiv = document.createElement("div");
            controlsDiv.id = "traj-controls";
            controlsDiv.className = "controls-box";

            const prevBtn = document.createElement("button");
            prevBtn.innerHTML = '<i class="material-icons">skip_previous</i>';

            const playPauseBtn = document.createElement("button");
            playPauseBtn.innerHTML = '<i class="material-icons">play_arrow</i>';

            const nextBtn = document.createElement("button");
            nextBtn.innerHTML = '<i class="material-icons">skip_next</i>';

            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = 0;
            slider.max = frameCount - 1;
            slider.value = 0;

            function setFrame(f){
                currentFrame = f;
                trajComp.setFrame(f);
                slider.value = f;
            }

            playPauseBtn.onclick = () => {
                const icon = playPauseBtn.querySelector("i");
                if(intervalId === null){
                    intervalId = setInterval(() => {
                        setFrame((currentFrame + 1) % frameCount);
                    }, delay);
                    icon.textContent = "pause";
                } else {
                    clearInterval(intervalId);
                    intervalId = null;
                    icon.textContent = "play_arrow";
                }
            };

            prevBtn.onclick = () =>
                intervalId === null && setFrame((currentFrame - 1 + frameCount) % frameCount);

            nextBtn.onclick = () =>
                intervalId === null && setFrame((currentFrame + 1) % frameCount);

            slider.oninput = () => {
                if(intervalId){
                    clearInterval(intervalId);
                    intervalId = null;
                    playPauseBtn.querySelector("i").textContent = "play_arrow";
                }
                setFrame(parseInt(slider.value, 10));
            };

            [prevBtn, playPauseBtn, nextBtn, slider].forEach(el => controlsDiv.appendChild(el));
            container.appendChild(controlsDiv);
        }

        /* ---- view controls ---- */
        const viewDiv = document.createElement("div");
        viewDiv.id = "view-controls";
        viewDiv.className = "controls-box";

        const sideBtn = document.createElement("button");
        sideBtn.innerHTML = '<i class="material-icons">visibility</i> Side View';

        const topBtn = document.createElement("button");
        topBtn.innerHTML = '<i class="material-icons">visibility</i> Top View';

        const toggleCholBtn = document.createElement("button");
        toggleCholBtn.textContent = "Toggle CHOL";

        const toggleBeadsBtn = document.createElement("button");
        toggleBeadsBtn.textContent = "Toggle Martini 3 atoms";

        sideBtn.onclick = () => stage.viewerControls.orient(stateObj.startOrientation);
        topBtn.onclick  = () => stage.viewerControls.orient(stateObj.topOrientation);
        toggleCholBtn.onclick  = () => cholRep.setVisibility(!cholRep.getVisibility());
        toggleBeadsBtn.onclick = () => proteinBeadsRep.setVisibility(!proteinBeadsRep.getVisibility());

        [sideBtn, topBtn, toggleCholBtn, toggleBeadsBtn].forEach(b => viewDiv.appendChild(b));
        container.appendChild(viewDiv);
    }

    /* ------------------ STAGE LIFECYCLE ------------------ */
    function disposeCurrentStage(){
        if(currentStage){
            try{ currentStage.removeAllComponents(); }catch(e){}
            try{ currentStage.dispose(); }catch(e){}
        }
        viewerStageEl.innerHTML = "";
        currentStage = null;
        cholRep = null;
        proteinBeadsRep = null;
    }

    function loadReplica(replicaNumber){

        disposeCurrentStage();

        currentStage = new NGL.Stage("viewer-stage");
        currentStage.setParameters({
            backgroundColor: "black",
            lightIntensity: 0.5,
            ambientColor: 0xFFFFFF,
            lightColor: 0xFFFFFF
        });

        updateViewerSizes();

        const { pdb, xtc } = replicas[replicaNumber];

        currentStage.loadFile(pdb).then(structComp => {

            cholRep = structComp.addRepresentation("spacefill", {
                sele: "CHOL",
                color: 0xE6BC3E,
                opacity: 0.3
            });

            const schemeId = NGL.ColormakerRegistry.addScheme(function(){
                this.atomColor = atom =>
                    atom.atomname === "BB" ? 0xFFFFFF : 0xB006D6;
            });

            proteinBeadsRep = structComp.addRepresentation("licorice", {
                sele: "not CHOL",
                radius: 0.3,
                opacity: 0.7,
                visible: false,
                color: schemeId
            });

            structComp.addRepresentation("ribbon", {
                sele: "not CHOL",
                color: 0x5FB5E3,
                radius: 0.3,
                flatShaded: true
            });

            structComp.setRotation([-Math.PI/2, 0, 0]);

            setTimeout(() => {

                structComp.autoView();

                const startOrientation = currentStage.viewerControls.getOrientation().clone();
                const mat = new NGL.Matrix4().makeRotationX(-Math.PI/2);
                const topOrientation = startOrientation.clone().multiply(mat);

                const stageState = { startOrientation, topOrientation };

                NGL.autoLoad(xtc).then(traj => {
                    const trajComp = structComp.addTrajectory(traj);
                    attachControls(currentStage, structComp, trajComp, viewerContainer, stageState);
                }).catch(() => {
                    attachControls(currentStage, structComp, null, viewerContainer, stageState);
                });

            }, 0);

        });
    }

    /* ------------------ TAB HANDLERS ------------------ */
    document.querySelectorAll(".tab-button").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            loadReplica(parseInt(btn.dataset.replica, 10));
        });
    });

    /* ------------------ INIT ------------------ */
    setTimeout(() => {
        updateViewerSizes();
        loadReplica(1);
    }, 0);

})();

