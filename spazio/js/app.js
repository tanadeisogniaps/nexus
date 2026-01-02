// DOM Elements
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const localVideo = document.getElementById('local-video');
const myPeerIdInput = document.getElementById('my-peer-id');
const peerIdInput = document.getElementById('peer-id-input');
const connectBtn = document.getElementById('connect-btn');
const videoGrid = document.getElementById('video-grid');
const gameMap = document.getElementById('game-map');
const mapContainer = document.getElementById('map-container');
const mapPlaceholder = document.getElementById('map-placeholder');
const mapUpload = document.getElementById('map-upload');

// State
let peer;
let myStream;
let calls = []; // Active media calls
let dataConnections = []; // Active data connections
let myPeerId = '';
let mapState = {
    scale: 1,
    panning: false,
    pointX: 0,
    pointY: 0,
    startX: 0,
    startY: 0
};

// --- Initialization ---
async function init() {
    setupTabs();
    setupChat();
    setupMap();
    setupCompendium();

    // Initialize Video
    try {
        myStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        addVideoStream(localVideo, myStream, true);
        initPeer();
    } catch (err) {
        console.error("Failed to get local stream", err);
        addMessage("System", "Impossibile accedere alla webcam/microfono. Verifica i permessi.", "normal"); // Changed from system/error to normal for safety
        initPeer(); // Try init without stream
    }
}

// --- PeerJS (WebRTC) ---
function initPeer() {
    peer = new Peer();

    peer.on('open', (id) => {
        myPeerId = id;
        myPeerIdInput.value = id;
        addMessage("System", "Connesso. Il tuo ID è pronto.", "system");
    });

    // Incoming Data Connection
    peer.on('connection', (conn) => {
        setupDataConnection(conn);
    });

    // Incoming Video Call
    peer.on('call', (call) => {
        if (myStream) call.answer(myStream);
        handleMediaCall(call);
    });
}

function connectToPeer(peerId) {
    if (!peerId) return;

    // 1. Data Connection
    const conn = peer.connect(peerId);
    setupDataConnection(conn);

    // 2. Media Call
    if (myStream) {
        const call = peer.call(peerId, myStream);
        handleMediaCall(call);
    }

    addMessage("System", `Connessione verso ${peerId}`, "system");
}

function setupDataConnection(conn) {
    conn.on('open', () => {
        dataConnections.push(conn);
    });

    conn.on('data', (data) => {
        handleIncomingData(data);
    });

    conn.on('close', () => {
        dataConnections = dataConnections.filter(c => c !== conn);
    });
}

function handleMediaCall(call) {
    const video = document.createElement('video');
    call.on('stream', (userVideoStream) => {
        addRemoteVideo(video, userVideoStream);
    });
    call.on('close', () => {
        video.parentElement.remove();
    });
    calls.push(call);
}

function broadcast(data) {
    dataConnections.forEach(conn => {
        if (conn.open) conn.send(data);
    });
}

function handleIncomingData(data) {
    switch (data.type) {
        case 'CHAT':
            addMessage(data.author, data.text, 'normal', true);
            break;
        case 'ROLL':
            addMessage("Dice", `${data.author} ha rollato ${data.dice}: <span class="roll-result">${data.total}</span> ${data.details}`, 'normal', true);
            break;
        case 'TOKEN_ADD':
            createRemoteToken(data.payload);
            break;
        case 'TOKEN_MOVE':
            moveRemoteToken(data.payload);
            break;
    }
}

function addRemoteVideo(video, stream) {
    if (video.srcObject === stream) return;

    const card = document.createElement('div');
    card.className = 'video-card remote';

    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => {
        video.play();
    });

    const label = document.createElement('span');
    label.className = 'video-label';
    label.innerText = 'Giocatore';

    card.appendChild(video);
    card.appendChild(label);
    videoGrid.appendChild(card);
}

function addVideoStream(video, stream, isMuted = false) {
    video.srcObject = stream;
    video.muted = isMuted;
    video.addEventListener('loadedmetadata', () => {
        video.play();
    });
}

// --- Chat & Dice ---
function setupChat() {
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    connectBtn.addEventListener('click', () => {
        connectToPeer(peerIdInput.value);
    });

    document.getElementById('copy-id-btn').addEventListener('click', () => {
        myPeerIdInput.select();
        document.execCommand('copy');
        addMessage("System", "ID copiato!", "system");
    });
}

function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    if (text.startsWith('/roll')) {
        handleRollCommand(text);
    } else {
        addMessage("Me", text);
        broadcast({ type: 'CHAT', author: 'Giocatore', text: text });
    }
    chatInput.value = '';
}

