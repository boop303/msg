function validateDomain() {
  const allowedDomains = [
    'boop303.github.io',    
    'your-custom-domain.com', 
    'localhost',               
    '127.0.0.1'
  
  const currentDomain = window.location.hostname.toLowerCase();
  const isAllowed = allowedDomains.some(domain => 
    currentDomain === domain || currentDomain.endsWith('.' + domain)
  );
  
  if (!isAllowed) {
    console.warn(`Unauthorized domain: ${currentDomain}`);
  }
  
  return isAllowed;
}

function getSecureFirebaseConfig() {
  // Domain validation first
  if (!validateDomain()) {
    console.error('Unauthorized domain access blocked');
    return null;
  }
  
  // Multi-layer obfuscated Firebase config
  // This splits your config across multiple encoded strings
  const configParts = [
    'eyJhcGlLZXkiOiJBSXphU3lCaHBKMXlBbzkyeEx4NkwzR3lUVlR1WnNPWFlZRFpLV3M',
    'iLCJhdXRoRG9tYWluIjoiYW5vbi1hYzgwNi5maXJlYmFzZWFwcC5jb20iLCJkYXRh',
    'YmFzZVVSTCI6Imh0dHBzOi8vYW5vbi1hYzgwNi1kZWZhdWx0LXJ0ZGIuYXNpYS1z',
    'b3V0aGVhc3QxLmZpcmViYXNlZGF0YWJhc2UuYXBwIiwicHJvamVjdElkIjoiYW5v',
    'bi1hYzgwNiIsInN0b3JhZ2VCdWNrZXQiOiJhbm9uLWFjODA2LmFwcHNwb3QuY29t',
    'IiwibWVzc2FnaW5nU2VuZGVySWQiOiI2OTIyOTIxMDE5ODQiLCJhcHBJZCI6IjE6',
    'NjkyMjkyMTAxOTg0OndlYjoxNWFkNmVmY2QwYmMxNDExOTgyMDA1In0='
  ];
  
  try {
    const encoded = configParts.join('');
    const decoded = atob(encoded);
    const config = JSON.parse(decoded);
    
    // Additional validation
    if (!config.apiKey || !config.projectId || config.apiKey.length < 30) {
      throw new Error('Invalid config structure');
    }
    
    return config;
  } catch (error) {
    console.error('Config decryption failed:', error);
    return null;
  }
}

function generatePasswordHash(password) {
  // Simple hash function for admin password validation
  let hash = 0;
  if (password.length === 0) return hash;
  
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to positive hex string
  return Math.abs(hash).toString(16);
}

// Initialize Firebase with secure config
var firebaseConfig = getSecureFirebaseConfig();

if (!firebaseConfig) {
  document.body.innerHTML = `
    <div style="text-align:center; margin-top:50px; color:#ff6b6b; padding:20px;">
      <h2>⚠️ Access Denied</h2>
      <p>This application is not authorized for this domain.</p>
      <p style="font-size:12px; color:#888; margin-top:10px;">
        Current domain: ${window.location.hostname}
      </p>
    </div>
  `;
} else {
  var app = firebase.initializeApp(firebaseConfig);
  var database = firebase.database();
}

// ==============================================
// APPLICATION VARIABLES
// ==============================================

let currentRoom = '';
let userId = 'anon_' + Math.random().toString(36).substr(2, 12);
let messagesRef = null;
let usersRef = null;
let userPresenceRef = null;
let heartbeatInterval = null;
let isAdmin = false;

// ==============================================
// SECURE ADMIN AUTHENTICATION
// ==============================================

function validateAdminKey(key) {
  if (!key || key.length < 6) return false;
  if (!validateDomain()) return false;
  
  // STEP 2: GENERATE YOUR ADMIN PASSWORD HASH
  // Go to browser console and run: generatePasswordHash("YourSecretPassword")
  // Replace the hash below with the output
  const expectedHash = '1335e4e1'; // 🔴 CHANGE THIS: Hash of your admin password
  
  const inputHash = generatePasswordHash(key);
  return inputHash === expectedHash;
}

// ==============================================
// INITIALIZATION AND EVENT LISTENERS
// ==============================================

document.addEventListener('DOMContentLoaded', function () {
  // Check for saved room
  const savedRoom = localStorage.getItem('chatRoom');
  if (savedRoom) {
    document.getElementById('roomCode').value = savedRoom;
    joinRoom(true);
  }
  
  // Set up event listeners
  document.getElementById('roomCode').addEventListener('keypress', function(e) {
    if(e.key === 'Enter') joinRoom();
  });
  document.getElementById('joinRoomCode').addEventListener('keypress', function(e) {
    if(e.key === 'Enter') joinExistingRoom();
  });
  document.getElementById('adminRoomCode').addEventListener('keypress', function(e) {
    if(e.key === 'Enter') createRoom();
  });
  document.getElementById('adminKey').addEventListener('keypress', function(e) {
    if(e.key === 'Enter') checkAdminAccess();
  });
  document.getElementById('messageInput').addEventListener('keypress', function(e) {
    if(e.key === 'Enter') sendMessage();
  });
  
  // Mobile keyboard handling
  const messageInput = document.getElementById('messageInput');
  
  messageInput.addEventListener('focus', function() {
    setTimeout(() => {
      scrollToBottom();
    }, 300);
  });
  
  // Handle viewport changes (keyboard show/hide)
  let initialViewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  
  function handleViewportChange() {
    if (window.visualViewport) {
      const currentHeight = window.visualViewport.height;
      const heightDiff = initialViewportHeight - currentHeight;
      
      if (heightDiff > 150) {
        document.body.style.height = currentHeight + 'px';
      } else {
        document.body.style.height = '100vh';
      }
    }
  }
  
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportChange);
  }
  
  window.addEventListener('resize', function() {
    setTimeout(scrollToBottom, 100);
  });
});

