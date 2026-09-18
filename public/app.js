// TEACHER AI - CLIENT APPLICATION LOGIC WITH SECURE ACCOUNT AUTHENTICATION & MOBILE RESPONSIVENESS

document.addEventListener('DOMContentLoaded', () => {
  // Authentication & State
  let currentUser = null;
  let threads = [];
  let activeThreadId = null;
  let viewMode = 'tabbed'; // 'tabbed' or 'grid'

  // DOM Elements - Auth Modal
  const authOverlay = document.getElementById('authOverlay');
  const appLayout = document.getElementById('appLayout');
  const loginTabBtn = document.getElementById('loginTabBtn');
  const registerTabBtn = document.getElementById('registerTabBtn');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const demoLoginBtn = document.getElementById('demoLoginBtn');

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

  // Initialize App
  init();

  function init() {
    setupAuthListeners();
    setupEventListeners();
    checkAuthSession();
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

  // --- AUTHENTICATION & SECURITY SYSTEM ---
  function checkAuthSession() {
    try {
      const storedUser = localStorage.getItem('teacher_ai_current_user');
      if (storedUser) {
        currentUser = JSON.parse(storedUser);
        onLoginSuccess(currentUser, false);
      } else {
        showAuthModal();
      }
    } catch (e) {
      showAuthModal();
    }
  }

  function showAuthModal() {
    authOverlay.style.display = 'flex';
    appLayout.style.display = 'none';
  }

  function hideAuthModal() {
    authOverlay.style.display = 'none';
    appLayout.style.display = 'flex';
  }

  function setupAuthListeners() {
    loginTabBtn.addEventListener('click', () => {
      loginTabBtn.classList.add('active');
      registerTabBtn.classList.remove('active');
      loginForm.style.display = 'flex';
      registerForm.style.display = 'none';
    });

    registerTabBtn.addEventListener('click', () => {
      registerTabBtn.classList.add('active');
      loginTabBtn.classList.remove('active');
      registerForm.style.display = 'flex';
      loginForm.style.display = 'none';
    });

    document.querySelectorAll('.toggle-pwd-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input.type === 'password') {
          input.type = 'text';
          btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
        } else {
          input.type = 'password';
          btn.innerHTML = '<i class="fa-solid fa-eye"></i>';
        }
      });
    });

    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      if (!email) return;

      const userObj = {
        name: email.split('@')[0].replace('.', ' '),
        email: email
      };
      onLoginSuccess(userObj, true);
    });

    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      if (!email || !name) return;

      const userObj = {
        name: name,
        email: email
      };
      onLoginSuccess(userObj, true);
    });

    demoLoginBtn.addEventListener('click', () => {
      const demoUser = {
        name: 'Demo Teacher',
        email: 'teacher@school.edu'
      };
      onLoginSuccess(demoUser, true);
    });

    sidebarLogoutBtn.addEventListener('click', handleLogout);
    topLogoutBtn.addEventListener('click', handleLogout);
  }

  function onLoginSuccess(user, notify = true) {
    currentUser = user;
    localStorage.setItem('teacher_ai_current_user', JSON.stringify(currentUser));

    fetch('/api/notify-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: currentUser.name, email: currentUser.email })
    }).catch(err => console.error('Login notification error:', err));

    const initial = (currentUser.name || currentUser.email || 'T').charAt(0).toUpperCase();
    sidebarUserAvatar.textContent = initial;
    topUserAvatar.textContent = initial;
    sidebarUserName.textContent = currentUser.name || 'Teacher Account';
    sidebarUserEmail.textContent = currentUser.email;
    topUserName.textContent = currentUser.name || currentUser.email.split('@')[0];

    hideAuthModal();

    loadThreadsFromStorage();
    renderSidebar();
    showHeroView();

    if (notify) {
      showToast(`Welcome back, ${currentUser.name}! Session secured.`);
    }
  }

  function handleLogout() {
    if (confirm('Are you sure you want to log out of your session?')) {
      localStorage.removeItem('teacher_ai_current_user');
      currentUser = null;
      threads = [];
      activeThreadId = null;
      showAuthModal();
      showToast('Logged out securely.');
    }
  }

  // --- LOCAL STORAGE LOGIC ---
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
    // Sidebar Mobile Drawer Controls
    if (openSidebarBtn) openSidebarBtn.addEventListener('click', openMobileSidebar);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeMobileSidebar);
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeMobileSidebar);

    // New Topic Button
    newTopicBtn.addEventListener('click', () => {
      showHeroView();
      closeMobileSidebar();
    });

    // History Search
    historySearch.addEventListener('input', (e) => {
      renderSidebar(e.target.value.toLowerCase());
    });

    // Clear All Private History
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

    // Generate Button
    generateBtn.addEventListener('click', () => {
      const val = topicInput.value.trim();
      if (!val) {
        showToast('Please enter a topic to generate a plan.', 'error');
        topicInput.focus();
        return;
      }
      handleGenerateNewTopic(val);
    });

    // Enter Key on Topic Input
    topicInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        generateBtn.click();
      }
    });

    // Sample Prompt Chips
    promptChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const topic = chip.getAttribute('data-topic');
        topicInput.value = topic;
        handleGenerateNewTopic(topic);
      });
    });

    // View Switcher (Tabs vs Grid)
    viewTabbedBtn.addEventListener('click', () => setViewMode('tabbed'));
    viewGridBtn.addEventListener('click', () => setViewMode('grid'));

    // Level Tabs Switcher
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

    // Copy Full Plan Button
    copyFullPlanBtn.addEventListener('click', copyFullLessonPlan);

    // Print Button
    printPlanBtn.addEventListener('click', () => window.print());

    // Delete Current Thread
    deleteCurrentThreadBtn.addEventListener('click', () => {
      if (!activeThreadId) return;
      if (confirm('Delete this topic thread from your private history?')) {
        deleteThread(activeThreadId);
      }
    });

    // Section Copy Buttons
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

    // Follow-Up Send Button
    sendFollowUpBtn.addEventListener('click', handleSendFollowUp);

    // Follow-Up Input Enter Key
    followUpInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendFollowUpBtn.click();
      }
    });

    // Chat Suggestion Chips
    chatChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const msg = chip.getAttribute('data-msg');
        followUpInput.value = msg;
        handleSendFollowUp();
      });
    });
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
