var firebaseConfig = {
  apiKey: "AIzaSyBhpJ1yAo92xLx6L3GyTVTuZsOXYYDZKWs",
  authDomain: "anon-ac806.firebaseapp.com",
  databaseURL: "https://anon-ac806-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "anon-ac806",
  storageBucket: "anon-ac806.appspot.com",
  messagingSenderId: "692292101984",
  appId: "1:692292101984:web:15ad6efcd0bc1411982005",
  measurementId: "G-1888WQV1PV"
};

var app = firebase.initializeApp(firebaseConfig);
var database = firebase.database();

let currentRoom = '';
let userId = 'anon_' + Math.random().toString(36).substr(2, 12);
let messagesRef = null;
let usersRef = null;
let userPresenceRef = null;
let heartbeatInterval = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

document.addEventListener('DOMContentLoaded', function() {
  localStorage.removeItem('chatRoom');
  
  document.getElementById('roomCode').addEventListener('keypress', function(e) {
    if(e.key === 'Enter') joinRoom();
  });
  
  document.getElementById('messageInput').addEventListener('keypress', function(e) {
    if(e.key === 'Enter') sendMessage();
  });

  document.getElementById('fileInput').addEventListener('change', handleFileSelect);
});

function joinRoom() {
  const code = document.getElementById('roomCode').value.trim();
  if (!code) {
    showNotification('Please enter a room code', 'error');
    return;
  }
  
  currentRoom = code;
  document.getElementById('currentRoom').textContent = currentRoom;
  messagesRef = database.ref('rooms/' + currentRoom + '/messages');
  usersRef = database.ref('rooms/' + currentRoom + '/users');
  
  userPresenceRef = usersRef.child(userId);
  userPresenceRef.set({
    name: userId.substr(5, 4),
    lastSeen: firebase.database.ServerValue.TIMESTAMP,
    online: true
  });
  
  userPresenceRef.onDisconnect().update({
    online: false,
    lastSeen: firebase.database.ServerValue.TIMESTAMP
  });
  
  startHeartbeat();
  
  document.getElementById('setupScreen').classList.add('d-none');
  document.getElementById('chatScreen').classList.remove('d-none');
  
  listenForMessages();
  listenForUsers();
  showNotification('Joined room');
  setTimeout(scrollToBottom, 100);
}

function listenForMessages() {
  if (!messagesRef) return;
  messagesRef.off();
  const container = document.getElementById('messagesContainer');
  container.innerHTML = '';
  messagesRef.on('child_added', snapshot => {
    displayMessage(snapshot.val());
  });
}

function listenForUsers() {
  if (!usersRef) return;
  
  usersRef.on('value', snapshot => {
    const users = snapshot.val();
    let onlineCount = 0;
    
    if (users) {
      const now = Date.now();
      Object.keys(users).forEach(userIdKey => {
        const user = users[userIdKey];
        if (user.online) {
          onlineCount++;
        } else if (user.lastSeen && (now - user.lastSeen > 30000)) {
          usersRef.child(userIdKey).remove();
        }
      });
    }
    
    document.getElementById('userCount').textContent = `👥 ${onlineCount} online`;
  });
}

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  
  heartbeatInterval = setInterval(() => {
    if (userPresenceRef) {
      userPresenceRef.update({
        lastSeen: firebase.database.ServerValue.TIMESTAMP,
        online: true
      });
    }
  }, 10000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text || !messagesRef) return;
  
  const message = {
    id: Date.now() + '_' + Math.random(),
    text: text,
    sender: userId,
    senderName: userId.substr(5, 4),
    timestamp: Date.now(),
    type: 'text'
  };
  
  messagesRef.push(message).then(() => {
    input.value = '';
    setTimeout(scrollToBottom, 50);
  }).catch(() => showNotification('Error sending message', 'error'));
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    showNotification('File too large (max 50MB)', 'error');
    e.target.value = '';
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(evt) {
    const message = {
      id: Date.now() + '_' + Math.random(),
      text: file.name,
      fileData: evt.target.result,
      fileType: file.type,
      sender: userId,
      senderName: userId.substr(5, 4),
      timestamp: Date.now(),
      type: 'file',
    };
    
    messagesRef.push(message).then(() => {
      showNotification('File sent');
      e.target.value = '';
      setTimeout(scrollToBottom, 50);
    }).catch(() => {
      showNotification('Error sending file', 'error');
      e.target.value = '';
    });
  }
  reader.readAsDataURL(file);
}

async function startRecording() {
  if (isRecording) return;
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };
    
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      
      reader.onload = function(evt) {
        const message = {
          id: Date.now() + '_' + Math.random(),
          text: 'Voice Message',
          fileData: evt.target.result,
          fileType: 'audio/webm',
          sender: userId,
          senderName: userId.substr(5, 4),
          timestamp: Date.now(),
          type: 'audio',
        };
        
        messagesRef.push(message).then(() => {
          showNotification('Voice message sent');
          setTimeout(scrollToBottom, 50);
        }).catch(() => {
          showNotification('Error sending voice message', 'error');
        });
      };
      
      reader.readAsDataURL(audioBlob);
      
      stream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
    isRecording = true;
    document.getElementById('audioBtn').classList.add('recording');
    document.getElementById('recordingIndicator').classList.remove('d-none');
  } catch (err) {
    showNotification('Microphone access denied', 'error');
  }
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) return;
  
  mediaRecorder.stop();
  isRecording = false;
  document.getElementById('audioBtn').classList.remove('recording');
  document.getElementById('recordingIndicator').classList.add('d-none');
}