// ==============================================
// ADMIN INTERFACE FUNCTIONS
// ==============================================

function showAdminLogin() {
  document.getElementById('adminSection').style.display = 'block';
  document.getElementById('adminKey').focus();
}

function checkAdminAccess() {
  const enteredKey = document.getElementById('adminKey').value.trim();
  
  if (validateAdminKey(enteredKey)) {
    isAdmin = true;
    userId = 'admin_' + Math.random().toString(36).substr(2, 8);
    document.getElementById('userInterface').style.display = 'none';
    document.getElementById('adminSection').style.display = 'none';
    document.getElementById('adminInterface').style.display = 'block';
    showNotification('Admin access granted');
  } else {
    showNotification('Invalid admin credentials', 'error');
    document.getElementById('adminKey').value = '';
  }
}

function logoutAdmin() {
  isAdmin = false;
  userId = 'anon_' + Math.random().toString(36).substr(2, 12);
  document.getElementById('userInterface').style.display = 'block';
  document.getElementById('adminInterface').style.display = 'none';
  document.getElementById('adminKey').value = '';
  showNotification('Admin logged out');
}

function createRoom() {
  if (!isAdmin) {
    showNotification('Admin access required to create rooms', 'error');
    return;
  }
  
  let code = document.getElementById('adminRoomCode').value.trim().toUpperCase();
  if (!code) {
    showNotification('Please enter a room code', 'error');
    return;
  }
  
  // Ensure room code follows a valid format
  if (!code.startsWith('ROOM-') && code.length < 15) {
    code = 'ROOM-' + code;
  }
  
  // Check if room already exists
  const roomRef = database.ref('rooms/' + code);
  roomRef.once('value').then((snapshot) => {
    if (snapshot.exists()) {
      showNotification('Room already exists. Joining existing room...', 'error');
      joinRoomWithCode(code);
    } else {
      // Create new room with admin privileges
      roomRef.set({
        created: firebase.database.ServerValue.TIMESTAMP,
        creator: userId,
        adminOnly: true
      }).then(() => {
        showNotification('Room created successfully');
        joinRoomWithCode(code);
      }).catch((error) => {
        console.error('Room creation error:', error);
        showNotification('Error creating room', 'error');
      });
    }
  }).catch((error) => {
    console.error('Room check error:', error);
    showNotification('Error checking room status', 'error');
  });
}

