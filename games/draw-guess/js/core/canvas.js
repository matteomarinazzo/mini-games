export class DrawingCanvas {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.currentPath = [];
        this.fullHistory = [];
        this.onPathComplete = options.onPathComplete || (() => { });
        this._readOnly = options.readOnly || false;

        this.brushColor = '#000000';
        this.brushSize = 5;

        this._boundStart = (e) => this._startDrawing(e);
        this._boundMove = (e) => this._draw(e);
        this._boundStop = () => this._stopDrawing();
        this._boundTouchStart = (e) => this._handleTouch(e, 'start');
        this._boundTouchMove = (e) => this._handleTouch(e, 'move');

        this._initResize();
        this.setReadOnly(this._readOnly);
    }

    // ─── readOnly getter/setter (dynamic) ───────────────────────
    get readOnly() { return this._readOnly; }

    set readOnly(val) { this.setReadOnly(val); }

    setReadOnly(val) {
        this._readOnly = val;
        const c = this.canvas;
        // Remove all first
        c.removeEventListener('mousedown', this._boundStart);
        c.removeEventListener('mousemove', this._boundMove);
        c.removeEventListener('mouseup', this._boundStop);
        c.removeEventListener('mouseleave', this._boundStop);
        c.removeEventListener('touchstart', this._boundTouchStart);
        c.removeEventListener('touchmove', this._boundTouchMove);
        c.removeEventListener('touchend', this._boundStop);

        this.updateCursor();

        if (!val) {
            c.addEventListener('mousedown', this._boundStart);
            c.addEventListener('mousemove', this._boundMove);
            c.addEventListener('mouseup', this._boundStop);
            c.addEventListener('mouseleave', this._boundStop);
            c.addEventListener('touchstart', this._boundTouchStart, { passive: false });
            c.addEventListener('touchmove', this._boundTouchMove, { passive: false });
            c.addEventListener('touchend', this._boundStop);
        }
    }

    // ─── Resize ─────────────────────────────────────────────────
    _initResize() {
        this._resize();
        window.addEventListener('resize', () => {
            this._resize();
            this.redraw(this.fullHistory);
        });
    }

    _resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = Math.floor(rect.width);
        this.canvas.height = Math.floor(rect.height);
    }

    // ─── Touch ──────────────────────────────────────────────────
    _handleTouch(e, phase) {
        if (e.touches.length > 1) {
            // Allow native 2-finger scrolling (pan) by un-preventing default
            return;
        }
        e.preventDefault();
        const touch = e.touches[0];
        if (!touch) return;
        const synthetic = new MouseEvent(phase === 'start' ? 'mousedown' : 'mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            bubbles: true
        });
        if (phase === 'start') this._startDrawing(synthetic);
        else this._draw(synthetic);
    }

    // ─── Drawing ────────────────────────────────────────────────
    _startDrawing(e) {
        if (this._readOnly) return;
        this.isDrawing = true;
        const { x, y } = this._getCoords(e);
        this.currentPath = [{ x, y, color: this.brushColor, size: this.brushSize }];
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
    }

    _draw(e) {
        if (!this.isDrawing || this._readOnly) return;
        const { x, y } = this._getCoords(e);
        this.ctx.lineTo(x, y);
        this.ctx.strokeStyle = this.brushColor;
        this.ctx.lineWidth = this.brushSize;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
        this.currentPath.push({ x, y });
    }

    _stopDrawing() {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        if (this.currentPath.length > 1) {
            this.fullHistory.push(this.currentPath);
            this.onPathComplete(this.currentPath);
        }
        this.currentPath = [];
    }

    _getCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    // ─── Public API ─────────────────────────────────────────────
    setBrush(color, size) {
        if (color !== undefined) this.brushColor = color;
        if (size !== undefined) this.brushSize = size;
        this.updateCursor();
    }

    updateCursor() {
        if (this._readOnly) {
            this.canvas.style.cursor = 'default';
            return;
        }
        const color = this.brushColor;
        const size = this.brushSize;

        const svgSize = size + 4;
        const stroke = (color === '#ffffff' || color === '#FFFFFF') ? 'stroke="black" stroke-width="1"' : '';

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}"><circle cx="${svgSize / 2}" cy="${svgSize / 2}" r="${size / 2}" fill="${color}" ${stroke}/></svg>`;
        const encodedSvg = encodeURIComponent(svg);
        this.canvas.style.cursor = `url('data:image/svg+xml,${encodedSvg}') ${Math.floor(svgSize / 2)} ${Math.floor(svgSize / 2)}, crosshair`;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.fullHistory = [];
    }

    drawPath(path) {
        if (!path || path.length < 2) return;
        const start = path[0];
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.strokeStyle = start.color || '#000000';
        this.ctx.lineWidth = start.size || 5;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        for (let i = 1; i < path.length; i++) {
            this.ctx.lineTo(path[i].x, path[i].y);
        }
        this.ctx.stroke();
    }

    redraw(history = []) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.fullHistory = history;
        history.forEach(path => this.drawPath(path));
    }

    getHistory() {
        return this.fullHistory;
    }
}