function displayMessage(msg) {
  const container = document.getElementById('messagesContainer');
  
  if (msg.type === 'system') {
    if (msg.text.includes('joined')) {
      const username = msg.text.replace(' joined', '');
      showNotification(`${username} joined the room`);
    }
    return;
  }
  
  const div = document.createElement('div');
  div.className = 'message ' + (msg.sender === userId ? 'own' : 'other');
  
  const msgDate = new Date(msg.timestamp);
  const date = String(msgDate.getDate()).padStart(2, '0') + '/' + String(msgDate.getMonth() + 1).padStart(2, '0');
  const time = msgDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  const dateTime = date + ' ' + time;
  
  let html = `<strong>${msg.sender === userId ? 'You' : msg.senderName}</strong>`;
  
  if (msg.type === 'file') {
    if (msg.fileType && msg.fileType.startsWith('image/')) {
      html += `<img src="${msg.fileData}" alt="Image" class="image-preview" onclick="openMediaModal('${msg.fileData}', 'image', '${msg.text}')"/>`;
    } else if (msg.fileType && msg.fileType.startsWith('video/')) {
      html += `<video class="image-preview" onclick="openMediaModal('${msg.fileData}', 'video', '${msg.text}')"><source src="${msg.fileData}" type="${msg.fileType}"></video>`;
    } else if (msg.fileType && msg.fileType.startsWith('audio/')) {
      html += `<audio controls style="max-width: 200px; margin-top: 8px;" onclick="event.stopPropagation(); openMediaModal('${msg.fileData}', 'audio', '${msg.text}')"><source src="${msg.fileData}" type="${msg.fileType}"></audio>`;
    } else {
      html += `<div>📎 <a href="${msg.fileData}" download="${msg.text}" style="color:#6fa8dc;">${msg.text}</a></div>`;
    }
  } else if (msg.type === 'audio') {
    html += `<div style="margin-top: 5px;">🎤 Voice Message</div>`;
    html += `<audio controls style="max-width: 200px; margin-top: 8px;"><source src="${msg.fileData}" type="${msg.fileType}"></audio>`;
  } else {
    const linkifiedText = linkifyText(msg.text);
    html += `<div>${linkifiedText}</div>`;
  }
  
  html += `<div class="timestamp">${dateTime}</div>`;
  div.innerHTML = html;
  container.appendChild(div);
  scrollToBottom();
}

function linkifyText(text) {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:[^\s]*)?|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;
  
  return text.replace(urlRegex, function(url) {
    if (/\.{2,}/.test(url) || url === '.' || /^\.+$/.test(url)) {
      return url;
    }
    
    const domainPattern = /^(?:www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}(?:\/.*)?$/;
    if (!url.match(/^https?:\/\//i) && !domainPattern.test(url)) {
      return url;
    }
    
    let href = url;
    let displayUrl = url;
    
    if (!url.match(/^https?:\/\//i)) {
      if (url.match(/^www\./i)) {
        href = 'https://' + url;
      } else if (url.match(/\.[a-zA-Z]{2,}/)) {
        href = 'https://' + url;
      } else {
        return url;
      }
    }
    
    if (displayUrl.length > 50) {
      displayUrl = displayUrl.substring(0, 47) + '...';
    }
    
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #6fa8dc; text-decoration: underline;">${displayUrl}</a>`;
  });
}

function openMediaModal(src, type, name) {
  const modal = document.getElementById('mediaModal');
  const content = document.getElementById('mediaModalContent');
  const downloadBtn = document.getElementById('downloadBtn');
  content.innerHTML = '';
  
  downloadBtn.href = src;
  downloadBtn.download = name || 'download';
  
  if (type === 'image') {
    const img = document.createElement('img');
    img.src = src;
    img.alt = name;
    img.className = 'media-modal-content';
    content.appendChild(img);
    downloadBtn.style.display = 'flex';
  } else if (type === 'video') {
    const video = document.createElement('video');
    video.src = src;
    video.controls = true;
    video.className = 'media-modal-content';
    video.style.width = '100%';
    video.style.height = 'auto';
    content.appendChild(video);
    downloadBtn.style.display = 'flex';
  } else if (type === 'audio') {
    const audio = document.createElement('audio');
    audio.src = src;
    audio.controls = true;
    audio.style.width = '100%';
    audio.style.maxWidth = '500px';
    content.appendChild(audio);
    downloadBtn.style.display = 'flex';
  }
  
  modal.classList.add('active');
}

function closeMediaModal() {
  const modal = document.getElementById('mediaModal');
  const content = document.getElementById('mediaModalContent');
  
  const video = content.querySelector('video');
  const audio = content.querySelector('audio');
  if (video) video.pause();
  if (audio) audio.pause();
  
  modal.classList.remove('active');
  content.innerHTML = '';
}

function scrollToBottom() {
  const container = document.getElementById('messagesContainer');
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function leaveRoom() {
  if (messagesRef) {
    messagesRef.off();
  }
  
  if (userPresenceRef) {
    userPresenceRef.update({
      online: false,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
    userPresenceRef = null;
  }
  
  if (usersRef) {
    usersRef.off();
    usersRef = null;
  }
  
  stopHeartbeat();
  currentRoom = '';
  messagesRef = null;
  
  document.getElementById('chatScreen').classList.add('d-none');
