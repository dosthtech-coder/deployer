
// ——————————————————————————————————————————————————————————————————
// CONFIGURATION & CREDENTIALS
// ——————————————————————————————————————————————————————————————————
const CONFIG = {
    supabaseUrl: 'https://gqwvfohnqjmtojgswkxg.supabase.co',
    supabaseKey: 'sb_publishable_cI8YfYSibBXVQKHoo1onhA_CC6Aq6AG',
    cloudinaryName: 'dy7sh940z',
    cloudinaryPreset: 'ml_default',
    signalingUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'ws://localhost:8080'
        : 'wss://server-xyos.onrender.com'
};

// Initialize Supabase
const { createClient } = supabase;
const supabaseClient = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

// ——————————————————————————————————————————————————————————————————
// STATE MANAGEMENT
// ——————————————————————————————————————————————————————————————————
const state = {
    user: null,
    activeChat: null,
    users: [], // Array of user obects
    onlineUsers: new Set(), // Set of user IDs
    messages: [],
    ws: null,
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    callActive: false,
    candidateQueue: [] // Buffer for ICE candidates
};

// WebRTC Configuration
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// DOM Elements
// DOM Elements - Updated for new ID structure
// DOM Elements - Updated for new ID structure
const els = {
    loginScreen: document.getElementById('login-screen'),
    dashboardScreen: document.getElementById('dashboard-screen'),
    loginForm: document.getElementById('login-form'),
    loginError: document.getElementById('login-error'),
    userList: document.getElementById('user-list'),
    currentUserEmail: document.getElementById('current-user-email'),
    myAvatar: document.getElementById('my-avatar'),

    // Sidebar & Profile
    sidebar: document.querySelector('.sidebar'),
    sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),

    // Chat Area
    chatPlaceholder: document.getElementById('chat-placeholder'),
    activeChat: document.getElementById('active-chat'),
    chatPartnerName: document.getElementById('chat-partner-name'),
    partnerAvatar: document.getElementById('partner-avatar'),
    partnerStatus: document.getElementById('partner-status'),
    messagesContainer: document.getElementById('messages-container'),

    // Input Area
    mediaPreview: document.getElementById('media-preview'),
    defaultInputControls: document.getElementById('default-input-controls'),
    recordingControls: document.getElementById('recording-controls'),
    messageInput: document.getElementById('message-input'),
    mediaInput: document.getElementById('media-input'),

    // Emoji & UI
    emojiBtn: document.getElementById('emoji-btn'),
    emojiPicker: document.getElementById('emoji-picker-container'),

    // Buttons
    sendBtn: document.getElementById('send-btn'),
    attachBtn: document.getElementById('attach-btn'),
    recordBtn: document.getElementById('record-btn'),
    cancelRecordingBtn: document.getElementById('cancel-recording-btn'),
    sendAudioBtn: document.getElementById('send-audio-btn'),
    recordingTimer: document.getElementById('recording-timer'),

    // Call Elements
    callAudioBtn: document.getElementById('call-audio-btn'),
    callVideoBtn: document.getElementById('call-video-btn'),
    callOverlay: document.getElementById('call-overlay'),
    callModal: document.getElementById('call-overlay'), // Alias for compatibility
    callStatus: document.getElementById('call-status'),
    localVideo: document.getElementById('local-video'),
    remoteVideo: document.getElementById('remote-video'),
    hangupBtn: document.getElementById('hangup-btn'),
    muteAudioBtn: document.getElementById('mute-audio-btn'),
    muteVideoBtn: document.getElementById('mute-video-btn'),
    incomingCallAlert: document.getElementById('incoming-call-alert'),
    callerName: document.getElementById('caller-name'),
    acceptCallBtn: document.getElementById('accept-call-btn'),
    rejectCallBtn: document.getElementById('reject-call-btn'),

    backBtn: document.getElementById('back-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    app: document.getElementById('app')
};