function addMessage(author, text, type = 'normal', isRemote = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;

    if (type === 'system') {
        msgDiv.innerText = text;
    } else {
        const displayAuthor = isRemote ? author : (author === "Me" ? "Tu" : author);
        msgDiv.innerHTML = `<span class="author">${displayAuthor}:</span> ${text}`;
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

window.rollDice = function (sides) {
    const result = Math.floor(Math.random() * sides) + 1;
    addMessage("Dice", `Hai rollato d${sides}: <span class="roll-result">${result}</span>`);
    broadcast({
        type: 'ROLL',
        author: 'Giocatore',
        dice: `d${sides}`,
        total: result,
        details: ''
    });
}

function handleRollCommand(cmd) {
    const parts = cmd.split(' ');
    if (parts.length > 1) {
        const diceParams = parts[1].split('d');
        if (diceParams.length === 2) {
            const count = parseInt(diceParams[0]) || 1;
            const sides = parseInt(diceParams[1]);
            let total = 0;
            let results = [];
            for (let i = 0; i < count; i++) {
                const r = Math.floor(Math.random() * sides) + 1;
                results.push(r);
                total += r;
            }
            const details = `(${results.join(',')})`;
            addMessage("Dice", `Hai rollato ${parts[1]}: <span class="roll-result">${total}</span> ${details}`);
            broadcast({
                type: 'ROLL',
                author: 'Giocatore',
                dice: parts[1],
                total: total,
                details: details
            });
            return;
        }
    }
    addMessage("System", "Comando non valido.", "system");
}

// --- Map Logic ---
function setupMap() {
    mapUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                gameMap.src = readerEvent.target.result;
                gameMap.style.display = 'block';
                mapPlaceholder.style.display = 'none';
                resetMapTransform();
            }
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('zoom-in').addEventListener('click', () => {
        mapState.scale *= 1.2;
        updateMapTransform();
    });
    document.getElementById('zoom-out').addEventListener('click', () => {
        mapState.scale /= 1.2;
        updateMapTransform();
    });
    document.getElementById('fit-map').addEventListener('click', resetMapTransform);

    mapContainer.addEventListener('mousedown', (e) => {
        if (e.target.closest('.video-card')) return;
        // Also don't pan if clicking a token (handled in token logic usually, but here we check event target)
        if (e.target.closest('.token')) return;

        e.preventDefault();
        mapState.panning = true;
        mapState.startX = e.clientX - mapState.pointX;
        mapState.startY = e.clientY - mapState.pointY;
        mapContainer.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!mapState.panning) return;
        e.preventDefault();
        mapState.pointX = e.clientX - mapState.startX;
        mapState.pointY = e.clientY - mapState.startY;
        updateMapTransform();
    });

    window.addEventListener('mouseup', () => {
        mapState.panning = false;
        mapContainer.style.cursor = 'grab';
    });

    setupTokens();
}

function updateMapTransform() {
    let world = document.getElementById('game-world');
    if (!world) {
        world = document.createElement('div');
        world.id = 'game-world';
        world.style.transformOrigin = '0 0';
        world.style.transition = 'transform 0.1s ease-out';

        // Move image into world
        if (gameMap.parentNode === mapContainer) {
            gameMap.parentNode.insertBefore(world, gameMap);
            world.appendChild(gameMap);
        }
    }

    world.style.transform = `translate(${mapState.pointX}px, ${mapState.pointY}px) scale(${mapState.scale})`;
}

function resetMapTransform() {
    mapState.scale = 1;
    mapState.pointX = 0;
    mapState.pointY = 0;
    updateMapTransform();
}

// --- Tokens Logic ---
function setupTokens() {
    const pcBtn = document.getElementById('add-token-pc');
    const enemyBtn = document.getElementById('add-token-enemy');

    // Safety check if buttons exist (they should)
    if (pcBtn) pcBtn.addEventListener('click', () => addToken('pc'));
    if (enemyBtn) enemyBtn.addEventListener('click', () => addToken('enemy'));
}

