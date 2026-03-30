const CustomModule = {
    activeTool: null,
    points: [],

    // 1. Initialize Custom Mode
    init(objects) {
        // Start by pre-populating with cost-effective logic so the user has a starting point
        if (typeof generateElectrical === 'function') {
            this.points = generateElectrical(objects, 'cost');
        } else {
            console.warn("generateElectrical is not found, cannot prepopulate points");
            this.points = [];
        }
        
        this.setupEventListeners();
        if (window.drawPreview) window.drawPreview();
    },

    setTool(tool) {
        this.activeTool = tool;
    },

    setupEventListeners() {
        const canvas = document.getElementById('previewCanvas');
        if (!canvas) return;
        
        // Ensure we don't attach multiple listeners if re-initialized
        if (this._listenersBound) return;
        this._listenersBound = true;

        // Handle Clicks
        canvas.addEventListener('click', (e) => {
            if (window.selectedTemplate !== 'custom' || !this.activeTool) return;
            this.handlePlacement(e.clientX, e.clientY);
        });

        // Handle Drops
        canvas.addEventListener('dragenter', (e) => e.preventDefault());
        canvas.addEventListener('dragover', (e) => e.preventDefault());
        canvas.addEventListener('drop', (e) => {
            if (window.selectedTemplate !== 'custom') return;
            e.preventDefault();
            const type = e.dataTransfer.getData("text/plain");
            if (type) {
                this.activeTool = type;
                if (window.setActiveTool) { // visual UI update
                    window.setActiveTool(type);
                }
            }
            if (this.activeTool) {
                this.handlePlacement(e.clientX, e.clientY);
            }
        });
    },

    handlePlacement(clientX, clientY) {
        const canvas = document.getElementById('previewCanvas');
        const rect = canvas.getBoundingClientRect();
        
        // Translate screen coordinates to canvas coordinates
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        // Handle Delete Tool
        if (this.activeTool === 'delete') {
            // Remove any object from the points[] array that is within a 25px radius
            this.points = this.points.filter(p => Math.hypot(p.x - x, p.y - y) > 25);
            if (window.drawPreview) window.drawPreview();
            return;
        }

        // Boundary Validation
        // Only allow placement if the click is within a room boundary (include a 20px "grace" buffer)
        let targetRoom = null;
        const rooms = window.planObjects ? window.planObjects.filter(o => o.type === "room") : [];
        if (rooms.length > 0) {
            for (const room of rooms) {
                // creating a virtual buffered room
                const bufferedRoom = {
                    x1: Math.min(room.x1, room.x2) - 20,
                    y1: Math.min(room.y1, room.y2) - 20,
                    x2: Math.max(room.x1, room.x2) + 20,
                    y2: Math.max(room.y1, room.y2) + 20
                };
                if (typeof pointInsideRoom === 'function') {
                    if (pointInsideRoom(x, y, bufferedRoom)) {
                        targetRoom = room;
                        break;
                    }
                } else {
                    // Fallback normal bound checking
                    if (x >= bufferedRoom.x1 && x <= bufferedRoom.x2 && y >= bufferedRoom.y1 && y <= bufferedRoom.y2) {
                        targetRoom = room;
                        break;
                    }
                }
            }
        } 

        if (rooms.length > 0 && !targetRoom) {
            console.log("Placement rejected: outside room boundaries.");
            return;
        }

        // Handle Place with Snapping
        let finalX = x;
        let finalY = y;
        const walls = window.planObjects ? window.planObjects.filter(o => o.type === "wall") : [];

        // The "Snap" Constraint
        if (this.activeTool && this.activeTool.includes('fan')) {
            // Place exactly at center of room
            if (targetRoom) {
                finalX = (targetRoom.x1 + targetRoom.x2) / 2;
                finalY = (targetRoom.y1 + targetRoom.y2) / 2;
                
                // Prevent duplicate fans in the same room by removing any existing fan inside this room perfectly
                this.points = this.points.filter(p => !p.type.includes('fan') || !window.pointInsideRoom(p.x, p.y, targetRoom));
            } else {
                finalX = x;
                finalY = y;
            }
        } else {
            if (typeof snapToNearestWall === 'function' && walls.length > 0) {
                // "stick" the appliance to the nearest wall with a 14px inward offset
                const snapped = snapToNearestWall(x, y, walls, 14);
                finalX = snapped.x; finalY = snapped.y;
            }
        }

        // Clean up the label for the point
        let cleanLabel = this.activeTool.replace('elec_', '').replace('socket_', '').toUpperCase();
        
        // Add point
        this.points.push({
            id: Date.now(),
            type: this.activeTool,
            x: finalX,
            y: finalY,
            label: cleanLabel
        });

        // Refresh canvas
        if (window.drawPreview) window.drawPreview();
    },

    getPoints() {
        return this.points;
    }
};

window.handleDragStart = function(event, tool) {
    event.dataTransfer.setData("text/plain", tool);
};