// ——————————————————————————————————————————————————————————————————
// UI INTERACTIONS (EMOJI & TEXTAREA)
// ——————————————————————————————————————————————————————————————————
function initEmojiPicker() {
    const emojis = ['😀', '😂', '🥰', '😍', '😎', '😭', '😡', '👍', '👎', '🎉', '🔥', '❤️', '💔', '👀', '🚀', '💯', '👋', '🙏', '🤔', '🤫', '🤢', '🤮', '🤧', '🤒', '🤕', '🤠', '🤡', '👻', '💀', '👽', '🤖', '👾', '💩'];

    if (els.emojiPicker) {
        els.emojiPicker.innerHTML = emojis.map(e => `<div class="emoji-btn">${e}</div>`).join('');

        els.emojiPicker.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                els.messageInput.value += btn.textContent;
                els.emojiPicker.classList.add('hidden');
                els.messageInput.focus();
                autoResize();
            });
        });
    }

    if (els.emojiBtn) {
        els.emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            els.emojiPicker.classList.toggle('hidden');
        });
    }

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!els.emojiPicker.contains(e.target) && e.target !== els.emojiBtn) {
            els.emojiPicker.classList.add('hidden');
        }
    });
}

function autoResize() {
    const input = els.messageInput;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

if (els.messageInput) {
    els.messageInput.addEventListener('input', autoResize);
    initEmojiPicker();
}

// Global Extensions
state.pendingMedia = [];
state.isRecording = false;
let recordingTimerInterval;

// ——————————————————————————————————————————————————————————————————
// SIDEBAR LOGIC
// ——————————————————————————————————————————————————————————————————
if (els.sidebarToggleBtn) {
    els.sidebarToggleBtn.addEventListener('click', () => {
        els.sidebar.classList.toggle('collapsed');
    });
}

// ——————————————————————————————————————————————————————————————————
// MEDIA PREVIEW LOGIC
// ——————————————————————————————————————————————————————————————————
els.attachBtn.addEventListener('click', () => els.mediaInput.click());

els.mediaInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    state.pendingMedia = [...state.pendingMedia, ...files];
    renderMediaPreview();
    e.target.value = ''; // Reset
});

function renderMediaPreview() {
    if (!els.mediaPreview) return;

    els.mediaPreview.innerHTML = '';
    if (state.pendingMedia.length === 0) {
        els.mediaPreview.classList.add('hidden');
        return;
    }

    els.mediaPreview.classList.remove('hidden');
    state.pendingMedia.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'preview-item';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-media';
        removeBtn.innerHTML = '✕';
        removeBtn.onclick = () => {
            state.pendingMedia.splice(index, 1);
            renderMediaPreview();
        };

        let mediaEl;
        if (file.type.startsWith('image/')) {
            mediaEl = document.createElement('img');
        } else if (file.type.startsWith('video/')) {
            mediaEl = document.createElement('video');
        }

        if (mediaEl) {
            mediaEl.src = URL.createObjectURL(file);
            div.appendChild(mediaEl);
        }

        div.appendChild(removeBtn);
        els.mediaPreview.appendChild(div);
    });
}

// ——————————————————————————————————————————————————————————————————
// SEND MESSAGE (TEXT + MEDIA)
// ——————————————————————————————————————————————————————————————————
els.sendBtn.addEventListener('click', sendMessage);

els.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