function joinExistingRoom() {
  const code = document.getElementById('joinRoomCode').value.trim().toUpperCase();
  if (!code) {
    showNotification('Please enter a room code', 'error');
    return;
  }
  joinRoomWithCode(code);
}

function generateRoomCode() {
  if (!isAdmin) {
    showNotification('Admin access required', 'error');
    return;
  }
  const code = Math.random().toString(36).substr(2, 6).toUpperCase();
  document.getElementById('adminRoomCode').value = code;
  showNotification('Room code generated');
}

// ==============================================
// ROOM MANAGEMENT FUNCTIONS
// ==============================================

function joinRoom(auto = false) {
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!code) {
    showNotification('Please enter a room code', 'error');
    return;
  }
  joinRoomWithCode(code, auto);
}

function joinRoomWithCode(code, auto = false) {
  // Check if room exists before joining
  const roomRef = database.ref('rooms/' + code);
  roomRef.once('value').then((snapshot) => {
    if (!snapshot.exists()) {
      showNotification('Room does not exist. Only admins can create rooms.', 'error');
      return;
    }
    
    currentRoom = code;
    localStorage.setItem('chatRoom', currentRoom);
    document.getElementById('currentRoom').textContent = currentRoom;
    messagesRef = database.ref('rooms/' + currentRoom + '/messages');
    usersRef = database.ref('rooms/' + currentRoom + '/users');
    
    // Set up user presence
    userPresenceRef = usersRef.child(userId);
    const userName = isAdmin ? 'Admin' : userId.substr(5, 4);
    userPresenceRef.set({
      name: userName,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
      online: true,
      isAdmin: isAdmin
    });
    
    // Set up auto-disconnect on browser close
    userPresenceRef.onDisconnect().update({
      online: false,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
    
    // Start heartbeat to maintain presence
    startHeartbeat();
    
    document.querySelector('.room-setup').style.display = 'none';
    document.getElementById('chatArea').style.display = 'flex';
    listenForMessages();
    listenForUsers();
    
    if (!auto) {
      const joinMessage = isAdmin ? 'Admin joined' : userName + ' joined';
      sendSystemMessage(joinMessage);
      showNotification('Joined room');
    }
    
    // Ensure proper scrolling after joining
    setTimeout(scrollToBottom, 100);
  }).catch((error) => {
    console.error('Room access error:', error);
    showNotification('Error checking room status', 'error');
  });
}

function leaveRoom() {
  if (messagesRef) {
    const leaveMessage = isAdmin ? 'Admin left' : userId.substr(5,4) + ' left';
    sendSystemMessage(leaveMessage);
    messagesRef.off();
  }
  
  // Clean up user presence
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
  localStorage.removeItem('chatRoom');
  currentRoom = '';
  messagesRef = null;
  document.getElementById('chatArea').style.display = 'none';
  
  // Show appropriate interface based on admin status
  if (isAdmin) {
    document.getElementById('adminInterface').style.display = 'block';
  } else {
    document.querySelector('.room-setup').style.display = 'flex';
  }
  
  document.getElementById('messages').innerHTML = '<div class="status">Loading messages...</div>';
  document.getElementById('roomCode').value = '';
  document.getElementById('joinRoomCode').value = '';
  document.getElementById('adminRoomCode').value = '';
  document.getElementById('userCount').textContent = '👥 0 online';
  showNotification('Left room');
}

// ==============================================
// MESSAGE FUNCTIONS
// ==============================================

function listenForMessages() {
  if (!messagesRef) return;
  messagesRef.off();
  const container = document.getElementById('messages');
  container.innerHTML = '';
  messagesRef.on('child_added', snapshot => {
    displayMessage(snapshot.val());
  });
}

function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text || !messagesRef) return;
  
  const senderName = isAdmin ? 'Admin' : userId.substr(5, 4);
  const message = {
    id: Date.now() + '_' + Math.random(),
    text: text,
    sender: userId,
    senderName: senderName,
    timestamp: Date.now(),
    type: 'text',
    isAdmin: isAdmin
  };
  messagesRef.push(message).then(() => {
    input.value = '';
    setTimeout(scrollToBottom, 50);
  }).catch((error) => {
    console.error('Message send error:', error);
    showNotification('Error sending message', 'error');
  });
}

