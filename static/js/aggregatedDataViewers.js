(function() {

    const structureFile = "data/aggregated/generic_gpcr.pdb";

    function createViewer(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return null;

        // Create NGL stage
        const stage = new NGL.Stage(container, { backgroundColor: "black" });

        // Load structure
        stage.loadFile(structureFile, { defaultRepresentation: true })
            .then(comp => {
                comp.addRepresentation("surface", {opacity:1,color:"silver",surfaceType:"av"});
                comp.autoView();
            })
            .catch(err => console.error("Failed to load structure:", err));

        // Resize observer to ensure stage fits container without overflowing
        const resizeObserver = new ResizeObserver(() => {
            stage.handleResize();
        });
        resizeObserver.observe(container);

        return stage;
    }

    // Initialize top and bottom viewers independently
    window.topViewer = createViewer("agg-stage-top");
    window.bottomViewer = createViewer("agg-stage-bottom");

})();