function addToken(type, id = null, x = null, y = null, isRemote = false) {
    let world = document.getElementById('game-world');
    if (!world) {
        updateMapTransform();
        world = document.getElementById('game-world');
    }

    const tokenId = id || `token-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const token = document.createElement('div');
    token.className = `token ${type}`;
    token.id = tokenId;

    // Position
    let finalX, finalY;
    if (x !== null && y !== null) {
        finalX = x;
        finalY = y;
    } else {
        // Default center placement logic for local creation
        // We need to calculate position relative to the world coordinate system
        // World is transformed by Translate(Px, Py) Scale(S)
        // Center of Screen (Cx, Cy)
        // Token Pos in World (Tx, Ty) -> Screen: Tx*S + Px = Cx
        // Tx = (Cx - Px) / S

        const cx = mapContainer.offsetWidth / 2;
        const cy = mapContainer.offsetHeight / 2;

        finalX = (cx - mapState.pointX) / mapState.scale - 20;
        finalY = (cy - mapState.pointY) / mapState.scale - 20;
    }

    token.style.left = `${finalX}px`;
    token.style.top = `${finalY}px`;
    token.innerHTML = `<span>${type === 'pc' ? 'P' : 'E'}</span>`;

    // Only broadcast if created locally
    if (!isRemote) {
        broadcast({
            type: 'TOKEN_ADD',
            payload: { id: tokenId, type: type, x: finalX, y: finalY }
        });
    }

    // Drag Logic
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    token.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseFloat(token.style.left) || 0;
        startTop = parseFloat(token.style.top) || 0;
        token.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = (e.clientX - startX) / mapState.scale;
        const dy = (e.clientY - startY) / mapState.scale;

        token.style.left = `${startLeft + dx}px`;
        token.style.top = `${startTop + dy}px`;
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            token.style.cursor = 'grab';
            // Broadcast new position
            const newX = parseFloat(token.style.left);
            const newY = parseFloat(token.style.top);
            broadcast({
                type: 'TOKEN_MOVE',
                payload: { id: tokenId, x: newX, y: newY }
            });
        }
    });

    world.appendChild(token);
}

function createRemoteToken(data) {
    if (document.getElementById(data.id)) return;
    addToken(data.type, data.id, data.x, data.y, true);
}

function moveRemoteToken(data) {
    const token = document.getElementById(data.id);
    if (token) {
        token.style.left = `${data.x}px`;
        token.style.top = `${data.y}px`;
    }
}

// --- Tabs & Compendium ---
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab') + '-panel';
            document.getElementById(targetId).classList.add('active');
        });
    });
}

function setupCompendium() {
    const uploader = document.getElementById('rules-upload');
    const search = document.getElementById('rules-search');
    const content = document.getElementById('rules-content');

    let rulesData = [];

    uploader.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (revt) => {
            try {
                if (file.name.endsWith('.json')) {
                    const json = JSON.parse(revt.target.result);
                    if (Array.isArray(json)) {
                        rulesData = json;
                    } else {
                        rulesData = Object.keys(json).map(k => ({ title: k, text: JSON.stringify(json[k]) }));
                    }
                } else {
                    rulesData = [{ title: file.name, text: revt.target.result }];
                }
                renderRules(rulesData, content);
                addMessage("System", `Importate regole da ${file.name}`, "system");
            } catch (err) {
                console.error(err);
                addMessage("System", "Errore importazione file.", "system");
            }
        };
        reader.readAsText(file);
    });

    search.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = rulesData.filter(r =>
            (r.title && r.title.toLowerCase().includes(query)) ||
            (r.text && r.text.toLowerCase().includes(query))
        );
        renderRules(filtered, content);
    });
}

function renderRules(rules, container) {
    container.innerHTML = '';
    if (rules.length === 0) {
        container.innerHTML = '<p class="placeholder-text">Nessun risultato.</p>';
        return;
    }
    rules.forEach(rule => {
        const div = document.createElement('div');
        div.className = 'rule-item';
        div.innerHTML = `<h4>${rule.title || 'Senza Titolo'}</h4><p>${rule.text || ''}</p>`;
        container.appendChild(div);
    });
}

// Actions for UI
document.getElementById('toggle-mic').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const enabled = myStream.getAudioTracks()[0].enabled;
    if (enabled) {
        myStream.getAudioTracks()[0].enabled = false;
        btn.style.background = 'var(--danger)';
        btn.innerHTML = '<span class="material-icons-round">mic_off</span>';
    } else {
        myStream.getAudioTracks()[0].enabled = true;
        btn.style.background = 'rgba(0,0,0,0.6)';
        btn.innerHTML = '<span class="material-icons-round">mic</span>';
    }
});

document.getElementById('toggle-cam').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const enabled = myStream.getVideoTracks()[0].enabled;
    if (enabled) {
        myStream.getVideoTracks()[0].enabled = false;
        btn.style.background = 'var(--danger)';
        btn.innerHTML = '<span class="material-icons-round">videocam_off</span>';
    } else {
        myStream.getVideoTracks()[0].enabled = true;
        btn.style.background = 'rgba(0,0,0,0.6)';
        btn.innerHTML = '<span class="material-icons-round">videocam</span>';
    }
});

// Start
init();