async function sendMessage() {
    const text = els.messageInput.value.trim();
    const hasMedia = state.pendingMedia.length > 0;

    if (!text && !hasMedia) return;
    if (!state.currentChatId) return;

    // 1. Send Text
    if (text) {
        els.messageInput.value = '';
        els.messageInput.style.height = 'auto'; // Reset height

        renderMessage({
            sender_id: state.user.id,
            type: 'text',
            content: text,
            created_at: new Date().toISOString()
        });

        const { error } = await supabaseClient.from('messages').insert({
            chat_id: state.currentChatId,
            sender_id: state.user.id,
            type: 'text',
            content: text
        });

        if (error) {
            console.error('Send Msg Error:', error);
            showToast('Failed to deliver message', 'error');
        }
    }

    // 2. Send Media
    if (hasMedia) {
        const filesToSend = [...state.pendingMedia];
        state.pendingMedia = []; // Clear
        renderMediaPreview();

        showToast(`Uploading ${filesToSend.length} files...`, 'info');

        for (const file of filesToSend) {
            try {
                const url = await uploadToCloudinary(file);
                if (url) {
                    let type = 'text';
                    if (file.type.startsWith('image/')) type = 'image';
                    else if (file.type.startsWith('video/')) type = 'video';
                    else if (file.type.startsWith('audio/')) type = 'audio';

                    await supabaseClient.from('messages').insert({
                        chat_id: state.currentChatId,
                        sender_id: state.user.id,
                        type: type,
                        content: url
                    });
                }
            } catch (err) {
                console.error('Upload error', err);
                showToast('Failed to upload a file', 'error');
            }
        }
    }
}

// ——————————————————————————————————————————————————————————————————
// VOICE RECORDING (ADVANCED)
// ——————————————————————————————————————————————————————————————————
let mediaRecorder;
let audioChunks = [];
let startTime;

els.recordBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => audioChunks.push(event.data);

        mediaRecorder.start();
        startTime = Date.now();
        state.isRecording = true;

        // UI Toggle
        els.defaultInputControls.classList.add('hidden');
        els.recordingControls.classList.remove('hidden');

        // Timer
        clearInterval(recordingTimerInterval);
        recordingTimerInterval = setInterval(() => {
            const diff = Math.floor((Date.now() - startTime) / 1000);
            const m = Math.floor(diff / 60).toString().padStart(2, '0');
            const s = (diff % 60).toString().padStart(2, '0');
            els.recordingTimer.textContent = `${m}:${s}`;
        }, 1000);

    } catch (err) {
        showToast('Mic Access Denied', 'error');
    }
});

