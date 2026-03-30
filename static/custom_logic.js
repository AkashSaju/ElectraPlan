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
        
        const drawPredictiveSnapFeedback = (e) => {
            if (window.selectedTemplate !== 'custom' || !this.activeTool || this.activeTool === 'delete') return;
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const snap = this.calculateSnap(mouseX, mouseY);
            
            if (window.drawPreview && window.pctx) {
                window.drawPreview(); // Clean canvas
                if (snap.snapped) {
                    // Draw Magnetic Vector Line
                    pctx.beginPath();
                    pctx.moveTo(mouseX, mouseY);
                    pctx.lineTo(snap.x, snap.y);
                    pctx.strokeStyle = "rgba(163, 230, 53, 0.9)"; // Success Neon
                    pctx.lineWidth = 2;
                    pctx.setLineDash([5, 5]);
                    pctx.stroke();
                    pctx.setLineDash([]);
                    
                    // Draw Glowing Drop Target
                    pctx.beginPath();
                    pctx.arc(snap.x, snap.y, 5, 0, Math.PI * 2);
                    pctx.fillStyle = "rgba(163, 230, 53, 0.3)";
                    pctx.fill();
                    pctx.strokeStyle = "#a3e635";
                    pctx.stroke();
                }
            }
        };

        // Hook predictive drawing into both simple mouse hover and active dragging!
        canvas.addEventListener('mousemove', drawPredictiveSnapFeedback);
        canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            drawPredictiveSnapFeedback(e);
        });

        canvas.addEventListener('dragleave', () => {
             if (window.drawPreview) window.drawPreview();
        });

        canvas.addEventListener('drop', (e) => {
            if (window.selectedTemplate !== 'custom') return;
            e.preventDefault();
            const type = e.dataTransfer.getData("text/plain");
            if (type) {
                this.activeTool = type;
                if (window.setActiveTool) window.setActiveTool(type);
            }
            if (this.activeTool) {
                this.handlePlacement(e.clientX, e.clientY);
            }
        });
    },

    /**
     * Predictive Mathematics extracted into pure function for 60Hz rendering
     */
    calculateSnap(x, y) {
        let finalX = x;
        let finalY = y;
        let targetFound = false;

        let targetRoom = null;
        const rooms = window.planObjects ? window.planObjects.filter(o => o.type === "room") : [];
        if (rooms.length > 0) {
            for (const room of rooms) {
                const bufferedRoom = { 
                    x1: Math.min(room.x1, room.x2) - 20, 
                    y1: Math.min(room.y1, room.y2) - 20, 
                    x2: Math.max(room.x1, room.x2) + 20, 
                    y2: Math.max(room.y1, room.y2) + 20 
                };
                if (window.pointInsideRoom && window.pointInsideRoom(x, y, bufferedRoom)) { 
                    targetRoom = room; break; 
                } else if (!window.pointInsideRoom && x >= bufferedRoom.x1 && x <= bufferedRoom.x2 && y >= bufferedRoom.y1 && y <= bufferedRoom.y2) { 
                    targetRoom = room; break; 
                }
            }
        }
        
        if (rooms.length > 0 && !targetRoom) return { x, y, snapped: false, targetRoom: null };

        if (this.activeTool && this.activeTool.includes('fan')) {
            if (targetRoom) {
                finalX = (targetRoom.x1 + targetRoom.x2) / 2;
                finalY = (targetRoom.y1 + targetRoom.y2) / 2;
                targetFound = true; // Fans aggressively snap to room center
            }
        } else {
            const walls = window.planObjects ? window.planObjects.filter(o => o.type === "wall") : [];
            if (typeof snapToNearestWall === 'function' && walls.length > 0) {
                const snapped = snapToNearestWall(x, y, walls, 14);
                finalX = snapped.x; 
                finalY = snapped.y;
                targetFound = true; // Sockets/Switches aggressively snap to walls
            }
        }
        return { x: finalX, y: finalY, snapped: targetFound, targetRoom };
    },

    handlePlacement(clientX, clientY) {
        const canvas = document.getElementById('previewCanvas');
        const rect = canvas.getBoundingClientRect();
        
        // Translate screen coordinates to canvas coordinates
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        // Handle Delete Tool
        if (this.activeTool === 'delete') {
            this.points = this.points.filter(p => Math.hypot(p.x - x, p.y - y) > 25);
            if (window.drawPreview) window.drawPreview();
            return;
        }

        // Apply Predictive Routing
        const snap = this.calculateSnap(x, y);

        if (!snap.snapped && window.planObjects && window.planObjects.some(o => o.type === "room")) {
            console.log("Placement rejected: outside room boundaries.");
            return;
        }

        // Cleanup exactly duplicating fans perfectly in the center
        if (this.activeTool && this.activeTool.includes('fan') && snap.targetRoom) {
             this.points = this.points.filter(p => !p.type.includes('fan') || !window.pointInsideRoom(p.x, p.y, snap.targetRoom));
        }

        // Clean up the label for the point
        let cleanLabel = this.activeTool.replace('elec_', '').replace('socket_', '').toUpperCase();
        
        // Add point
        this.points.push({
            id: Date.now(),
            type: this.activeTool,
            x: snap.x,
            y: snap.y,
            label: cleanLabel
        });

        // ✨ Trigger pop-in animation for the newly placed item only
        const newPoint = this.points[this.points.length - 1];
        if (typeof triggerPopIn === 'function') triggerPopIn([newPoint]);

        // Run the animation loop for just this single drop event
        function singlePopLoop() {
            if (window.drawPreview) window.drawPreview();
            if (typeof isAnimating === 'function' && isAnimating()) {
                requestAnimationFrame(singlePopLoop);
            }
        }
        singlePopLoop();
    },

    getPoints() {
        return this.points;
    }
};

window.handleDragStart = function(event, tool) {
    event.dataTransfer.setData("text/plain", tool);
};