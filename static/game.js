// Game State
let room = null;
let userId = null; // Unique ID from server
let playerIndex = null; // 0 (Red) or 1 (Blue)
let gameActive = false;
let myTurn = false;
let boardState = Array(9).fill(null);
let pollingInterval = null;

// DOM Elements
const lobbyDiv = document.getElementById('lobby');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const statusDiv = document.getElementById('status');

// Join Room
joinBtn.addEventListener('click', async () => {
    room = roomInput.value;
    if (room) {
        lobbyDiv.style.display = 'none';
        statusDiv.style.display = 'block';
        statusDiv.innerText = 'Connecting...';
        
        try {
            const response = await fetch('/api/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ room: room })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                userId = data.user_id;
                playerIndex = data.player_index;
                console.log('Joined as player', playerIndex);
                startPolling();
            } else {
                alert(data.error);
                location.reload();
            }
        } catch (e) {
            console.error(e);
            alert('Connection failed');
            location.reload();
        }
    }
});

// Polling Loop (fetches state every 1 second)
function startPolling() {
    pollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/state?room=${room}&user_id=${userId}`);
            if (!response.ok) return; // Maybe room closed or error
            
            const state = await response.json();
            updateGameState(state);
            
        } catch (e) {
            console.error("Polling error", e);
        }
    }, 1000); // 1 second interval
}

function updateGameState(state) {
    // Check if waiting for player
    if (!state.game_active) {
        statusDiv.innerText = 'Waiting for opponent...';
        return;
    }
    
    gameActive = true;
    myTurn = state.my_turn;
    
    // Update Status Text
    if (state.winner !== null) {
        gameActive = false;
        clearInterval(pollingInterval); // Stop polling
        if (state.winner === 'draw') {
            statusDiv.innerText = 'Game Over! Draw!';
        } else {
            const winnerText = state.winner === 0 ? 'Red' : 'Blue';
            statusDiv.innerText = `Game Over! ${winnerText} Wins!`;
        }
    } else {
        if (myTurn) {
            statusDiv.innerText = 'Your Turn!';
            statusDiv.style.color = '#00ff00';
        } else {
            statusDiv.innerText = "Opponent's Turn";
            statusDiv.style.color = '#ffffff';
        }
    }

    // Sync Board
    // state.board is an array of 0, 1 or null
    state.board.forEach((cellValue, index) => {
        if (cellValue !== null && boardState[index] === null) {
            // New move detected
            placeMarker(index, cellValue);
            boardState[index] = cellValue;
        }
    });
}

// --- Three.js Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x333333);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;
camera.position.y = 2;
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

// Board (3x3 Grid)
const cells = [];
const markers = []; 

const boardGroup = new THREE.Group();
scene.add(boardGroup);

const gridHelper = new THREE.GridHelper(3, 3);
gridHelper.rotation.x = Math.PI / 2;
boardGroup.add(gridHelper);

const geometry = new THREE.PlaneGeometry(0.9, 0.9);
const material = new THREE.MeshBasicMaterial({ color: 0xffffff, visible: false }); 

for (let i = 0; i < 9; i++) {
    const cell = new THREE.Mesh(geometry, material.clone()); 
    const x = (i % 3) - 1;
    const y = 1 - Math.floor(i / 3);
    cell.position.set(x, y, 0);
    cell.userData = { index: i };
    boardGroup.add(cell);
    cells.push(cell);
}

// Raycaster
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', onMouseClick, false);

async function onMouseClick(event) {
    if (!gameActive || !myTurn) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cells);

    if (intersects.length > 0) {
        const clickedCell = intersects[0].object;
        const index = clickedCell.userData.index;

        if (boardState[index] !== null) return;

        // Optimistic UI update (optional, but makes it feel faster)
        // placeMarker(index, playerIndex); 
        // boardState[index] = playerIndex;

        // Send move to server
        try {
            const response = await fetch('/api/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room: room,
                    user_id: userId,
                    index: index
                })
            });
            
            const res = await response.json();
            if (res.error) {
                console.error(res.error);
            } else {
                // Force immediate update
                const stateResp = await fetch(`/api/state?room=${room}&user_id=${userId}`);
                const state = await stateResp.json();
                updateGameState(state);
            }
        } catch (e) {
            console.error("Move failed", e);
        }
    }
}

function placeMarker(index, playerIdx) {
    let mesh;
    if (playerIdx === 0) {
        const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const mat = new THREE.MeshPhongMaterial({ color: 0xff4444 });
        mesh = new THREE.Mesh(geo, mat);
    } else {
        const geo = new THREE.SphereGeometry(0.4, 32, 32);
        const mat = new THREE.MeshPhongMaterial({ color: 0x4444ff });
        mesh = new THREE.Mesh(geo, mat);
    }

    const targetCell = cells[index];
    mesh.position.copy(targetCell.position);
    mesh.position.z = 0.3; 
    
    boardGroup.add(mesh);
    markers[index] = mesh;
}

function animate() {
    requestAnimationFrame(animate);
    markers.forEach(marker => {
        if (marker) {
            marker.rotation.x += 0.01;
            marker.rotation.y += 0.01;
        }
    });
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
