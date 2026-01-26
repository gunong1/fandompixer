const canvas = document.getElementById('pixelCanvas');
const ctx = canvas.getContext('2d');
// Side Panel Elements
const sidePanel = document.getElementById('side-panel');
const areaIdText = document.getElementById('area-id');
const pixelInfo = document.getElementById('pixel-info');
const statusTag = document.getElementById('status-tag');
const selectedPixelCountDiv = document.getElementById('selected-pixel-count'); // New: Element for displaying selected pixel count
console.log('selectedPixelCountDiv element:', selectedPixelCountDiv); // DEBUG
const ownerNickname = document.getElementById('owner-nickname');
const idolGroup = document.getElementById('idol-group');
const purchaseForm = document.getElementById('purchase-form');
const nicknameInput = document.getElementById('nickname-input');
const idolSelect = document.getElementById('idol-select');
const subscribeButton = document.getElementById('subscribe-button');




const socket = io();

const WORLD_SIZE = 63240;
const GRID_SIZE = 20;
const MAX_GRID_START_COORD = Math.floor((WORLD_SIZE - 1) / GRID_SIZE) * GRID_SIZE;
const EPSILON = 0.001; // Small margin for floating point comparisons
let scale = 0.2;
let offsetX = window.innerWidth / 2 - (WORLD_SIZE * scale) / 2;
let offsetY = window.innerHeight / 2 - (WORLD_SIZE * scale) / 2;

let pixels = [];
let selectedPixels = []; // Array for multiple selected pixels
let isDraggingCanvas = false; // Flag for panning the canvas
let isSelectingPixels = false; // Flag for dragging to select pixels
let selectionStartX = 0;
let selectionStartY = 0;
let selectionEndX = 0;
let selectionEndY = 0;

// --- Idol Group Info ---
const idolInfo = {
    'BTS': { color: 'rgba(123, 63, 242, 0.7)', initials: 'BTS' },
    'Blackpink': { color: 'rgba(255, 105, 180, 0.7)', initials: 'BP' },
    'TWICE': { color: 'rgba(255, 209, 0, 0.7)', initials: 'TW' },
    'NewJeans': { color: 'rgba(50, 205, 50, 0.7)', initials: 'NJ' }
};