els.cancelRecordingBtn.addEventListener('click', () => {
    if (mediaRecorder && state.isRecording) {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    resetRecordingUI();
});

els.sendAudioBtn.addEventListener('click', () => {
    if (mediaRecorder && state.isRecording) {
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            showToast('Uploading voice note...', 'info');

            const url = await uploadToCloudinary(audioBlob);
            if (url) {
                await supabaseClient.from('messages').insert({
                    chat_id: state.currentChatId,
                    sender_id: state.user.id,
                    type: 'audio',
                    content: url
                });
            }
        };
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    resetRecordingUI();
});

function resetRecordingUI() {
    state.isRecording = false;
    clearInterval(recordingTimerInterval);
    els.recordingTimer.textContent = "00:00";
    els.recordingControls.classList.add('hidden');
    els.defaultInputControls.classList.remove('hidden');
}

async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CONFIG.cloudinaryPreset);

    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CONFIG.cloudinaryName}/auto/upload`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (!res.ok) {
            console.error('Cloudinary Error:', data);

            // Helpful error messages for common issues
            if (data.error?.message?.includes('unsigned uploads')) {
                showToast('⚠️ Admin Action Required: Enable Unsigned Uploads in Cloudinary Dashboard', 'error');
                console.warn('ACTION REQUIRED: Go to Cloudinary Settings > Upload > Upload presets > Enable "Unsigned uploading" for "ml_default" or create a new unsigned preset.');
            } else {
                showToast(`Upload failed: ${data.error?.message || 'Unknown error'}`, 'error');
            }
            throw new Error(data.error?.message || 'Upload failed');
        }
        return data.secure_url;
    } catch (err) {
        console.error('Upload Exception:', err);
        return null;
    }
}


// ——————————————————————————————————————————————————————————————————
// SIGNALS & WEBRTC (HARDENED)
// ——————————————————————————————————————————————————————————————————
async function initSignaling() {
    state.ws = new WebSocket(CONFIG.signalingUrl);

    state.ws.onopen = async () => {
        console.log('Connected to Signaling Server');
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            sendSignal('login', { userId: state.user.id, token: session.access_token });
        }
    };

    state.ws.onmessage = async (message) => {
        const data = JSON.parse(message.data);
        const { type, payload } = data;

        switch (type) {
            case 'login-success':
                console.log('Signaling Auth Success');
                break;
            case 'error':
                showToast(`Signal Error: ${payload}`, 'error');
                break;
            case 'user-offline':
                showToast('User is offline', 'warning');
                endCall(false);
                break;
            case 'call-request':
                handleIncomingCall(payload);
                break;
            case 'call-response':
                handleCallResponse(payload);
                break;
            case 'offer':
                await handleOffer(payload);
                break;
            case 'answer':
                await handleAnswer(payload);
                break;
            case 'candidate':
                await handleCandidate(payload);
                break;
            case 'hangup':
                showToast('Call ended', 'info');
                endCall(false);
                break;
        }
    };

    state.ws.onclose = () => {
        console.log('Signaling Disconnected');
        // Simple reconnect logic could go here
    };
}

function sendSignal(type, payload) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type, payload }));
    } else {
        showToast('Signaling disconnected', 'error');
    }
}

// 1. OUTGOING
els.callVideoBtn.addEventListener('click', () => startCall(true));
els.callAudioBtn.addEventListener('click', () => startCall(false));

async function startCall(videoEnabled) {
    if (!state.activeChat) return;

    state.callActive = true;
    state.isVideoCall = videoEnabled;
    state.candidateQueue = []; // Reset queue

    els.callModal.classList.remove('hidden');
    els.callStatus.textContent = 'Calling ' + state.activeChat.email + '...';

    try {
        state.localStream = await navigator.mediaDevices.getUserMedia({
            video: videoEnabled,
            audio: true
        });
        els.localVideo.srcObject = state.localStream;

        sendSignal('call-request', {
            targetUserId: state.activeChat.id,
            callerId: state.user.id,
            callerEmail: state.user.email,
            isVideo: videoEnabled
        });

    } catch (err) {
        console.error('Media Device Error:', err);
        showToast('Could not access camera/microphone', 'error');
        endCall();
    }
}

// 2. INCOMING
function handleIncomingCall(payload) {
    els.incomingCallAlert.classList.remove('hidden');
    els.callerName.textContent = payload.callerEmail;
    state.incomingCallData = payload;
    sendNotification('Incoming Call', `Call from ${payload.callerEmail}`);
}

els.acceptCallBtn.addEventListener('click', async () => {
    els.incomingCallAlert.classList.add('hidden');
    const { callerId, isVideo } = state.incomingCallData;

    state.callActive = true;
    state.activeChat = { id: callerId };
    state.candidateQueue = [];

    els.callModal.classList.remove('hidden');
    els.callStatus.textContent = 'Connecting...';

    try {
        state.localStream = await navigator.mediaDevices.getUserMedia({
            video: isVideo,
            audio: true
        });
        els.localVideo.srcObject = state.localStream;

        sendSignal('call-response', {
            targetUserId: callerId,
            accepted: true
        });

    } catch (err) {
        sendSignal('call-response', {
            targetUserId: callerId,
            accepted: false
        });
        endCall();
    }
});

els.rejectCallBtn.addEventListener('click', () => {
    els.incomingCallAlert.classList.add('hidden');
    if (state.incomingCallData) {
        sendSignal('call-response', {
            targetUserId: state.incomingCallData.callerId,
            accepted: false
        });
    }
    state.incomingCallData = null;
});

// 3. HANDSHAKE
async function handleCallResponse(payload) {
    if (payload.accepted) {
        els.callStatus.textContent = 'Connected';
        createPeerConnection(state.activeChat.id, true);
    } else {
        showToast('Call rejected', 'warning');
        endCall();
    }
}

async function createPeerConnection(targetUserId, isInitiator) {
    state.peerConnection = new RTCPeerConnection(rtcConfig);

    state.localStream.getTracks().forEach(track => {
        state.peerConnection.addTrack(track, state.localStream);
    });

    state.peerConnection.ontrack = (event) => {
        els.remoteVideo.srcObject = event.streams[0];
    };

    state.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignal('candidate', {
                targetUserId: targetUserId,
                candidate: event.candidate
            });
        }
    };

    state.peerConnection.onconnectionstatechange = () => {
        if (state.peerConnection.connectionState === 'disconnected') {
            showToast('Connection lost', 'error');
        }
    };

    if (isInitiator) {
        const offer = await state.peerConnection.createOffer();
        await state.peerConnection.setLocalDescription(offer);
        sendSignal('offer', {
            targetUserId: targetUserId,
            sourceUserId: state.user.id,
            offer: offer
        });
    }
}

async function handleOffer(payload) {
    if (!state.peerConnection) {
        state.peerConnection = new RTCPeerConnection(rtcConfig);
        state.candidateQueue = []; // Ensure clear

        if (state.localStream) {
            state.localStream.getTracks().forEach(track => {
                state.peerConnection.addTrack(track, state.localStream);
            });
        }

        state.peerConnection.ontrack = (event) => {
            els.remoteVideo.srcObject = event.streams[0];
        };

        state.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // Ensure we reply to correct person (sender of offer)
                // In payload, we patched to include sourceUserId
                const target = payload.sourceUserId || state.incomingCallData.callerId;
                if (target) {
                    sendSignal('candidate', {
                        targetUserId: target,
                        candidate: event.candidate
                    });
                }
            }
        };
    }

    await state.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.offer));

    // Process Buffered Candidates
    while (state.candidateQueue.length > 0) {
        const candidate = state.candidateQueue.shift();
        await state.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }

    const answer = await state.peerConnection.createAnswer();
    await state.peerConnection.setLocalDescription(answer);

    const target = payload.sourceUserId || state.incomingCallData.callerId;
    sendSignal('answer', {
        targetUserId: target,
        answer: answer
    });
}

async function handleAnswer(payload) {
    await state.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.answer));
}

async function handleCandidate(payload) {
    if (state.peerConnection && state.peerConnection.remoteDescription) {
        await state.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
    } else {
        // Buffer if remote desc not ready
        state.candidateQueue.push(payload.candidate);
    }
}

els.hangupBtn.addEventListener('click', () => endCall(true));

function endCall(emit = true) {
    if (state.callActive && emit && state.activeChat) {
        sendSignal('hangup', {
            targetUserId: state.activeChat.id
        });
    }

    state.callActive = false;
    els.callModal.classList.add('hidden');
    els.incomingCallAlert.classList.add('hidden');
    state.incomingCallData = null;

    if (state.localStream) {
        state.localStream.getTracks().forEach(track => track.stop());
        state.localStream = null;
    }

    if (state.peerConnection) {
        state.peerConnection.close();
        state.peerConnection = null;
    }
}

els.muteAudioBtn.addEventListener('click', () => {
    if (state.localStream) {
        const audioTrack = state.localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        els.muteAudioBtn.textContent = audioTrack.enabled ? 'Mute' : 'Unmute';
    }
});

els.muteVideoBtn.addEventListener('click', () => {
    if (state.localStream) {
        const videoTrack = state.localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        els.muteVideoBtn.textContent = videoTrack.enabled ? 'Stop Video' : 'Start Video';
    }
});

// ——————————————————————————————————————————————————————————————————
// INITIALIZATION & AUTH (RESTORED)
// ——————————————————————————————————————————————————————————————————
async function init() {
    // Check active session
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        handleLoginSuccess(session.user);
    }

    // Auth State Listener
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (session) {
            handleLoginSuccess(session.user);
        } else {
            handleLogout();
        }
    });

    // Notification Permission
    if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
}

init();

els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    els.loginError.textContent = 'Authenticating...';

    // 1. Try Login
    let { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        console.log('Login attempt failed, trying signup...', error);

        // 2. If Invalid Login or Not Found -> Try Signup
        if (error.message.includes('Invalid login') || error.message.includes('not found') || error.status === 400) {
            els.loginError.textContent = 'Creating new identity...';

            const { data: upData, error: upError } = await supabaseClient.auth.signUp({
                email,
                password,
            });

            if (upError) {
                console.error('Signup Error:', upError);
                els.loginError.textContent = upError.message;
            } else {
                if (upData.session) {
                    els.loginError.textContent = 'Identity Created. initializing...';
                    handleLoginSuccess(upData.user);
                } else {
                    els.loginError.textContent = ' confirmation email sent.';
                    showToast('Check email to confirm identity.', 'info');
                }
            }
        } else {
            els.loginError.textContent = error.message;
        }
    }
});

els.logoutBtn.addEventListener('click', async () => {
    if (state.presenceChannel) await state.presenceChannel.unsubscribe();
    await supabaseClient.auth.signOut();
    window.location.reload();
});

async function handleLoginSuccess(user) {
    state.user = user;
    els.loginScreen.classList.add('hidden');
    els.dashboardScreen.classList.remove('hidden');
    els.currentUserEmail.textContent = user.email;
    els.myAvatar.textContent = user.email.substring(0, 2).toUpperCase();

    showToast(`Neural Link Established`, 'success');

    // Upsert user profile
    await supabaseClient
        .from('users')
        .upsert({ id: user.id, email: user.email }, { onConflict: 'id' });

    initSignaling();
    fetchUsers();
    setupRealtime(); // Fix this next
    setupPresence();
}

function handleLogout() {
    state.user = null;
    els.loginScreen.classList.remove('hidden');
    els.dashboardScreen.classList.add('hidden');
    if (state.ws) state.ws.close();
}

// ——————————————————————————————————————————————————————————————————
// DATA & REALTIME
// ——————————————————————————————————————————————————————————————————
function setupRealtime() {
    // Subscribe to ALL new messages in public schema
    supabaseClient
        .channel('public:messages')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
        }, payload => {
            const newMsg = payload.new;
            console.log('Realtime MSG:', newMsg);

            // If it belongs to current active chat, append it
            if (state.currentChatId && newMsg.chat_id === state.currentChatId) {
                // Check if we already have it (optimistic update prevention)
                const exists = Array.from(els.messagesContainer.children).some(child => {
                    // This is a naive check, ideally we use IDs. 
                    // But for now, if content matches and it's from me, assume it's the optimistic one? 
                    // Better: just append. Duplicate handling can be added later if needed.
                    return false;
                });

                // Only render if we didn't just send it (or maybe just render it and let duplicate logic handle it later)
                // actually, renderMessage handles UI. 
                // To avoid duplicates from optimistic UI, we should probably clear input immediately 
                // and rely on this, OR allow optimistic and ignore this if ID matches.
                // For simplicity/reliability requested by user:
                // We will render it. If double rendering occurs, we'll fix later. 
                // BUT user said "Messages don't appear until refresh". 
                // So reliable rendering is priority.

                // Check if the last message in container is identical to avoid simple duplicates
                const lastMsg = els.messagesContainer.lastElementChild;
                if (lastMsg && lastMsg.textContent.includes(newMsg.content) && newMsg.sender_id === state.user.id) {
                    // Likely our optimistic update. Update status?
                    const status = lastMsg.querySelector('.message-status');
                    if (status) status.textContent = '✓✓'; // Delivered
                    return;
                }

                renderMessage(newMsg);
            }
            else if (newMsg.sender_id !== state.user.id) {
                showToast('New message received', 'info');
            }
        })
        .subscribe((status) => {
            console.log('Realtime Subscription:', status);
        });
}

function setupPresence() {
    state.presenceChannel = supabaseClient.channel('presence_room');
    state.presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const newState = state.presenceChannel.presenceState();
            state.onlineUsers.clear();
            for (const key in newState) {
                newState[key].forEach(u => state.onlineUsers.add(u.user_id));
            }
            renderUserList();
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
            newPresences.forEach(u => state.onlineUsers.add(u.user_id));
            renderUserList();
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
            leftPresences.forEach(u => state.onlineUsers.delete(u.user_id));
            renderUserList();
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await state.presenceChannel.track({
                    user_id: state.user.id,
                    email: state.user.email,
                    online_at: new Date().toISOString(),
                });
            }
        });
}

async function fetchUsers() {
    const { data } = await supabaseClient.from('users').select('*').neq('id', state.user.id);
    if (data) {
        state.users = data;
        renderUserList();
    }
}

function renderUserList() {
    els.userList.innerHTML = '';
    state.users.forEach(u => {
        const li = document.createElement('li');
        li.className = 'user-item glass-panel';
        const isOnline = state.onlineUsers.has(u.id);
        const initials = u.email.substring(0, 2).toUpperCase();

        li.innerHTML = `
            <div class="avatar-container small">
                <div class="avatar-initials">${initials}</div>
                <div class="status-dot ${isOnline ? 'online' : ''}"></div>
            </div>
            <div class="user-meta">
                <span class="user-email">${u.email}</span>
                <span class="status-text">${isOnline ? 'Online' : 'Offline'}</span>
            </div>
        `;
        li.onclick = () => startChat(u);
        if (state.activeChat && state.activeChat.id === u.id) li.classList.add('active');
        els.userList.appendChild(li);
    });
}

// Global Toast 
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function createToastContainer() {
    const div = document.createElement('div');
    div.id = 'toast-container';
    document.body.appendChild(div);
    return div;
}

function sendNotification(title, body) {
    if (Notification.permission === 'granted' && document.hidden) {
        new Notification(title, { body });
    }
}

// Send Message Helper Logic with Optimistic UI
async function startChat(targetUser) {
    state.activeChat = targetUser;
    els.chatPlaceholder.classList.add('hidden');
    els.activeChat.classList.remove('hidden');
    els.chatPartnerName.textContent = targetUser.email;
    els.partnerAvatar.textContent = targetUser.email.substring(0, 2).toUpperCase();
    renderUserList();

    const { data: chats } = await supabaseClient.from('chats').select('*')
        .or(`and(user1_id.eq.${state.user.id},user2_id.eq.${targetUser.id}),and(user1_id.eq.${targetUser.id},user2_id.eq.${state.user.id})`);

    let chatId;
    if (chats && chats.length > 0) chatId = chats[0].id;
    else {
        const { data: newChat } = await supabaseClient.from('chats').insert({ user1_id: state.user.id, user2_id: targetUser.id }).select().single();
        if (newChat) chatId = newChat.id;
    }

    state.currentChatId = chatId;
    fetchMessages(chatId);
}

async function fetchMessages(chatId) {
    els.messagesContainer.innerHTML = '';
    const { data } = await supabaseClient.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
    if (data) {
        data.forEach(msg => renderMessage(msg));
        scrollToBottom();
    }
}

function renderMessage(msg) {
    const div = document.createElement('div');
    const isMe = msg.sender_id === state.user.id;
    div.className = `message ${isMe ? 'sent' : 'received'}`;

    let contentHtml = msg.content;
    if (msg.type === 'image') contentHtml = `<img src="${msg.content}" alt="Image" loading="lazy" style="max-width:200px; border-radius:8px;">`;
    else if (msg.type === 'video') contentHtml = `<video src="${msg.content}" controls style="max-width:200px; border-radius:8px;"></video>`;
    else if (msg.type === 'audio') contentHtml = `<audio src="${msg.content}" controls></audio>`;

    div.innerHTML = `
        ${contentHtml}
        <span class="message-time">
            ${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            ${isMe ? '<span class="message-status">✓</span>' : ''}
        </span>
    `;
    els.messagesContainer.appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;
}