function sendSystemMessage(text) {
  if (!messagesRef) return;
  messagesRef.push({
    id: Date.now() + '_sys',
    text: text,
    sender: 'system',
    senderName: 'sys',
    timestamp: Date.now(),
    type: 'system'
  }).catch((error) => {
    console.error('System message error:', error);
  });
}

function displayMessage(msg) {
  const container = document.getElementById('messages');
  if (msg.type === 'system') {
    const div = document.createElement('div');
    div.className = 'status';
    div.textContent = msg.text;
    container.appendChild(div);
    scrollToBottom();
    return;
  }
  
  const div = document.createElement('div');
  div.className = 'message ' + (msg.sender === userId ? 'own' : 'other');
  
  // Add admin styling if message is from admin
  if (msg.isAdmin && msg.sender !== userId) {
    div.style.borderLeft = '3px solid #4CAF50';
  }
  
  const time = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  
  // Display name with admin badge
  const displayName = msg.sender === userId ? 'You' : (msg.isAdmin ? '🔑 ' + msg.senderName : msg.senderName);
  let html = `<div><strong>${displayName}</strong></div>`;
  
  if (msg.type === 'file') {
    if (msg.fileType && msg.fileType.startsWith('image/')) {
      html += `<div>📷 ${msg.text}</div><img src="${msg.fileData}" alt="${msg.text}" class="image-preview" onclick="window.open(this.src)"/>`;
    } else {
      html += `<div>📎 <a href="${msg.fileData}" download="${msg.text}" style="color:#ccc;">${msg.text}</a></div>`;
    }
  } else {
    // Make links clickable in text messages
    const linkifiedText = linkifyText(msg.text);
    html += `<div>${linkifiedText}</div>`;
  }
  html += `<div class="timestamp">${time}</div>`;
  div.innerHTML = html;
  container.appendChild(div);
  scrollToBottom();
}

// Function to detect and make links clickable
function linkifyText(text) {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;
  
  return text.replace(urlRegex, function(url) {
    let href = url;
    let displayUrl = url;
    
    // Add protocol if missing
    if (!url.match(/^https?:\/\//i)) {
      if (url.match(/^www\./i)) {
        href = 'https://' + url;
      } else if (url.match(/\.[a-zA-Z]{2,}/)) {
        href = 'https://' + url;
      } else {
        return url; // Not a valid URL
      }
    }
    
    // Truncate very long URLs for display
    if (displayUrl.length > 50) {
      displayUrl = displayUrl.substring(0, 47) + '...';
    }
    
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #6fa8dc; text-decoration: underline; word-break: break-all;">${displayUrl}</a>`;
  });
}

function scrollToBottom() {
  const container = document.getElementById('messages');
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

// ==============================================
// FILE UPLOAD FUNCTIONS
// ==============================================

document.getElementById('fileInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const maxSize = 50 * 1024 * 1024; // 50MB
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
      senderName: isAdmin ? 'Admin' : userId.substr(5, 4),
      timestamp: Date.now(),
      type: 'file',
      isAdmin: isAdmin
    };
    messagesRef.push(message).then(() => {
      showNotification('File sent');
      e.target.value = '';
      setTimeout(scrollToBottom, 50);
    }).catch((error) => {
      console.error('File send error:', error);
      showNotification('Error sending file', 'error');
      e.target.value = '';
    });
  };
  reader.readAsDataURL(file);
});

// ==============================================
// USER PRESENCE FUNCTIONS
// ==============================================

