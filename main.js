const canvas = document.getElementById('pixelCanvas');
const ctx = canvas.getContext('2d');
// Side Panel Elements
const sidePanel = document.getElementById('side-panel');
const areaIdText = document.getElementById('area-id');
const pixelInfo = document.getElementById('pixel-info');
const statusTag = document.getElementById('status-tag');
const selectedPixelCountDiv = document.getElementById('selected-pixel-count'); 
console.log('selectedPixelCountDiv element:', selectedPixelCountDiv); // DEBUG
const ownerNickname = document.getElementById('owner-nickname');
const idolGroup = document.getElementById('idol-group');
const purchaseForm = document.getElementById('purchase-form');
const nicknameInput = document.getElementById('nickname-input');
const idolSelect = document.getElementById('idol-select');
const subscribeButton = document.getElementById('subscribe-button');

// NEW: Elements for Owner Stats (Created dynamically if not present, or added here)
let ownerStatsDiv = document.getElementById('owner-stats');
if (!ownerStatsDiv) {
    ownerStatsDiv = document.createElement('div');
    ownerStatsDiv.id = 'owner-stats';
    ownerStatsDiv.style.cssText = "display:flex; justify-content: space-between; margin-top: 5px; color: #00d4ff; font-weight: bold;";
    // Insert it after the idol group info
    const infoContainer = idolGroup.parentElement.parentElement;
    infoContainer.appendChild(ownerStatsDiv);
}

const socket = io();

// Updated to 10M pixels (63240x63240)
const WORLD_SIZE = 63240;
const GRID_SIZE = 20;
const MAX_GRID_START_COORD = Math.floor((WORLD_SIZE - 1) / GRID_SIZE) * GRID_SIZE;
const EPSILON = 0.001; 
let scale = 0.2;

// Initial view centered around (1500, 1500) where the initial pixels are
let offsetX = window.innerWidth / 2 - 1500 * scale;
let offsetY = window.innerHeight / 2 - 1500 * scale;

// OPTIMIZATION: Use Map for O(1) lookup
// Key: "x,y", Value: Pixel Object
let pixelMap = new Map();

// NEW: Cache for User Pixel Counts
// Key: nickname, Value: count
let userPixelCounts = new Map();

let selectedPixels = []; 
let isDraggingCanvas = false; 
let isSelectingPixels = false; 
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

    // Apply a clipping path
    ctx.beginPath();
    ctx.rect(0, 0, WORLD_SIZE, WORLD_SIZE);
    ctx.clip(); 

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

    // Draw all owned pixels (Iterate Map values)
    pixelMap.forEach(pixel => {
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
        
        const rawEndX = Math.max(selectionStartX, selectionEndX) + GRID_SIZE;
        const rawEndY = Math.max(selectionStartY, selectionEndY) + GRID_SIZE;

        const clampedEndX = Math.min(WORLD_SIZE, rawEndX);
        const clampedEndY = Math.min(WORLD_SIZE, rawEndY);

        const width = clampedEndX - startX;
        const height = clampedEndY - startY;

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
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        selectedPixels.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + GRID_SIZE);
            maxY = Math.max(maxY, p.y + GRID_SIZE);
        });

        // Draw the bounding box
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 2; 
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.1)'; 
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
        // Convert array to Map and Populate User Pixel Counts
        initialPixels.forEach(p => {
            pixelMap.set(`${p.x},${p.y}`, p);
            
            // Stats
            const count = userPixelCounts.get(p.owner_nickname) || 0;
            userPixelCounts.set(p.owner_nickname, count + 1);
        });
        draw();
    })
    .catch(e => console.error('Error fetching initial pixels:', e));

