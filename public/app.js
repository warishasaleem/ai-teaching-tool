// TEACHER AI - FIREBASE GOOGLE AUTHENTICATION & USER ACTIVITY LOGS
import { 
  auth, 
  db,
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  collection,
  query,
  where,
  getDocs
} from "./firebaseConfig.js";

document.addEventListener('DOMContentLoaded', () => {
  // Authentication & State
  let currentUser = null;
  let firebaseUser = null;
  let threads = [];
  let activeThreadId = null;

  // Monthly Usage Limit State (10 Plans / Calendar Month)
  let currentUsage = { count: 0, limit: 10, remaining: 10, limitReached: false };

  // DOM Elements - Auth Overlay & App Layout
  const authBootLoader = document.getElementById('authBootLoader');
  const authOverlay = document.getElementById('authOverlay');
  const appLayout = document.getElementById('appLayout');
  const googleSignInBtn = document.getElementById('googleSignInBtn');

  // DOM Elements - Monthly Usage & Limit Indicators
  const usageBadge = document.getElementById('usageBadge');
  const usageText = document.getElementById('usageText');
  const inputUsageText = document.getElementById('inputUsageText');
  const navUsageBadge = document.getElementById('navUsageBadge');
  const navUsageText = document.getElementById('navUsageText');
  const limitReachedCard = document.getElementById('limitReachedCard');
  const topicInputFields = document.getElementById('topicInputFields');

  // DOM Elements - User Profile Displays
  const sidebarUserName = document.getElementById('sidebarUserName');
  const sidebarUserEmail = document.getElementById('sidebarUserEmail');
  const sidebarUserAvatar = document.getElementById('sidebarUserAvatar');
  const topUserAvatar = document.getElementById('topUserAvatar');
  const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');

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
  const activeTopicTitle = document.getElementById('activeTopicTitle');
  const activeTopicClass = document.getElementById('activeTopicClass');

  // DOM Elements - Hero Input
  const topicInput = document.getElementById('topicInput');
  const classSelect = document.getElementById('classSelect');
  const navTopicTitle = document.getElementById('navTopicTitle');
  const generateBtn = document.getElementById('generateBtn');
  const promptChips = document.querySelectorAll('.chip-btn');

  // DOM Elements - Structured Cards
  const levelTabBtns = document.querySelectorAll('.level-tab-btn');
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
  const FALLBACK_CONTACT_EMAIL = 'teacherai.support@gmail.com';
  let appContactEmail = FALLBACK_CONTACT_EMAIL;

  async function loadAppConfig() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        if (data && data.contactEmail && typeof data.contactEmail === 'string' && data.contactEmail.trim()) {
          appContactEmail = data.contactEmail.trim();
        }
      }
    } catch (e) {
      console.warn('[Config] Failed to load server config, using fallback:', e.message);
    } finally {
      updateContactLinks(appContactEmail);
    }
  }

  function updateContactLinks(email) {
    const targetEmail = (email && typeof email === 'string' && email.trim()) ? email.trim() : FALLBACK_CONTACT_EMAIL;
    const links = document.querySelectorAll('a#contactLicenseBtn, a.contact-email-link, a[data-contact-email], a[href^="mailto:"]');
    links.forEach(l => {
      const currentHref = l.getAttribute('href') || '';
      let subject = 'Contact%20-%20TEACHER%20AI';
      if (currentHref.includes('School%20License')) {
        subject = 'School%20License%20Inquiry%20-%20TEACHER%20AI';
      } else if (currentHref.includes('Privacy')) {
        subject = 'Privacy%20Inquiry%20-%20TEACHER%20AI';
      }
      l.href = `mailto:${encodeURIComponent(targetEmail)}?subject=${subject}`;
    });
    document.querySelectorAll('.contact-email-text').forEach(el => {
      el.textContent = targetEmail;
    });
  }

  // Global click listener to ensure all mailto links dynamically use the loaded contactEmail
  document.addEventListener('click', (e) => {
    const link = e.target.closest && e.target.closest('a[href^="mailto:"], a#contactLicenseBtn, a.contact-email-link');
    if (link) {
      const targetEmail = (appContactEmail && appContactEmail.trim()) ? appContactEmail.trim() : FALLBACK_CONTACT_EMAIL;
      const currentHref = link.getAttribute('href') || '';
      let subject = 'Contact%20-%20TEACHER%20AI';
      if (currentHref.includes('School%20License')) {
        subject = 'School%20License%20Inquiry%20-%20TEACHER%20AI';
      } else if (currentHref.includes('Privacy')) {
        subject = 'Privacy%20Inquiry%20-%20TEACHER%20AI';
      }
      link.href = `mailto:${encodeURIComponent(targetEmail)}?subject=${subject}`;
    }
  });

  init();

  function init() {
    loadAppConfig();
    setupFirebaseAuth();
    setupEventListeners();
  }

  // --- FIRESTORE USER ACTIVITY LOGGING ("userLogs" collection) ---
  async function trackUserLogin(user) {
    if (!user || !user.email) return;
    const cleanEmail = user.email.toLowerCase().trim();

    try {
      const userLogRef = doc(db, "userLogs", cleanEmail);
      const docSnap = await getDoc(userLogRef);

      if (!docSnap.exists()) {
        // First time this email has logged in: set firstLoginAt (never overwritten), lastLoginAt, loginCount = 1
        await setDoc(userLogRef, {
          email: cleanEmail,
          firstLoginAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          loginCount: 1,
          name: user.displayName || cleanEmail.split('@')[0],
          photoURL: user.photoURL || ''
        });
        console.log(`[userLogs] Initial login logged for ${cleanEmail}`);
      } else {
        // Subsequent login: update lastLoginAt and increment loginCount by 1
        await updateDoc(userLogRef, {
          lastLoginAt: serverTimestamp(),
          loginCount: increment(1),
          name: user.displayName || docSnap.data().name || cleanEmail.split('@')[0],
          photoURL: user.photoURL || docSnap.data().photoURL || ''
        });
        console.log(`[userLogs] Updated login record for ${cleanEmail}`);
      }
    } catch (err) {
      console.warn("Failed to write to userLogs Firestore collection:", err);
    }
  }

  // --- QUICK ACTION PROMPTS FOR 6 FOLLOW-UP BUTTONS ---
  function getQuickActionPrompt(action, topic, thread) {
    const cleanTopic = topic || 'this topic';
    switch (action) {
      case 'pop-quiz':
        return `Generate a 10-question Printable Pop Quiz on the topic "${cleanTopic}". Include a balanced mix of True/False, Fill in the Blanks, and One-word Question & Answer types. Format clearly with question numbers and type labels (e.g., [True/False], [Fill in the Blank], [One-Word Q&A]), laid out cleanly so it can be printed directly for classroom use. Include a complete Answer Key at the end.`;

      case 'mcqs':
        return `Generate 10 Multiple-Choice Questions (MCQs) on the topic "${cleanTopic}". Each question must have exactly 4 options labeled A, B, C, and D. Number all questions clearly and list the correct answers separately at the end in an Answer Key.`;

      case 'answer-key': {
        // The follow-up API only receives the explanations, so list the exercises here
        const data = (thread && thread.initialResponse) || {};
        const levels = [
          ['Foundation', data.foundation || data.beginner || data.weak || {}],
          ['Core', data.core || data.intermediate || data.medium || {}],
          ['Advanced', data.advanced || data.intelligent || {}]
        ];
        const exerciseText = levels.map(([label, level]) =>
          `${label}:\n` + (level.exercises || []).map((ex, i) => `${i + 1}. ${String(ex).replace(/^\d+[\.\)]\s*/, '')}`).join('\n')
        ).join('\n\n');
        return `Write a complete Answer Key for these exercises on "${cleanTopic}". Keep the Foundation, Core and Advanced headings, number each answer to match its question, and add a one-line explanation for each answer.\n\n${exerciseText}`;
      }

      default:
        return '';
    }
  }

  // --- MONTHLY FREE USAGE LIMIT LOGIC (10 Plans / Calendar Month) ---
  function updateUsageUI(usageData) {
    if (!usageData) return;
    currentUsage = { ...currentUsage, ...usageData };
    const remaining = typeof currentUsage.remaining === 'number'
      ? currentUsage.remaining
      : Math.max(0, 10 - (currentUsage.count || 0));
    const limitReached = currentUsage.limitReached || remaining <= 0;

    const remainingText = `${remaining} free plans left this month`;
    // The pill's wording ("free plans left this month" / "left") lives in index.html
    const navText = `${remaining}`;

    if (usageText) usageText.textContent = remainingText;
    if (inputUsageText) inputUsageText.textContent = remainingText;
    if (navUsageText) navUsageText.textContent = navText;

    if (limitReached) {
      if (usageBadge) usageBadge.classList.add('limit-reached');
      if (navUsageBadge) navUsageBadge.classList.add('limit-reached');
      if (limitReachedCard) limitReachedCard.style.display = 'flex';
      if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.classList.add('disabled-limit');
      }
      if (topicInput) topicInput.disabled = true;
    } else {
      if (usageBadge) usageBadge.classList.remove('limit-reached');
      if (navUsageBadge) navUsageBadge.classList.remove('limit-reached');
      if (limitReachedCard) limitReachedCard.style.display = 'none';
      if (generateBtn) {
        generateBtn.disabled = false;
        generateBtn.classList.remove('disabled-limit');
      }
      if (topicInput) topicInput.disabled = false;
    }
  }

    // Helper: Get fresh Firebase ID token; if auth is still initializing, wait for login to resolve
  async function getAuthToken() {
    // 1. If auth.currentUser or firebaseUser is already available
    const activeUser = auth.currentUser || firebaseUser;
    if (activeUser && typeof activeUser.getIdToken === 'function') {
      try {
        return await activeUser.getIdToken();
      } catch (err) {
        console.warn('[Auth] getIdToken failed, attempting refresh:', err);
      }
    }

    // 2. If auth is still initializing or restoring session from IndexedDB/localStorage, wait
    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          unsubscribe();
          resolve(null);
        }
      }, 10000); // 10 second safety timeout

      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          unsubscribe();
          try {
            firebaseUser = user;
            const token = await user.getIdToken();
            resolve(token);
          } catch (e) {
            console.error('[Auth] Failed to get ID token:', e);
            resolve(null);
          }
        }
      });
    });
  }

  async function fetchUserUsage() {
    try {
      const token = await getAuthToken();
      if (!token) return;

      const res = await fetch('/api/user/usage', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data && data.success) {
        updateUsageUI(data);
      } else if (data && data.error) {
        console.warn('[Usage] Server response:', data.error);
        if (res.status === 503) {
          showToast(data.error, 'warning');
        }
      }
    } catch (err) {
      console.warn('Error fetching monthly plan usage:', err);
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

    const landingNavSignInBtn = document.getElementById('landingNavSignInBtn');
    if (landingNavSignInBtn && googleSignInBtn) {
      landingNavSignInBtn.addEventListener('click', () => {
        googleSignInBtn.click();
      });
    }

    // 2. Firebase Auth State Observer (Every signed-in user gets full access immediately)
    onAuthStateChanged(auth, async (user) => {
      if (googleSignInBtn) {
        googleSignInBtn.disabled = false;
        googleSignInBtn.style.opacity = '1';
      }

      if (user) {
        firebaseUser = user;
        currentUser = {
          name: user.displayName || user.email.split('@')[0],
          email: user.email,
          photoURL: user.photoURL,
          uid: user.uid
        };

        // Track user login in Firestore "userLogs" collection
        trackUserLogin(user);

        // Immediate full access to the app
        onLoginSuccess(currentUser);
      } else {
        // User signed out -> Show Sign-In Overlay
        currentUser = null;
        firebaseUser = null;
        activeThreadId = null;
        showAuthModal();
      }
    });

    // 3. Logout Handlers (Works from Top Nav & Sidebar)
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
  }

  function onLoginSuccess(user) {
    // Notify backend alert endpoint
    fetch('/api/notify-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: user.name, email: user.email })
    }).catch(err => console.error('Login notification error:', err));

    // Fetch user's monthly free usage limit
    fetchUserUsage();

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
    if (sidebarUserEmail) sidebarUserEmail.textContent = user.email;
    sidebarUserName.title = user.email;
    topUserAvatar.title = user.name || user.email;

    // Show Admin Link if user is authorized administrator (verified server-side)
    const cleanEmail = (user.email || '').toLowerCase().trim();
    const adminNavBtn = document.getElementById('adminUsersNavBtn');
    if (adminNavBtn) {
      fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail })
      })
      .then(res => res.json())
      .then(data => {
        adminNavBtn.style.display = data.isAdmin ? 'inline-flex' : 'none';
      })
      .catch(err => {
        console.warn('Admin check error:', err);
        adminNavBtn.style.display = 'none';
      });
    }

    // Hide Auth screen, Show App
    hideBootLoader();
    authOverlay.style.display = 'none';
    appLayout.style.display = 'flex';

    // Load User-Specific Isolated Threads
    loadThreadsFromStorage();
    renderSidebar();

    if (threads.length > 0) {
      loadThread(threads[0].id);
    } else {
      showHeroView();
    }
  }

  function showAuthModal() {
    hideBootLoader();
    authOverlay.style.display = 'flex';
    appLayout.style.display = 'none';
  }

  // Boot loader stays visible until Firebase reports the restored session
  function hideBootLoader() {
    if (authBootLoader) authBootLoader.style.display = 'none';
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

  // Mobile uses the slide-in drawer; desktop collapses the sidebar so the plan takes full width
  function isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function openSidebar() {
    if (isMobileViewport()) {
      openMobileSidebar();
    } else {
      appLayout.classList.remove('sidebar-collapsed');
    }
  }

  function closeSidebar() {
    if (isMobileViewport()) {
      closeMobileSidebar();
    } else {
      appLayout.classList.add('sidebar-collapsed');
    }
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
    if (openSidebarBtn) openSidebarBtn.addEventListener('click', openSidebar);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
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
      handleGenerateNewTopic(withSelectedClass(val));
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
        const chipClass = chip.getAttribute('data-class');
        topicInput.value = topic;
        if (classSelect && chipClass) classSelect.value = chipClass;
        handleGenerateNewTopic(withSelectedClass(topic));
      });
    });

    // Mobile bottom bar: Share (phone share menu) + Copy
    const sharePlanBtn = document.getElementById('sharePlanBtn');
    const mobileCopyBtn = document.getElementById('mobileCopyBtn');
    if (sharePlanBtn) sharePlanBtn.addEventListener('click', shareFullLessonPlan);
    if (mobileCopyBtn) mobileCopyBtn.addEventListener('click', copyFullLessonPlan);

    levelTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetLevel = btn.getAttribute('data-level');
        levelTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        [weakCard, mediumCard, intelligentCard].forEach(card => card.classList.remove('active'));
        if (targetLevel === 'foundation' || targetLevel === 'beginner' || targetLevel === 'weak') weakCard.classList.add('active');
        if (targetLevel === 'core' || targetLevel === 'intermediate' || targetLevel === 'medium') mediumCard.classList.add('active');
        if (targetLevel === 'advanced' || targetLevel === 'intelligent') intelligentCard.classList.add('active');
      });
    });

    // Copy Full Plan & Print Buttons (Plan Toolbar)
    const planCopyFullBtn = document.getElementById('planCopyFullBtn');
    if (planCopyFullBtn) planCopyFullBtn.addEventListener('click', copyFullLessonPlan);
    const planPrintBtn = document.getElementById('planPrintBtn');
    if (planPrintBtn) planPrintBtn.addEventListener('click', () => window.print());

    document.querySelectorAll('.copy-sec-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        const thread = getActiveThread();
        if (!thread || !thread.initialResponse) return;

        let contentText = '';
        const data = thread.initialResponse;
        const foundation = data.foundation || data.beginner || data.weak || {};
        const core = data.core || data.intermediate || data.medium || {};
        const advanced = data.advanced || data.intelligent || {};

        if (target === 'foundation' || target === 'beginner' || target === 'weak') {
          contentText = `FOUNDATION:\nHow to explain: ${foundation.howToExplain || ''}\n\nExercises:\n` + (foundation.exercises || []).join('\n');
        } else if (target === 'core' || target === 'intermediate' || target === 'medium') {
          contentText = `CORE:\nHow to explain: ${core.howToExplain || ''}\n\nExercises:\n` + (core.exercises || []).join('\n');
        } else if (target === 'advanced' || target === 'intelligent') {
          contentText = `ADVANCED:\nHow to explain: ${advanced.howToExplain || ''}\n\nExercises:\n` + (advanced.exercises || []).join('\n');
        } else if (target === 'strategy') {
          contentText = `HOW TO TEACH THIS TOPIC (GENERAL STRATEGY):\n${data.teachingTips || ''}`;
        }

        copyToClipboard(contentText);
        const displayLabel = (target === 'foundation' || target === 'beginner' || target === 'weak') ? 'FOUNDATION'
          : (target === 'core' || target === 'intermediate' || target === 'medium') ? 'CORE'
          : (target === 'advanced' || target === 'intelligent') ? 'ADVANCED'
          : target.toUpperCase();
        showToast(`Copied ${displayLabel} section to clipboard!`);
      });
    });

    sendFollowUpBtn.addEventListener('click', handleSendFollowUp);

    followUpInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendFollowUpBtn.click();
      }
    });

    // --- QUICK ACTION CHIPS (6 BUTTONS) ---
    document.querySelectorAll('.chat-chip[data-action]').forEach(chip => {
      chip.addEventListener('click', () => {
        const action = chip.getAttribute('data-action');
        if (!action) return;

        if (sendFollowUpBtn.disabled) {
          showToast('Please wait for the current response to complete...', 'error');
          return;
        }

        const thread = getActiveThread();
        const topic = (thread && thread.topic) ? thread.topic : (topicInput.value.trim() || 'this topic');
        const promptText = getQuickActionPrompt(action, topic, thread);
        if (promptText) {
          followUpInput.value = promptText;
          handleSendFollowUp();
        }
      });
    });

  }

  // --- API ACTIONS ---
  async function handleGenerateNewTopic(topicName) {
    // Client-side pre-check for monthly limit
    if (currentUsage && currentUsage.limitReached) {
      showToast('Free limit reached. Contact us for a School License', 'error');
      if (limitReachedCard) limitReachedCard.style.display = 'flex';
      return;
    }

    const token = await getAuthToken();
    if (!token) {
      showToast('Please sign in again', 'warning');
      return;
    }

    showLoading('Generating Differentiated Lesson Plan...', 'Creating tailored explanations & 5+ exercises for Foundation, Core, and Advanced tiers.');
    
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          topic: topicName
        })
      });

      const result = await response.json();
      hideLoading();

      if (!response.ok || !result.success) {
        if (response.status === 403 || result.limitReached) {
          updateUsageUI({ count: 10, limit: 10, remaining: 0, limitReached: true });
          showToast(result.error || 'Free limit reached. Contact us for a School License', 'error');
          if (limitReachedCard) limitReachedCard.style.display = 'flex';
          return;
        }
        if (response.status === 401) {
          showToast('Please sign in again', 'error');
          showAuthModal();
          return;
        }
        if (response.status === 503) {
          showToast(result.error || 'Service abhi available nahi, thori der baad try karein', 'error');
          return;
        }
        throw new Error(result.error || 'Failed to generate content from server.');
      }

      // Update remaining count from server response
      if (result.usage) {
        updateUsageUI(result.usage);
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

    const token = await getAuthToken();
    if (!token) {
      showToast('Please sign in again', 'warning');
      return;
    }

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
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
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
        if (response.status === 401) {
          showToast('Please sign in again', 'error');
          showAuthModal();
          return;
        }
        if (response.status === 503) {
          showToast(result.error || 'Service abhi available nahi, thori der baad try karein', 'error');
          return;
        }
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
    appLayout.classList.remove('is-plan-view');
    renderSidebar();
  }

  // Adds the chosen class to the topic ("Fractions" -> "Fractions (Class 5)") unless the topic already names one
  function withSelectedClass(topic) {
    if (!classSelect || /\b(?:grade|class)\s*\d{1,2}\b/i.test(topic)) return topic;
    return `${topic} (Class ${classSelect.value})`;
  }

  // Splits "Photosynthesis for Grade 7" into a heading and a "Class 7" label
  function splitTopicAndClass(topic) {
    const text = (topic || '').trim();
    const match = text.match(/\(?\b(?:grade|class)\s*(\d{1,2})\b\)?/i);
    if (!match) return { title: text, classLabel: '' };
    const title = text.replace(match[0], '').replace(/\s+(?:for|in)\s*$/i, '').replace(/[\s,\-–:]+$/, '').trim();
    return { title: title || text, classLabel: `Class ${match[1]}` };
  }

  function loadThread(threadId) {
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;

    activeThreadId = thread.id;
    
    const { title, classLabel } = splitTopicAndClass(thread.topic);
    activeTopicTitle.textContent = title;
    activeTopicClass.textContent = classLabel;
    activeTopicClass.style.display = classLabel ? 'block' : 'none';
    if (navTopicTitle) navTopicTitle.textContent = classLabel ? `${title} · ${classLabel}` : title;
    appLayout.classList.add('is-plan-view');

    const data = thread.initialResponse;

    const foundation = data.foundation || data.beginner || data.weak || {};
    const core = data.core || data.intermediate || data.medium || {};
    const advanced = data.advanced || data.intelligent || {};

    weakHowToExplain.textContent = foundation.howToExplain || 'No explanation available.';
    renderExerciseList(weakExercises, foundation.exercises || []);

    mediumHowToExplain.textContent = core.howToExplain || 'No explanation available.';
    renderExerciseList(mediumExercises, core.exercises || []);

    intelligentHowToExplain.textContent = advanced.howToExplain || 'No explanation available.';
    renderExerciseList(intelligentExercises, advanced.exercises || []);

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

    if (msgObj.sender === 'assistant') {
      bubble.innerHTML = `
        <div class="chat-avatar">${icon}</div>
        <div class="chat-content">
          <div class="bubble-header-bar">
            <span class="bubble-tag"><i class="fa-solid fa-sparkles"></i> Generated Activity / Response</span>
            <button class="copy-bubble-btn touch-target" title="Copy this activity in full"><i class="fa-solid fa-copy"></i> Copy</button>
          </div>
          <div class="bubble-body">${renderedHTML}</div>
        </div>
      `;

      const copyBtn = bubble.querySelector('.copy-bubble-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          copyToClipboard(msgObj.content);
          showToast('Activity copied to clipboard!');
        });
      }
    } else {
      bubble.innerHTML = `
        <div class="chat-avatar">${icon}</div>
        <div class="chat-content">${renderedHTML}</div>
      `;
    }

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
      const { title, classLabel } = splitTopicAndClass(t.topic);
      const metaText = classLabel ? `${classLabel} · ${relTime}` : relTime;

      li.innerHTML = `
        <div class="history-item-content">
          <span class="history-item-title">${escapeHtml(title)}</span>
          <span class="history-item-date">${escapeHtml(metaText)}</span>
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

  function copyFullLessonPlan() {
    const fullText = buildFullPlanText();
    if (!fullText) return;
    copyToClipboard(fullText);
    showToast('Full lesson plan & activities copied to clipboard!');
  }

  // Opens the phone's share menu; falls back to copying where sharing is not supported
  async function shareFullLessonPlan() {
    const fullText = buildFullPlanText();
    if (!fullText) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Teacher AI lesson plan', text: fullText });
      } catch (err) {
        if (err.name !== 'AbortError') showToast('Could not open share menu.', 'error');
      }
      return;
    }
    copyToClipboard(fullText);
    showToast('Sharing is not available here, so the plan was copied instead.');
  }

  function buildFullPlanText() {
    const thread = getActiveThread();
    if (!thread || !thread.initialResponse) return '';

    const data = thread.initialResponse;
    let fullText = `=== TEACHER AI - LESSON PLAN ===\nTOPIC: ${(thread.topic || '').toUpperCase()}\n\n`;
    if (data.greeting) {
      fullText += `GREETING:\n${data.greeting}\n\n`;
    }
    
    // 1. Foundation
    const foundation = data.foundation || data.beginner || data.weak || {};
    fullText += `--- 1. FOUNDATION ---\nHow to Explain: ${foundation.howToExplain || ''}\nExercises:\n`;
    (foundation.exercises || []).forEach((ex, i) => fullText += ` ${i+1}. ${ex}\n`);

    // 2. Core
    const core = data.core || data.intermediate || data.medium || {};
    fullText += `\n--- 2. CORE ---\nHow to Explain: ${core.howToExplain || ''}\nExercises:\n`;
    (core.exercises || []).forEach((ex, i) => fullText += ` ${i+1}. ${ex}\n`);

    // 3. Advanced
    const advanced = data.advanced || data.intelligent || {};
    fullText += `\n--- 3. ADVANCED ---\nHow to Explain: ${advanced.howToExplain || ''}\nExercises:\n`;
    (advanced.exercises || []).forEach((ex, i) => fullText += ` ${i+1}. ${ex}\n`);

    // 4. Teaching Strategy
    if (data.teachingTips) {
      fullText += `\n--- HOW TO TEACH THIS TOPIC (GENERAL STRATEGY) ---\n${data.teachingTips}\n`;
    }

    // 5. Follow-ups & Generated Quick Actions (Pop Quiz, MCQs, Real-life examples, Research task, Challenge questions, etc.)
    if (Array.isArray(thread.messages) && thread.messages.length > 0) {
      const assistantMsgs = thread.messages.filter(m => m.sender === 'assistant');
      if (assistantMsgs.length > 0) {
        fullText += `\n========================================\n=== GENERATED ACTIVITIES & RESOURCES ===\n========================================\n`;
        assistantMsgs.forEach((msg, idx) => {
          fullText += `\n--- ACTIVITY #${idx + 1} ---\n${msg.content}\n`;
        });
      }
    }

    return fullText;
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
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
    } else {
      fallbackCopyText(text);
    }
  }

  function fallbackCopyText(text) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch (err) {
      console.error('Copy fallback failed:', err);
    }
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
