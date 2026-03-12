const CustomModule = {
    activeTool: null,
    points: [],

    // 1. Initialize Custom Mode
    init(objects) {
        // Start by creating a basic layout automatically
        this.points = this.generateDefaultLayout(objects);
        this.setupEventListeners();
        if (window.drawPreview) window.drawPreview();
    },

    // 2. Generate a "Starter" layout for the user
    generateDefaultLayout(objects) {
        const topology = buildRoomTopology(objects);
        const starterPoints = [];
        
        topology.forEach(t => {
            const center = { x: (t.room.x1 + t.room.x2) / 2, y: (t.room.y1 + t.room.y2) / 2 };
            // Add a Fan and a Light so the room isn't empty
            starterPoints.push({ id: Math.random(), type: 'elec_fan', x: center.x, y: center.y, label: 'FAN' });
            
            if (t.longestWall) {
                const mid = { x: (t.longestWall.x1 + t.longestWall.x2)/2, y: (t.longestWall.y1 + t.longestWall.y2)/2 };
                starterPoints.push({ id: Math.random(), type: 'elec_light', x: mid.x, y: mid.y, label: 'LIGHT' });
            }
        });
        return starterPoints;
    },

    setTool(tool) {
        this.activeTool = tool;
    },

    setupEventListeners() {
        const canvas = document.getElementById('previewCanvas');
        
        // Handle Clicks
        canvas.onclick = (e) => {
            if (window.selectedTemplate !== 'custom' || !this.activeTool) return;
            this.processInput(e.clientX, e.clientY);
        };

        // Handle Drops
        canvas.addEventListener('dragover', (e) => e.preventDefault());
        canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            const type = e.dataTransfer.getData("text/plain");
            if (type) this.activeTool = type;
            this.processInput(e.clientX, e.clientY);
        });
    },

    processInput(clientX, clientY) {
        const canvas = document.getElementById('previewCanvas');
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        // Handle Delete
        if (this.activeTool === 'delete') {
            this.points = this.points.filter(p => Math.hypot(p.x - x, p.y - y) > 25);
        } else {
            // Handle Place with Wall Snapping
            const walls = planObjects.filter(o => o.type === "wall");
            let finalX = x;
            let finalY = y;

            if (!this.activeTool.includes('fan')) {
                const snapped = snapToNearestWall(x, y, walls, 15);
                finalX = snapped.x;
                finalY = snapped.y;
            }

            const cleanLabel = this.activeTool.replace('elec_', '').replace('socket_', '').toUpperCase();
            this.points.push({
                id: Date.now() + Math.random(),
                type: this.activeTool,
                x: finalX,
                y: finalY,
                label: cleanLabel
            });
        }
        if (window.drawPreview) window.drawPreview();
    },

    getPoints() {
        return this.points;
    }
};