socket.on('pixel_update', (pixel) => {
    // Check old owner to decrement count
    const key = `${pixel.x},${pixel.y}`;
    const oldPixel = pixelMap.get(key);
    
    if (oldPixel && oldPixel.owner_nickname) {
        const oldOwner = oldPixel.owner_nickname;
        const oldCount = userPixelCounts.get(oldOwner) || 0;
        if (oldCount > 0) {
            userPixelCounts.set(oldOwner, oldCount - 1);
        }
    }

    // Update Map
    pixelMap.set(key, pixel);

    // Increment new owner count
    const newOwner = pixel.owner_nickname;
    const newCount = userPixelCounts.get(newOwner) || 0;
    userPixelCounts.set(newOwner, newCount + 1);

    draw();
    
    // Update panel if specific pixel is selected
    if (selectedPixels.length === 1 && selectedPixels[0].x === pixel.x && selectedPixels[0].y === pixel.y) {
       updateSidePanel(pixel);
    }
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
    
    worldX = Math.floor(worldX);
    worldY = Math.floor(worldY);

    if (e.ctrlKey) {
        isDraggingCanvas = true;
        isSelectingPixels = false; 
    } else { 
        isSelectingPixels = true;
        isDraggingCanvas = false; 
        selectionStartX = Math.floor(worldX / GRID_SIZE) * GRID_SIZE;
        selectionStartY = Math.floor(worldY / GRID_SIZE) * GRID_SIZE;

        selectionStartX = Math.max(0, Math.min(selectionStartX, MAX_GRID_START_COORD));
        selectionStartY = Math.max(0, Math.min(selectionStartY, MAX_GRID_START_COORD));

        selectionStartX = Math.max(0, Math.min(selectionStartX, MAX_GRID_START_COORD));
        selectionStartY = Math.max(0, Math.min(selectionStartY, MAX_GRID_START_COORD));
        selectionEndX = selectionStartX; 
        selectionEndY = selectionStartY;
        selectedPixels = []; 
        sidePanel.style.display = 'none'; 
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

        worldX = Math.floor(worldX);
        worldY = Math.floor(worldY);
        
        selectionEndX = Math.floor(worldX / GRID_SIZE) * GRID_SIZE;
        selectionEndY = Math.floor(worldY / GRID_SIZE) * GRID_SIZE;

        selectionEndX = Math.max(0, Math.min(selectionEndX, MAX_GRID_START_COORD));
        selectionEndY = Math.max(0, Math.min(selectionEndY, MAX_GRID_START_COORD));
        
        // OPTIMIZATION: Do NOT calculate selectedPixels here. 
        draw();
    }
};

window.onmouseup = (e) => {

    if (isDraggingCanvas) { 
        isDraggingCanvas = false;
        if (selectedPixels.length === 0) {
            sidePanel.style.display = 'none';
        }
        return; 
    }

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

        currentMouseWorldX = Math.floor(currentMouseWorldX);
        currentMouseWorldY = Math.floor(currentMouseWorldY);

        let mouseUpPixelStartX = Math.floor(currentMouseWorldX / GRID_SIZE) * GRID_SIZE;
        let mouseUpPixelStartY = Math.floor(currentMouseWorldY / GRID_SIZE) * GRID_SIZE;

        mouseUpPixelStartX = Math.max(0, Math.min(mouseUpPixelStartX, MAX_GRID_START_COORD));
        mouseUpPixelStartY = Math.max(0, Math.min(mouseUpPixelStartY, MAX_GRID_START_COORD));

        const normalizedStartX = Math.min(selectionStartX, mouseUpPixelStartX);
        const normalizedStartY = Math.min(selectionStartY, mouseUpPixelStartY);
        
        const normalizedEndX = Math.max(selectionStartX, mouseUpPixelStartX);
        const normalizedEndY = Math.max(selectionStartY, mouseUpPixelStartY);

        const selectionBoxX = normalizedStartX;
        const selectionBoxY = normalizedStartY;
        const selectionBoxWidth = (normalizedEndX - normalizedStartX) + GRID_SIZE;
        const selectionBoxHeight = (normalizedEndY - normalizedStartY) + GRID_SIZE;

        // --- Start of User's Provided Intersection Method Logic ---
        // OPTIMIZATION: Calculation happens ONLY here on mouseup

        let rawStartX = Math.floor(selectionBoxX);
        let rawEndX = Math.floor(selectionBoxX + selectionBoxWidth);
        let rawStartY = Math.floor(selectionBoxY);
        let rawEndY = Math.floor(selectionBoxY + selectionBoxHeight);

        const loopStartX = Math.max(0, rawStartX);
        const loopEndX = Math.min(WORLD_SIZE, rawEndX);
        const loopStartY = Math.max(0, rawStartY);
        const loopEndY = Math.min(WORLD_SIZE, rawEndY);

        const validPixels = [];

        // Iterate by GRID_SIZE
        for (let y = loopStartY; y < loopEndY; y += GRID_SIZE) {
            for (let x = loopStartX; x < loopEndX; x += GRID_SIZE) {
                validPixels.push({ x, y });
            }
        }

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
    
    // Normal Click Handling
    if (e.target === canvas) { 
        const worldX = (e.clientX - offsetX) / scale;
        const worldY = (e.clientY - offsetY) / scale;

        if (worldX >= 0 && worldX < WORLD_SIZE && worldY >= 0 && worldY < WORLD_SIZE) {
            const gx = Math.floor(worldX / GRID_SIZE);
            const gy = Math.floor(worldY / GRID_SIZE);
            const clickedX = gx * GRID_SIZE;
            const clickedY = gy * GRID_SIZE;

            selectedPixels = []; 
            // OPTIMIZATION: O(1) lookup
            const existingPixel = pixelMap.get(`${clickedX},${clickedY}`);
            
            if (existingPixel) { 
                selectedPixels.push(existingPixel); 
                updateSidePanel(existingPixel); 
                sidePanel.style.display = 'block';
            } else { 
                selectedPixels.push({ x: clickedX, y: clickedY });
                updateSidePanel(); 
                sidePanel.style.display = 'block';
            }
            draw();
        } else { 
            sidePanel.style.display = 'none';
            selectedPixels = [];
            draw();
        }
    } else if (!sidePanel.contains(e.target)) { 
        sidePanel.style.display = 'none';
        selectedPixels = [];
        draw();
    }
};


function updateSidePanel(singleOwnedPixel = null) {

    // --- Implement Request 1: Data Filtering for selectedPixels ---
    const validSelectedPixels = selectedPixels.filter(p => 
        p.x >= 0 && p.x < WORLD_SIZE - EPSILON && p.y >= 0 && p.y < WORLD_SIZE - EPSILON
    );
    const totalSelected = validSelectedPixels.length;
    
    pixelInfo.style.display = 'none';
    purchaseForm.style.display = 'none';

    // Hide stats by default
    if(ownerStatsDiv) ownerStatsDiv.style.display = 'none';

    if (totalSelected > 0) {
        selectedPixelCountDiv.textContent = `총 ${totalSelected} 픽셀 선택됨`;
        selectedPixelCountDiv.style.display = 'block';
        
        // OPTIMIZATION: fast check using Map.has() O(1)
        // FIX: Retrieving full pixel objects allows us to display owner info correctly
        const ownedInSelection = validSelectedPixels
            .filter(p => pixelMap.has(`${p.x},${p.y}`))
            .map(p => pixelMap.get(`${p.x},${p.y}`));

        const unownedInSelection = validSelectedPixels.filter(p => !pixelMap.has(`${p.x},${p.y}`));

        if (unownedInSelection.length > 0) { // There are unowned pixels
            purchaseForm.style.display = 'block';
            if (ownedInSelection.length > 0) {
                statusTag.textContent = `${unownedInSelection.length} 픽셀 구매 가능 (${ownedInSelection.length}개 소유됨)`;
                statusTag.style.background = '#ff9800'; // Orange for mixed
            } else {
                statusTag.textContent = `${totalSelected} 픽셀 선택됨`;
                statusTag.style.background = '#00d4ff'; // Blue for all unowned
            }
            areaIdText.innerText = `총 구독료: ₩ ${(unownedInSelection.length * 1000).toLocaleString()}`;
        } else if (ownedInSelection.length > 0) { // All selected pixels are owned
            pixelInfo.style.display = 'block';
            statusTag.textContent = '선택된 모든 픽셀은 이미 소유자 있음';
            statusTag.style.background = '#ff4d4d'; // Red for all owned
            ownerNickname.textContent = '-';
            idolGroup.textContent = '-';
            areaIdText.innerText = `총 ${totalSelected}개의 소유된 픽셀`;
            
            // FIX: Show info if exactly one owned pixel is selected, regardless of how it was selected
            if (ownedInSelection.length === 1) {
                const p = ownedInSelection[0];
                ownerNickname.textContent = p.owner_nickname;
                idolGroup.textContent = p.idol_group_name;
                areaIdText.innerText = `Area #${p.x/GRID_SIZE}-${p.y/GRID_SIZE}`;

                // --- NEW: Calculate and Show Owner Stats ---
                const ownerCount = userPixelCounts.get(p.owner_nickname) || 0;
                // Calculate Market Share (Start with share of occupied world?)
                const totalOccupied = pixelMap.size;
                const marketShare = totalOccupied > 0 ? ((ownerCount / totalOccupied) * 100).toFixed(2) : 0;
                
                if (ownerStatsDiv) {
                    ownerStatsDiv.innerHTML = `<span>보유 정보</span> <span>${ownerCount.toLocaleString()}개 (${marketShare}%)</span>`;
                    ownerStatsDiv.style.display = 'flex';
                }
            }
        }
    } else { // No pixels selected
        sidePanel.style.display = 'none';
        areaIdText.innerText = `Area #??`; 
        selectedPixelCountDiv.style.display = 'none';
    }
}


subscribeButton.onclick = () => {
    const nickname = nicknameInput.value.trim();
    const idolGroupName = idolSelect.value;

    if (!nickname) {
        alert('닉네임을 입력해주세요.');
        return;
    }
    if (selectedPixels.length === 0) {
        alert('선택된 픽셀이 없습니다.');
        return;
    }

    const pixelsToSend = selectedPixels.filter(p => 
        p.x >= 0 && p.x < WORLD_SIZE - EPSILON && p.y >= 0 && p.y < WORLD_SIZE - EPSILON
    );

    if (pixelsToSend.length === 0) {
        alert('유효한 픽셀이 선택되지 않았습니다. 캔버스 범위 내의 픽셀을 선택해주세요.');
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
    selectedPixels = []; 
    draw(); 
};

canvas.onwheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const mouseX = e.clientX - offsetX;
    const mouseY = e.clientY - offsetY;
    
    offsetX -= (mouseX * delta - mouseX);
    offsetY -= (mouseY * delta - mouseY);
    scale *= delta;
    scale = Math.min(Math.max(scale, 0.0005), 20);
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
        const scaleX = window.innerWidth / WORLD_SIZE;
        const scaleY = window.innerHeight / WORLD_SIZE;
        scale = Math.min(scaleX, scaleY); 
        
        // Center the world
        offsetX = (window.innerWidth - WORLD_SIZE * scale) / 2;
        offsetY = (window.innerHeight - WORLD_SIZE * scale) / 2;
        
        draw();
    }
});

window.onresize = draw;
