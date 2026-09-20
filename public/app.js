// TEACHER AI - FIREBASE GOOGLE AUTHENTICATION & FIRESTORE ALLOWLIST ACCESS CONTROL
import { 
  auth, 
  db,
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "./firebaseConfig.js";

document.addEventListener('DOMContentLoaded', () => {
  // Authentication & State
  let currentUser = null;
  let threads = [];
  let activeThreadId = null;
  let viewMode = 'tabbed'; // 'tabbed' or 'grid'

  // DOM Elements - Auth & Restricted Overlays
  const authOverlay = document.getElementById('authOverlay');
  const accessRestrictedOverlay = document.getElementById('accessRestrictedOverlay');
  const restrictedEmailDisplay = document.getElementById('restrictedEmailDisplay');
  const restrictedLogoutBtn = document.getElementById('restrictedLogoutBtn');
  const appLayout = document.getElementById('appLayout');
  const googleSignInBtn = document.getElementById('googleSignInBtn');

  // DOM Elements - User Profile Displays
  const sidebarUserName = document.getElementById('sidebarUserName');
  const sidebarUserEmail = document.getElementById('sidebarUserEmail');
  const sidebarUserAvatar = document.getElementById('sidebarUserAvatar');
  const topUserName = document.getElementById('topUserName');
  const topUserAvatar = document.getElementById('topUserAvatar');
  const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
  const topLogoutBtn = document.getElementById('topLogoutBtn');

  // DOM Elements - Sidebar & Backdrop
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const openSidebarBtn = document.getElementById('openSidebarBtn');
  const closeSidebarBtn = document.getElementById('closeSidebarBtn');
  const newTopicBtn = document.getElementById('newTopicBtn');
  const historySearch = document.getElementById('historySearch');
  const historyList = document.getElementById('historyList');
  const emptyHistory = document.getElementById('emptyHistory');
  const threadCount = document.getElementById('threadCount');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // DOM Elements - Header & Views
  const heroView = document.getElementById('heroView');
  const threadView = document.getElementById('threadView');
  const currentTopicBadge = document.getElementById('currentTopicBadge');
  const activeTopicTitle = document.getElementById('activeTopicTitle');
  const activeTopicActions = document.getElementById('activeTopicActions');
  const viewTabbedBtn = document.getElementById('viewTabbedBtn');
  const viewGridBtn = document.getElementById('viewGridBtn');
  const copyFullPlanBtn = document.getElementById('copyFullPlanBtn');
  const printPlanBtn = document.getElementById('printPlanBtn');
  const deleteCurrentThreadBtn = document.getElementById('deleteCurrentThreadBtn');

  // DOM Elements - Hero Input
  const topicInput = document.getElementById('topicInput');
  const generateBtn = document.getElementById('generateBtn');
  const promptChips = document.querySelectorAll('.chip-btn');

  // DOM Elements - Structured Cards
  const greetingText = document.getElementById('greetingText');
  const levelTabsHeader = document.getElementById('levelTabsHeader');
  const levelTabBtns = document.querySelectorAll('.level-tab-btn');
  const levelCardsContainer = document.getElementById('levelCardsContainer');
  const weakCard = document.getElementById('weakCard');
  const mediumCard = document.getElementById('mediumCard');
  const intelligentCard = document.getElementById('intelligentCard');
  const weakHowToExplain = document.getElementById('weakHowToExplain');
  const mediumHowToExplain = document.getElementById('mediumHowToExplain');
  const intelligentHowToExplain = document.getElementById('intelligentHowToExplain');
  const weakExercises = document.getElementById('weakExercises');
  const mediumExercises = document.getElementById('mediumExercises');
  const intelligentExercises = document.getElementById('intelligentExercises');
  const teachingTipsText = document.getElementById('teachingTipsText');

  // DOM Elements - Chat Thread
  const chatMessagesList = document.getElementById('chatMessagesList');
  const followUpInput = document.getElementById('followUpInput');
  const sendFollowUpBtn = document.getElementById('sendFollowUpBtn');
  const chatChips = document.querySelectorAll('.chat-chip');

  // Global Loader & Toast
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loaderTitle = document.getElementById('loaderTitle');
  const toastContainer = document.getElementById('toastContainer');

  // Initialize App & Firebase Auth Observer
  init();

  function init() {
    setupFirebaseAuth();
    setupEventListeners();
  }

  // --- FIRESTORE EMAIL ALLOWLIST ACCESS CHECK ---
  async function isUserEmailAllowed(userEmail) {
    if (!userEmail) return false;
    const cleanEmail = userEmail.toLowerCase().trim();

    try {
      // 1. Direct Document ID check (collection: "allowedUsers", doc ID: "teacher@school.edu")
      const docRef = doc(db, "allowedUsers", cleanEmail);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return true;
      }

      // 2. Query check (field "email" == cleanEmail)
      const q = query(collection(db, "allowedUsers"), where("email", "==", cleanEmail));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        return true;
      }

      return false;
    } catch (err) {
      console.warn("Firestore allowlist lookup error:", err);
      return false;
    }
  }

  // --- FIREBASE AUTHENTICATION OBSERVER & HANDLERS ---
  function setupFirebaseAuth() {
    // 1. Google Sign-In Entry Point Button
    if (googleSignInBtn) {
      googleSignInBtn.addEventListener('click', async () => {
        try {
          googleSignInBtn.disabled = true;
          googleSignInBtn.style.opacity = '0.7';
          await signInWithPopup(auth, googleProvider);
        } catch (error) {
          googleSignInBtn.disabled = false;
          googleSignInBtn.style.opacity = '1';
          console.error("Firebase Google Sign-In Error:", error);
          if (error.code !== 'auth/popup-closed-by-user') {
            showToast(error.message || "Failed to sign in with Google.", "error");
          }
        }
      });
    }

    // 2. Firebase Auth State Observer with Firestore Allowlist Verification
    onAuthStateChanged(auth, async (user) => {
      if (googleSignInBtn) {
        googleSignInBtn.disabled = false;
        googleSignInBtn.style.opacity = '1';
      }

      if (user) {
        showLoading("Verifying Account Access Permissions...", "Checking your email against the Firestore allowedUsers list.");

        const userEmail = user.email ? user.email.toLowerCase().trim() : '';
        const allowed = await isUserEmailAllowed(userEmail);
        hideLoading();

        if (allowed) {
          // User email is in allowedUsers Firestore collection!
          currentUser = {
            name: user.displayName || user.email.split('@')[0],
            email: user.email,
            photoURL: user.photoURL,
            uid: user.uid
          };
          onLoginSuccess(currentUser);
        } else {
          // User email is NOT allowed -> Show Access Restricted Screen
          currentUser = null;
          showAccessRestrictedScreen(user.email);
        }
      } else {
        // User signed out -> Show Sign-In Overlay
        currentUser = null;
        threads = [];
        activeThreadId = null;
        showAuthModal();
      }
    });

    // 3. Logout Handlers (Works from Top Nav, Sidebar & Access Restricted Screen)
    const handleFirebaseLogout = async () => {
      try {
        await signOut(auth);
        showToast("Signed out securely.");
      } catch (err) {
        console.error("Logout Error:", err);
        showToast("Error signing out.", "error");
      }
    };

    if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener('click', handleFirebaseLogout);
    if (topLogoutBtn) topLogoutBtn.addEventListener('click', handleFirebaseLogout);
    if (restrictedLogoutBtn) restrictedLogoutBtn.addEventListener('click', handleFirebaseLogout);
  }

  function onLoginSuccess(user) {
    // Notify backend alert endpoint
    fetch('/api/notify-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: user.name, email: user.email })
    }).catch(err => console.error('Login notification error:', err));

    // Update Profile Views & Avatars
    const initial = (user.name || user.email || 'T').charAt(0).toUpperCase();
    
    if (user.photoURL) {
      sidebarUserAvatar.style.backgroundImage = `url(${user.photoURL})`;
      sidebarUserAvatar.textContent = '';
      topUserAvatar.style.backgroundImage = `url(${user.photoURL})`;
      topUserAvatar.textContent = '';
    } else {
      sidebarUserAvatar.style.backgroundImage = 'none';
      sidebarUserAvatar.textContent = initial;
      topUserAvatar.style.backgroundImage = 'none';
      topUserAvatar.textContent = initial;
    }

    sidebarUserName.textContent = user.name || 'Teacher Account';
    sidebarUserEmail.textContent = user.email;
    topUserName.textContent = (user.name || user.email.split('@')[0]).split(' ')[0];

    // Hide Auth & Restricted screens, Show App
    authOverlay.style.display = 'none';
    accessRestrictedOverlay.style.display = 'none';
    appLayout.style.display = 'flex';

    // Load User-Specific Isolated Threads
    loadThreadsFromStorage();
    renderSidebar();
    showHeroView();
  }

  function showAuthModal() {
    authOverlay.style.display = 'flex';
    accessRestrictedOverlay.style.display = 'none';
    appLayout.style.display = 'none';
  }

  function showAccessRestrictedScreen(email) {
    if (restrictedEmailDisplay) restrictedEmailDisplay.textContent = email || 'your account';
    authOverlay.style.display = 'none';
    appLayout.style.display = 'none';
    accessRestrictedOverlay.style.display = 'flex';
  }

  // --- MOBILE SIDEBAR DRAWER LOGIC ---
  function openMobileSidebar() {
    sidebar.classList.add('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
  }

  function closeMobileSidebar() {
    sidebar.classList.remove('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
  }

  // --- LOCAL STORAGE LOGIC (ISOLATED PER USER EMAIL) ---
  function getUserStorageKey() {
    if (!currentUser || !currentUser.email) return 'teacher_ai_threads_guest';
    const safeEmail = currentUser.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `teacher_ai_threads_${safeEmail}`;
  }

  function loadThreadsFromStorage() {
    try {
      const storageKey = getUserStorageKey();
      const stored = localStorage.getItem(storageKey);
      threads = stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Failed to load user isolated threads', e);
      threads = [];
    }
  }

  function saveThreadsToStorage() {
    try {
      const storageKey = getUserStorageKey();
      localStorage.setItem(storageKey, JSON.stringify(threads));
    } catch (e) {
      console.error('Failed to save user isolated threads', e);
    }
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    if (openSidebarBtn) openSidebarBtn.addEventListener('click', openMobileSidebar);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeMobileSidebar);
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeMobileSidebar);

    newTopicBtn.addEventListener('click', () => {
      showHeroView();
      closeMobileSidebar();
    });

    historySearch.addEventListener('input', (e) => {
      renderSidebar(e.target.value.toLowerCase());
    });

    clearHistoryBtn.addEventListener('click', () => {
      if (threads.length === 0) return;
      if (confirm(`Are you sure you want to clear private history for ${currentUser.email}? This action cannot be undone.`)) {
        threads = [];
        saveThreadsToStorage();
        renderSidebar();
        showHeroView();
        showToast('Private history cleared.');
      }
    });

    generateBtn.addEventListener('click', () => {
      const val = topicInput.value.trim();
      if (!val) {
        showToast('Please enter a topic to generate a plan.', 'error');
        topicInput.focus();
        return;
      }
      handleGenerateNewTopic(val);
    });

    topicInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        generateBtn.click();
      }
    });

    promptChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const topic = chip.getAttribute('data-topic');
        topicInput.value = topic;
        handleGenerateNewTopic(topic);
      });
    });

    viewTabbedBtn.addEventListener('click', () => setViewMode('tabbed'));
    viewGridBtn.addEventListener('click', () => setViewMode('grid'));

    levelTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetLevel = btn.getAttribute('data-level');
        levelTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        [weakCard, mediumCard, intelligentCard].forEach(card => card.classList.remove('active'));
        if (targetLevel === 'weak') weakCard.classList.add('active');
        if (targetLevel === 'medium') mediumCard.classList.add('active');
        if (targetLevel === 'intelligent') intelligentCard.classList.add('active');
      });
    });

    copyFullPlanBtn.addEventListener('click', copyFullLessonPlan);
    printPlanBtn.addEventListener('click', () => window.print());

    deleteCurrentThreadBtn.addEventListener('click', () => {
      if (!activeThreadId) return;
      if (confirm('Delete this topic thread from your private history?')) {
        deleteThread(activeThreadId);
      }
    });

    document.querySelectorAll('.copy-sec-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        const thread = getActiveThread();
        if (!thread) return;

        let contentText = '';
        if (target === 'weak') contentText = `WEAK STUDENTS:\nHow to explain: ${thread.initialResponse.weak.howToExplain}\n\nExercises:\n` + thread.initialResponse.weak.exercises.join('\n');
        if (target === 'medium') contentText = `MEDIUM STUDENTS:\nHow to explain: ${thread.initialResponse.medium.howToExplain}\n\nExercises:\n` + thread.initialResponse.medium.exercises.join('\n');
        if (target === 'intelligent') contentText = `INTELLIGENT STUDENTS:\nHow to explain: ${thread.initialResponse.intelligent.howToExplain}\n\nExercises:\n` + thread.initialResponse.intelligent.exercises.join('\n');

        copyToClipboard(contentText);
        showToast(`Copied ${target.toUpperCase()} section to clipboard!`);
      });
    });

    sendFollowUpBtn.addEventListener('click', handleSendFollowUp);

    followUpInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendFollowUpBtn.click();
      }
    });

    chatChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const msg = chip.getAttribute('data-msg');
        if (!msg) return; // skip the relatedResourcesBtn (no data-msg)
        followUpInput.value = msg;
        handleSendFollowUp();
      });
    });

    // --- RELATED RESOURCES BUTTON ---
    const relatedResourcesBtn = document.getElementById('relatedResourcesBtn');
    const relatedResourcesPanel = document.getElementById('relatedResourcesPanel');
    const resourcesTopicLabel = document.getElementById('resourcesTopicLabel');
    const resourcesList = document.getElementById('resourcesList');
    const closeResourcesPanel = document.getElementById('closeResourcesPanel');

    if (relatedResourcesBtn) {
      relatedResourcesBtn.addEventListener('click', () => {
        const thread = threads.find(t => t.id === activeThreadId);
        const topic = (thread && thread.topic) ? thread.topic : (topicInput.value.trim() || 'teaching');
        const encoded = encodeURIComponent(topic);

        const links = [
          {
            emoji: '🔍',
            label: 'Search Google for activities',
            url: `https://www.google.com/search?q=${encoded}+teaching+activities`
          },
          {
            emoji: '📄',
            label: 'Printable worksheets (Google)',
            url: `https://www.google.com/search?q=${encoded}+worksheets+printable`
          },
          {
            emoji: '📌',
            label: 'Pinterest teaching ideas',
            url: `https://www.pinterest.com/search/pins/?q=${encoded}+teaching+ideas`
          },
          {
            emoji: '🎥',
            label: 'YouTube lesson explanations',
            url: `https://www.youtube.com/results?search_query=${encoded}+lesson+explanation`
          }
        ];

        resourcesTopicLabel.textContent = topic;
        resourcesList.innerHTML = links.map(link =>
          `<li><a class="resource-link" href="${link.url}" target="_blank" rel="noopener noreferrer">${link.emoji} ${link.label}</a></li>`
        ).join('');

        relatedResourcesPanel.style.display = 'block';
        relatedResourcesPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }

    if (closeResourcesPanel) {
      closeResourcesPanel.addEventListener('click', () => {
        relatedResourcesPanel.style.display = 'none';
      });
    }
  }

  // --- API ACTIONS ---
  async function handleGenerateNewTopic(topicName) {
    showLoading('Generating Differentiated Lesson Plan...', 'Creating tailored explanations & 5+ exercises for Weak, Medium, and Intelligent tiers.');
    
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topicName })
      });

      const result = await response.json();
      hideLoading();

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to generate content from server.');
      }

      const newThread = {
        id: 'thread_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        topic: topicName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        initialResponse: result.data,
        messages: []
      };

      threads.unshift(newThread);
      saveThreadsToStorage();
      renderSidebar();

      topicInput.value = '';
      loadThread(newThread.id);
      showToast('Lesson plan generated successfully!');

    } catch (err) {
      hideLoading();
      console.error('API Error:', err);
      showToast(err.message || 'Error connecting to TEACHER AI backend.', 'error');
    }
  }

  async function handleSendFollowUp() {
    const messageText = followUpInput.value.trim();
    if (!messageText) return;

    const thread = getActiveThread();
    if (!thread) return;

    const userMsgObj = {
      id: 'msg_' + Date.now(),
      sender: 'user',
      content: messageText,
      timestamp: Date.now()
    };

    thread.messages.push(userMsgObj);
    thread.updatedAt = Date.now();
    saveThreadsToStorage();
    renderSidebar();

    appendChatBubble(userMsgObj);
    followUpInput.value = '';
    scrollToBottomChat();

    sendFollowUpBtn.disabled = true;
    followUpInput.disabled = true;

    const tempThinkingId = 'thinking_' + Date.now();
    const thinkingBubble = document.createElement('div');
    thinkingBubble.className = 'chat-bubble assistant thinking';
    thinkingBubble.id = tempThinkingId;
    thinkingBubble.innerHTML = `
      <div class="chat-avatar"><i class="fa-solid fa-graduation-cap"></i></div>
      <div class="chat-content"><i class="fa-solid fa-circle-notch fa-spin"></i> TEACHER AI is processing follow-up...</div>
    `;
    chatMessagesList.appendChild(thinkingBubble);
    scrollToBottomChat();

    try {
      const response = await fetch('/api/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: thread.topic,
          initialResponse: thread.initialResponse,
          history: thread.messages.slice(0, -1),
          message: messageText
        })
      });

      const result = await response.json();
      
      const tempElement = document.getElementById(tempThinkingId);
      if (tempElement) tempElement.remove();

      sendFollowUpBtn.disabled = false;
      followUpInput.disabled = false;
      followUpInput.focus();

      if (!result.success || !result.reply) {
        throw new Error(result.error || 'Failed to get follow-up response.');
      }

      const assistantMsgObj = {
        id: 'msg_' + Date.now(),
        sender: 'assistant',
        content: result.reply,
        timestamp: Date.now()
      };

      thread.messages.push(assistantMsgObj);
      thread.updatedAt = Date.now();
      saveThreadsToStorage();
      renderSidebar();

      appendChatBubble(assistantMsgObj);
      scrollToBottomChat();

    } catch (err) {
      const tempElement = document.getElementById(tempThinkingId);
      if (tempElement) tempElement.remove();

      sendFollowUpBtn.disabled = false;
      followUpInput.disabled = false;
      console.error('Follow-up error:', err);
      showToast(err.message || 'Failed to send follow-up message.', 'error');
    }
  }

  // --- RENDERING & NAVIGATION ---
  function showHeroView() {
    activeThreadId = null;
    heroView.style.display = 'flex';
    threadView.style.display = 'none';
    currentTopicBadge.style.display = 'none';
    activeTopicActions.style.display = 'none';
    renderSidebar();
  }

  function loadThread(threadId) {
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;

    activeThreadId = thread.id;
    
    activeTopicTitle.textContent = thread.topic;
    currentTopicBadge.style.display = 'inline-flex';
    activeTopicActions.style.display = 'flex';

    const data = thread.initialResponse;
    greetingText.textContent = data.greeting || `Hello Teacher! Here is your differentiated plan for "${thread.topic}".`;

    weakHowToExplain.textContent = data.weak?.howToExplain || 'No explanation available.';
    renderExerciseList(weakExercises, data.weak?.exercises || []);

    mediumHowToExplain.textContent = data.medium?.howToExplain || 'No explanation available.';
    renderExerciseList(mediumExercises, data.medium?.exercises || []);

    intelligentHowToExplain.textContent = data.intelligent?.howToExplain || 'No explanation available.';
    renderExerciseList(intelligentExercises, data.intelligent?.exercises || []);

    teachingTipsText.textContent = data.teachingTips || 'No general strategy tips provided.';

    chatMessagesList.innerHTML = '';
    if (Array.isArray(thread.messages) && thread.messages.length > 0) {
      thread.messages.forEach(msg => appendChatBubble(msg));
    }

    heroView.style.display = 'none';
    threadView.style.display = 'flex';

    renderSidebar();
    closeMobileSidebar();
  }

  function renderExerciseList(container, exercises) {
    container.innerHTML = '';
    if (!exercises || exercises.length === 0) {
      container.innerHTML = '<p class="text-dim">No exercises provided.</p>';
      return;
    }

    exercises.forEach((exText, idx) => {
      const item = document.createElement('div');
      item.className = 'exercise-item';

      const cleanText = exText.replace(/^\d+[\.\)]\s*/, '');

      item.innerHTML = `
        <div class="exercise-text"><strong>Q${idx + 1}.</strong> ${escapeHtml(cleanText)}</div>
        <button class="copy-ex-btn touch-target" title="Copy Question"><i class="fa-solid fa-copy"></i></button>
      `;

      item.querySelector('.copy-ex-btn').addEventListener('click', () => {
        copyToClipboard(`Q${idx + 1}. ${cleanText}`);
        showToast(`Copied Exercise ${idx + 1}!`);
      });

      container.appendChild(item);
    });
  }

  function appendChatBubble(msgObj) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${msgObj.sender}`;
    
    const icon = msgObj.sender === 'user' ? '<i class="fa-solid fa-user-tie"></i>' : '<i class="fa-solid fa-graduation-cap"></i>';
    
    let renderedHTML = escapeHtml(msgObj.content);
    if (msgObj.sender === 'assistant' && typeof marked !== 'undefined') {
      renderedHTML = marked.parse(msgObj.content);
    }

    bubble.innerHTML = `
      <div class="chat-avatar">${icon}</div>
      <div class="chat-content">${renderedHTML}</div>
    `;

    chatMessagesList.appendChild(bubble);
  }

  function renderSidebar(searchFilter = '') {
    historyList.innerHTML = '';

    const filtered = threads.filter(t => t.topic.toLowerCase().includes(searchFilter));
    threadCount.textContent = threads.length;

    if (filtered.length === 0) {
      emptyHistory.style.display = 'flex';
      return;
    }

    emptyHistory.style.display = 'none';

    filtered.forEach(t => {
      const li = document.createElement('li');
      li.className = `history-item ${t.id === activeThreadId ? 'active' : ''}`;
      
      const relTime = formatRelativeTime(t.updatedAt || t.createdAt);

      li.innerHTML = `
        <div class="history-item-content">
          <span class="history-item-title">${escapeHtml(t.topic)}</span>
          <span class="history-item-date">${relTime}</span>
        </div>
        <button class="del-thread-btn touch-target" title="Delete Topic Thread"><i class="fa-solid fa-xmark"></i></button>
      `;

      li.addEventListener('click', (e) => {
        if (e.target.closest('.del-thread-btn')) return;
        loadThread(t.id);
      });

      li.querySelector('.del-thread-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteThread(t.id);
      });

      historyList.appendChild(li);
    });
  }

  function deleteThread(threadId) {
    threads = threads.filter(t => t.id !== threadId);
    saveThreadsToStorage();
    renderSidebar();

    if (activeThreadId === threadId) {
      showHeroView();
    }
    showToast('Topic thread deleted.');
  }

  function setViewMode(mode) {
    viewMode = mode;
    if (mode === 'tabbed') {
      viewTabbedBtn.classList.add('active');
      viewGridBtn.classList.remove('active');
      levelCardsContainer.classList.add('tabbed-mode');
      levelCardsContainer.classList.remove('grid-mode');
      levelTabsHeader.style.display = 'flex';
    } else {
      viewGridBtn.classList.add('active');
      viewTabbedBtn.classList.remove('active');
      levelCardsContainer.classList.remove('tabbed-mode');
      levelCardsContainer.classList.add('grid-mode');
      levelTabsHeader.style.display = 'none';
    }
  }

  function copyFullLessonPlan() {
    const thread = getActiveThread();
    if (!thread) return;

    const data = thread.initialResponse;
    let fullText = `=== TEACHER AI - LESSON PLAN ===\nTOPIC: ${thread.topic.toUpperCase()}\n\n`;
    fullText += `GREETING:\n${data.greeting}\n\n`;
    
    fullText += `--- 1. WEAK STUDENTS ---\nHow to Explain: ${data.weak.howToExplain}\nExercises:\n`;
    data.weak.exercises.forEach((ex, i) => fullText += ` ${i+1}. ${ex}\n`);

    fullText += `\n--- 2. MEDIUM STUDENTS ---\nHow to Explain: ${data.medium.howToExplain}\nExercises:\n`;
    data.medium.exercises.forEach((ex, i) => fullText += ` ${i+1}. ${ex}\n`);

    fullText += `\n--- 3. INTELLIGENT STUDENTS ---\nHow to Explain: ${data.intelligent.howToExplain}\nExercises:\n`;
    data.intelligent.exercises.forEach((ex, i) => fullText += ` ${i+1}. ${ex}\n`);

    fullText += `\n--- HOW TO TEACH THIS TOPIC (STRATEGY) ---\n${data.teachingTips}\n`;

    copyToClipboard(fullText);
    showToast('Full lesson plan copied to clipboard!');
  }

  // --- HELPERS & UTILS ---
  function getActiveThread() {
    return threads.find(t => t.id === activeThreadId);
  }

  function scrollToBottomChat() {
    setTimeout(() => {
      threadView.scrollTop = threadView.scrollHeight;
    }, 50);
  }

  function showLoading(title, subtitle) {
    if (loaderTitle) loaderTitle.textContent = title;
    if (document.getElementById('loaderSubtitle')) document.getElementById('loaderSubtitle').textContent = subtitle;
    loadingOverlay.style.display = 'flex';
  }

  function hideLoading() {
    loadingOverlay.style.display = 'none';
  }

  function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i> ${escapeHtml(msg)}`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3500);
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }
});