function listenForUsers() {
  if (!usersRef) return;
  
  usersRef.on('value', snapshot => {
    const users = snapshot.val();
    let onlineCount = 0;
    
    if (users) {
      // Count online users and clean up offline users older than 30 seconds
      const now = Date.now();
      Object.keys(users).forEach(userIdKey => {
        const user = users[userIdKey];
        if (user.online) {
          onlineCount++;
        } else if (user.lastSeen && (now - user.lastSeen > 30000)) {
          // Remove user if offline for more than 30 seconds
          usersRef.child(userIdKey).remove().catch(() => {
            // Ignore cleanup errors
          });
        }
      });
    }
    
    // Update user count display
    const userCountEl = document.getElementById('userCount');
    userCountEl.textContent = `👥 ${onlineCount} online`;
  });
}

function startHeartbeat() {
  // Clear any existing heartbeat
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  
  // Send heartbeat every 10 seconds
  heartbeatInterval = setInterval(() => {
    if (userPresenceRef) {
      userPresenceRef.update({
        lastSeen: firebase.database.ServerValue.TIMESTAMP,
        online: true
      }).catch(() => {
        // Ignore heartbeat errors
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

// ==============================================
// UTILITY FUNCTIONS
// ==============================================

function showNotification(text, type='success') {
  const noti = document.getElementById('notification');
  noti.textContent = text;
  noti.className = 'notification' + (type === 'error' ? ' error' : '');
  noti.style.display = 'block';
  clearTimeout(noti._timeout);
  noti._timeout = setTimeout(() => noti.style.display = 'none', 3000);
}

// ==============================================
// BROWSER EVENT HANDLERS
// ==============================================

// Enhanced browser close/tab close detection
window.addEventListener('beforeunload', (e) => {
  if (messagesRef && currentRoom && userPresenceRef) {
    // Mark user as offline immediately
    userPresenceRef.update({
      online: false,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
    
    sendSystemMessage(isAdmin ? 'Admin left' : userId.substr(5,4) + ' left');
    stopHeartbeat();
  }
});

// Handle page visibility changes (tab switching, minimizing)
document.addEventListener('visibilitychange', () => {
  if (userPresenceRef) {
    if (document.hidden) {
      // User switched tab or minimized - reduce heartbeat frequency
      stopHeartbeat();
      // Set up slower heartbeat for background tabs
      heartbeatInterval = setInterval(() => {
        if (userPresenceRef) {
          userPresenceRef.update({
            lastSeen: firebase.database.ServerValue.TIMESTAMP,
            online: true
          }).catch(() => {
            // Ignore background heartbeat errors
          });
        }
      }, 30000); // Every 30 seconds when tab is hidden
    } else {
      // User returned to tab - resume normal heartbeat
      startHeartbeat();
    }
  }
});

// Handle focus/blur events for additional presence accuracy
window.addEventListener('focus', () => {
  if (userPresenceRef) {
    userPresenceRef.update({
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
      online: true
    }).catch(() => {
      // Ignore focus heartbeat errors
    });
    startHeartbeat();
  }
});

window.addEventListener('blur', () => {
  if (userPresenceRef) {
    stopHeartbeat();
    // Set slower heartbeat when window loses focus
    heartbeatInterval = setInterval(() => {
      if (userPresenceRef) {
        userPresenceRef.update({
          lastSeen: firebase.database.ServerValue.TIMESTAMP,
          online: true
        }).catch(() => {
          // Ignore blur heartbeat errors
        });
      }
    }, 25000);
  }
});

// ==============================================
// CONSOLE HELPER FOR ADMIN SETUP
// ==============================================

// Helper function to generate admin password hash
// Run in browser console: generatePasswordHash("YourSecretPassword")
window.generatePasswordHash = generatePasswordHash;

console.log('🔧 Admin Setup Helper:');
console.log('To generate your admin password hash, run:');
console.log('generatePasswordHash("YourSecretPassword")');
console.log('Then replace the expectedHash in validateAdminKey function');