function draw() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Background
    ctx.fillStyle = '#0a0f19';
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    // Apply a clipping path to ensure all subsequent drawings are within WORLD_SIZE
    ctx.beginPath();
    ctx.rect(0, 0, WORLD_SIZE, WORLD_SIZE);
    ctx.clip(); // This will restrict all subsequent drawing operations to this rectangle

    // Grid (only when zoomed in)
    if (scale > 1.5) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
        for (let i = 0; i <= WORLD_SIZE; i += GRID_SIZE) {
            ctx.moveTo(i, 0); ctx.lineTo(i, WORLD_SIZE);
            ctx.moveTo(0, i); ctx.lineTo(WORLD_SIZE, i);
        }
        ctx.stroke();
    }

    // Draw all owned pixels
    pixels.forEach(pixel => {
        const groupInfo = idolInfo[pixel.idol_group_name] || { color: pixel.color, initials: '?' };
        ctx.fillStyle = groupInfo.color;
        ctx.fillRect(pixel.x, pixel.y, GRID_SIZE, GRID_SIZE);
        
        // Draw initials if zoomed in enough
        if (scale > 3) {
            ctx.fillStyle = 'white';
            ctx.font = `bold ${GRID_SIZE / 2}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(groupInfo.initials, pixel.x + GRID_SIZE / 2, pixel.y + GRID_SIZE / 2);
        }
    });

    // Draw selection rectangle if currently selecting
    if (isSelectingPixels && (selectionStartX !== selectionEndX || selectionStartY !== selectionEndY)) {
        ctx.strokeStyle = 'lime';
        ctx.lineWidth = 2 / scale;

        const startX = Math.min(selectionStartX, selectionEndX);
        const startY = Math.min(selectionStartY, selectionEndY);
        
        // Calculate the raw width and height of the selection area based on pixel grid.
        // selectionEndX/Y are the top-left corners of the grid cells.
        // So, to get the full extent, we add GRID_SIZE to the larger coordinate.
        const rawEndX = Math.max(selectionStartX, selectionEndX) + GRID_SIZE;
        const rawEndY = Math.max(selectionStartY, selectionEndY) + GRID_SIZE;

        // Clamp the raw end coordinates to WORLD_SIZE
        const clampedEndX = Math.min(WORLD_SIZE, rawEndX);
        const clampedEndY = Math.min(WORLD_SIZE, rawEndY);

        const width = clampedEndX - startX;
        const height = clampedEndY - startY;

        // Adjust for stroke width to keep it entirely within the bounds
        const halfStroke = ctx.lineWidth / 2;

        const drawX = startX + halfStroke;
        const drawY = startY + halfStroke;
        const drawWidthAdjusted = width - ctx.lineWidth;
        const drawHeightAdjusted = height - ctx.lineWidth;

        // Only draw if the adjusted dimensions are positive
        if (drawWidthAdjusted > 0 && drawHeightAdjusted > 0) {
            ctx.strokeRect(drawX, drawY, drawWidthAdjusted, drawHeightAdjusted);
            ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
            ctx.fillRect(drawX, drawY, drawWidthAdjusted, drawHeightAdjusted);
        }
    }
    // Draw visual indicator for selected pixels (after selection is finalized)
    if (selectedPixels.length > 0) {
        // Calculate bounding box for all selected pixels
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        selectedPixels.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + GRID_SIZE);
            maxY = Math.max(maxY, p.y + GRID_SIZE);
        });

        // Draw the bounding box
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 2; // Fixed to 2 for consistent visibility
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.1)'; // Translucent yellow fill
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    }

    ctx.restore();
    updateMinimap();
}

// --- Data Fetching and Socket Events ---

fetch('/api/pixels')
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    })
    .then(initialPixels => {
        pixels = initialPixels;
        draw();
    })
    .catch(e => console.error('Error fetching initial pixels:', e));

socket.on('pixel_update', (pixel) => {
    const index = pixels.findIndex(p => p.x === pixel.x && p.y === pixel.y);
    if (index > -1) {
        pixels[index] = pixel;
    } else {
        pixels.push(pixel);
    }
    draw();
});


// --- User Interactions (Dragging and Selecting) ---

let lastMouseX, lastMouseY;

canvas.onmousedown = (e) => {
    const canvasRect = canvas.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    const relativeX = Math.max(0, Math.min(clientX - canvasRect.left, canvas.width));
    const relativeY = Math.max(0, Math.min(clientY - canvasRect.top, canvas.height));

    let worldX = (relativeX - offsetX) / scale;
    let worldY = (relativeY - offsetY) / scale;

    worldX = Math.max(0, Math.min(worldX, WORLD_SIZE));
    worldY = Math.max(0, Math.min(worldY, WORLD_SIZE));
    
    // Apply Math.floor to snap to integer world coordinate as per Request 3
    worldX = Math.floor(worldX);
    worldY = Math.floor(worldY);

    // If Ctrl key is pressed, start panning the canvas
    if (e.ctrlKey) {
        isDraggingCanvas = true;
        isSelectingPixels = false; // Ensure selection mode is off
    } else { // Normal left-click, start selection drag
        isSelectingPixels = true;
        isDraggingCanvas = false; // Ensure dragging mode is off
        selectionStartX = Math.floor(worldX / GRID_SIZE) * GRID_SIZE;
        selectionStartY = Math.floor(worldY / GRID_SIZE) * GRID_SIZE;

        // ?대옩?? 罹붾쾭??寃쎄퀎瑜?踰쀬뼱?섏? ?딅룄濡?(0 ?댁긽, MAX_GRID_START_COORD濡?
        selectionStartX = Math.max(0, Math.min(selectionStartX, MAX_GRID_START_COORD));
        selectionStartY = Math.max(0, Math.min(selectionStartY, MAX_GRID_START_COORD));

        // Add clamping (This is redundant after the above line, but keeping for consistency if original code had a duplicate reason)
        selectionStartX = Math.max(0, Math.min(selectionStartX, MAX_GRID_START_COORD));
        selectionStartY = Math.max(0, Math.min(selectionStartY, MAX_GRID_START_COORD));
        selectionEndX = selectionStartX; // Initialize end with start
        selectionEndY = selectionStartY;
        selectedPixels = []; // Clear previous selection
        sidePanel.style.display = 'none'; // Hide panel during selection
    }
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
};

window.onmousemove = (e) => {
    if (isDraggingCanvas) {
        offsetX += e.clientX - lastMouseX;
        offsetY += e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        draw();
    } else if (isSelectingPixels) {
        const canvasRect = canvas.getBoundingClientRect();
        const clientX = e.clientX;
        const clientY = e.clientY;

        const relativeX = Math.max(0, Math.min(clientX - canvasRect.left, canvas.width));
        const relativeY = Math.max(0, Math.min(clientY - canvasRect.top, canvas.height));

        let worldX = (relativeX - offsetX) / scale;
        let worldY = (relativeY - offsetY) / scale;

        worldX = Math.max(0, Math.min(worldX, WORLD_SIZE));
        worldY = Math.max(0, Math.min(worldY, WORLD_SIZE));

        // Apply Math.floor to snap to integer world coordinate as per Request 3
        worldX = Math.floor(worldX);
        worldY = Math.floor(worldY);
        
        selectionEndX = Math.floor(worldX / GRID_SIZE) * GRID_SIZE;
        selectionEndY = Math.floor(worldY / GRID_SIZE) * GRID_SIZE;

        // ?대옩?? 罹붾쾭??寃쎄퀎瑜?踰쀬뼱?섏? ?딅룄濡?
        selectionEndX = Math.max(0, Math.min(selectionEndX, MAX_GRID_START_COORD));
        selectionEndY = Math.max(0, Math.min(selectionEndY, MAX_GRID_START_COORD));
        draw();
    }
};

window.onmouseup = (e) => {

    if (isDraggingCanvas) { // Finished dragging
        isDraggingCanvas = false;
        // After drag, if no selection happened, hide panel
        if (selectedPixels.length === 0) {
            sidePanel.style.display = 'none';
        }
        return; // Don't proceed to click/selection logic if it was a pan drag
    }

    // Ignore clicks inside the side panel to allow interaction with form elements
    if (sidePanel.contains(e.target)) {
        return;
    }

    if (isSelectingPixels) { // Finished selecting
        isSelectingPixels = false;
        
        
        const canvasRect = canvas.getBoundingClientRect();
        const clientX = e.clientX;
        const clientY = e.clientY;

        const relativeX = Math.max(0, Math.min(clientX - canvasRect.left, canvas.width));
        const relativeY = Math.max(0, Math.min(clientY - canvasRect.top, canvas.height));

        let currentMouseWorldX = (relativeX - offsetX) / scale;
        let currentMouseWorldY = (relativeY - offsetY) / scale;

        currentMouseWorldX = Math.max(0, Math.min(currentMouseWorldX, WORLD_SIZE));
        currentMouseWorldY = Math.max(0, Math.min(currentMouseWorldY, WORLD_SIZE));

        // Apply Math.floor to snap to integer world coordinate
        currentMouseWorldX = Math.floor(currentMouseWorldX);
        currentMouseWorldY = Math.floor(currentMouseWorldY);

        // Calculate the GRID_SIZE-aligned start coordinate of the pixel where the mouse was released
        let mouseUpPixelStartX = Math.floor(currentMouseWorldX / GRID_SIZE) * GRID_SIZE;
        let mouseUpPixelStartY = Math.floor(currentMouseWorldY / GRID_SIZE) * GRID_SIZE;

        // ?대옩?? 罹붾쾭??寃쎄퀎瑜?踰쀬뼱?섏? ?딅룄濡?(0 ?댁긽, MAX_GRID_START_COORD濡?
        mouseUpPixelStartX = Math.max(0, Math.min(mouseUpPixelStartX, MAX_GRID_START_COORD));
        mouseUpPixelStartY = Math.max(0, Math.min(mouseUpPixelStartY, MAX_GRID_START_COORD));

        // Determine the overall start (min) and end (max) pixel start coordinates of the selection rectangle
        const normalizedStartX = Math.min(selectionStartX, mouseUpPixelStartX);
        const normalizedStartY = Math.min(selectionStartY, mouseUpPixelStartY);
        
        // These are the *start coordinates* of the furthest selected pixel.
        const normalizedEndX = Math.max(selectionStartX, mouseUpPixelStartX);
        const normalizedEndY = Math.max(selectionStartY, mouseUpPixelStartY);

        // Derive selectionBox coordinates from normalized values.
        // selectionBox.x/y are top-left of the selected region.
        // selectionBox.width/height are the dimensions of the selected region.
        // Note: normalizedEndX/Y are the start coords of the furthest pixel, so add GRID_SIZE for width/height.
        const selectionBoxX = normalizedStartX;
        const selectionBoxY = normalizedStartY;
        const selectionBoxWidth = (normalizedEndX - normalizedStartX) + GRID_SIZE;
        const selectionBoxHeight = (normalizedEndY - normalizedStartY) + GRID_SIZE;

        // --- Start of User's Provided Intersection Method Logic ---

        // [1] ?쒕옒洹명븳 ?ш컖?뺤쓽 醫뚰몴 (Raw Input)
        // ?뚯닔??踰꾨┝(floor) 泥섎━濡??뺤닔 醫뚰몴 ?뺣낫
        let rawStartX = Math.floor(selectionBoxX);
        let rawEndX = Math.floor(selectionBoxX + selectionBoxWidth);
        let rawStartY = Math.floor(selectionBoxY);
        let rawEndY = Math.floor(selectionBoxY + selectionBoxHeight);

        // [2] 諛섎났臾몄쓽 踰붿쐞瑜?罹붾쾭???덉そ?쇰줈 媛뺤젣 媛?먭린 (?듭떖 濡쒖쭅!)
        // Math.max(0, ...) : 0蹂대떎 ?묒? 怨??쇱そ/?꾩そ 諛붽묑)? 0?쇰줈 ?뚯뼱?щ┝
        // Math.min(WORLD_SIZE, ...) : ??WORLD_SIZE)???섎뒗 怨녹? WORLD_SIZE濡??뚯뼱?대┝ (諛고????곹븳)
        const loopStartX = Math.max(0, rawStartX);
        const loopEndX = Math.min(WORLD_SIZE, rawEndX);
        const loopStartY = Math.max(0, rawStartY);
        const loopEndY = Math.min(WORLD_SIZE, rawEndY);

        const validPixels = [];

        // [3] 蹂댁젙??踰붿쐞(Intersection) ?댁뿉?쒕쭔 諛섎났臾??ㅽ뻾
        // Iterate by GRID_SIZE
        for (let y = loopStartY; y < loopEndY; y += GRID_SIZE) {
            for (let x = loopStartX; x < loopEndX; x += GRID_SIZE) {
                // ???덉뿉??臾댁“嫄??좏슚??醫뚰몴留??ㅼ뼱??
                validPixels.push({ x, y });
            }
        }

        // [4] 寃곌낵 ???
        selectedPixels = validPixels;

        // --- End of User's Provided Intersection Method Logic ---

        


        updateSidePanel(); // Update panel based on selectedPixels
        if (selectedPixels.length > 0) {
            sidePanel.style.display = 'block';
        } else {
            sidePanel.style.display = 'none';
        }
        draw(); // Redraw with selected pixels highlighted
        return; // Don't proceed to regular click logic
    }
    
    // If not dragging and not selecting, then it's a regular click (possibly outside canvas)
    // This part handles single clicks on owned pixels or clicks outside everything to clear selection
    if (e.target === canvas) { // Clicked directly on canvas (not part of drag/selection)
        const worldX = (e.clientX - offsetX) / scale;
        const worldY = (e.clientY - offsetY) / scale;

        if (worldX >= 0 && worldX < WORLD_SIZE && worldY >= 0 && worldY < WORLD_SIZE) {
            const gx = Math.floor(worldX / GRID_SIZE);
            const gy = Math.floor(worldY / GRID_SIZE);
            const clickedX = gx * GRID_SIZE;
            const clickedY = gy * GRID_SIZE;

            selectedPixels = []; // Clear previous selection
            const existingPixel = pixels.find(p => p.x === clickedX && p.y === clickedY);
            
            if (existingPixel) { // If single clicked an owned pixel, show its info
                selectedPixels.push(existingPixel); // Temporarily add for panel display
                updateSidePanel(existingPixel); // Pass the owned pixel to display its info
                sidePanel.style.display = 'block';
            } else { // If single clicked an unowned pixel, select it
                selectedPixels.push({ x: clickedX, y: clickedY });
                updateSidePanel(); // Update panel with the single selected unowned pixel
                sidePanel.style.display = 'block';
            }
            draw();
        } else { // Click on canvas but outside world boundaries
            sidePanel.style.display = 'none';
            selectedPixels = [];
            draw();
        }
    } else if (!sidePanel.contains(e.target)) { // Clicked outside canvas AND outside side panel
        sidePanel.style.display = 'none';
        selectedPixels = [];
        draw();
    }
};


// Function to get selected pixels within a rectangle (not actively used in current logic but useful)
function getPixelsInSelection(rectX, rectY, rectWidth, rectHeight) {
    const newSelected = [];
    for (let x = rectX; x < rectX + rectWidth; x += GRID_SIZE) {
        for (let y = rectY; y < rectY + rectHeight; y += GRID_SIZE) {
            // Ensure x, y are within WORLD_SIZE and only select unowned pixels
            if (x >= 0 && x < WORLD_SIZE && y >= 0 && y < WORLD_SIZE) {
                const existingPixel = pixels.find(p => p.x === x && p.y === y);
                if (!existingPixel) {
                    newSelected.push({ x, y });
                }
            }
        }
    }
    return newSelected;
}


// Modified updateSidePanel to handle multiple selections
function updateSidePanel(singleOwnedPixel = null) {
    console.log('updateSidePanel called.'); // DEBUG
    console.log('Current selectedPixels length:', selectedPixels.length); // DEBUG
    console.log('selectedPixelCountDiv inside updateSidePanel:', selectedPixelCountDiv); // DEBUG

    // --- Implement Request 1: Data Filtering for selectedPixels ---
    const validSelectedPixels = selectedPixels.filter(p => 
        p.x >= 0 && p.x < WORLD_SIZE - EPSILON && p.y >= 0 && p.y < WORLD_SIZE - EPSILON
    );
    const totalSelected = validSelectedPixels.length;
    
    // Default to hide all purchase related things
    pixelInfo.style.display = 'none';
    purchaseForm.style.display = 'none';

    if (totalSelected > 0) {
        selectedPixelCountDiv.textContent = `珥?${totalSelected} ?쎌? ?좏깮??;
        selectedPixelCountDiv.style.display = 'block';
        const ownedInSelection = validSelectedPixels.filter(p => pixels.some(ep => ep.x === p.x && ep.y === p.y));
        const unownedInSelection = validSelectedPixels.filter(p => !pixels.some(ep => ep.x === p.x && ep.y === p.y));

        if (unownedInSelection.length > 0) { // There are unowned pixels in the selection
            purchaseForm.style.display = 'block';
            if (ownedInSelection.length > 0) {
                statusTag.textContent = `${unownedInSelection.length} ?쎌? 援щℓ 媛??(${ownedInSelection.length}媛??뚯쑀??`;
                statusTag.style.background = '#ff9800'; // Orange for mixed
            } else {
                statusTag.textContent = `${totalSelected} ?쎌? ?좏깮??;
                statusTag.style.background = '#00d4ff'; // Blue for all unowned
            }
            areaIdText.innerText = `珥?援щ룆猷? ??${(unownedInSelection.length * 1000).toLocaleString()}`;
        } else if (ownedInSelection.length > 0) { // All selected pixels are owned
            pixelInfo.style.display = 'block';
            statusTag.textContent = '?좏깮??紐⑤뱺 ?쎌?? ?대? ?뚯쑀???덉쓬';
            statusTag.style.background = '#ff4d4d'; // Red for all owned
            ownerNickname.textContent = '-';
            idolGroup.textContent = '-';
            areaIdText.innerText = `珥?${totalSelected}媛쒖쓽 ?뚯쑀???쎌?`;
            
            // If it's a single owned pixel from a direct click, show its specific info
            if (ownedInSelection.length === 1 && singleOwnedPixel && ownedInSelection[0].x === singleOwnedPixel.x && ownedInSelection[0].y === singleOwnedPixel.y) {
                ownerNickname.textContent = singleOwnedPixel.owner_nickname;
                idolGroup.textContent = singleOwnedPixel.idol_group_name;
                areaIdText.innerText = `Area #${singleOwnedPixel.x/GRID_SIZE}-${singleOwnedPixel.y/GRID_SIZE}`;
            }
        }
    } else { // No pixels selected
        sidePanel.style.display = 'none';
        areaIdText.innerText = `Area #??`; // Default state
        selectedPixelCountDiv.style.display = 'none';
    }
}


subscribeButton.onclick = () => {
    const nickname = nicknameInput.value.trim();
    const idolGroupName = idolSelect.value;

    if (!nickname) {
        alert('?됰꽕?꾩쓣 ?낅젰?댁＜?몄슂.');
        return;
    }
    if (selectedPixels.length === 0) {
        alert('?좏깮???쎌????놁뒿?덈떎.');
        return;
    }

    // --- Implement Request 1: Data Filtering for selectedPixels before sending to server ---
    const pixelsToSend = selectedPixels.filter(p => 
        p.x >= 0 && p.x < WORLD_SIZE - EPSILON && p.y >= 0 && p.y < WORLD_SIZE - EPSILON
    );

    if (pixelsToSend.length === 0) {
        alert('?좏슚???쎌????좏깮?섏? ?딆븯?듬땲?? 罹붾쾭??踰붿쐞 ?댁쓽 ?쎌????좏깮?댁＜?몄슂.');
        return;
    }

    const groupInfo = idolInfo[idolGroupName];

    pixelsToSend.forEach(pixel => {
        socket.emit('new_pixel', {
            x: pixel.x,
            y: pixel.y,
            color: groupInfo.color,
            idol_group_name: idolGroupName,
            owner_nickname: nickname
        });
    });

    sidePanel.style.display = 'none';
    nicknameInput.value = '';
    selectedPixels = []; // Clear selection after purchase
    draw(); // Redraw to clear selection highlights
};

canvas.onwheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const mouseX = e.clientX - offsetX;
    const mouseY = e.clientY - offsetY;
    
    offsetX -= (mouseX * delta - mouseX);
    offsetY -= (mouseY * delta - mouseY);
    scale *= delta;
    scale = Math.min(Math.max(scale, 0.05), 20);
    draw();
};

function updateMinimap() {
    const mv = document.getElementById('minimap-view');
    const mmScale = 180 / WORLD_SIZE;
    mv.style.width = (window.innerWidth / scale * mmScale) + 'px';
    mv.style.height = (window.innerHeight / scale * mmScale) + 'px';
    mv.style.left = (-offsetX / scale * mmScale) + 'px';
    mv.style.top = (-offsetY / scale * mmScale) + 'px';
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        scale = 0.2;
        offsetX = window.innerWidth / 2 - (WORLD_SIZE * scale) / 2;
        offsetY = window.innerHeight / 2 - (WORLD_SIZE * scale) / 2;
        draw();
    }
});

window.onresize = draw;
