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
  const sloInput = document.getElementById('sloInput');
  const sloCount = document.getElementById('sloCount');
  const sloCovered = document.getElementById('sloCovered');
  const sloCoveredList = document.getElementById('sloCoveredList');
  function updateSloCount() { if (sloInput && sloCount) sloCount.textContent = `${sloInput.value.length}/1000`; }
  if (sloInput) sloInput.addEventListener('input', updateSloCount);
  const classSelect = document.getElementById('classSelect');
  const navTopicTitle = document.getElementById('navTopicTitle');
  const generateBtn = document.getElementById('generateBtn');
  const promptChips = document.querySelectorAll('.chip-btn');

  // DOM Elements - Structured Cards
  const levelTabBtns = document.querySelectorAll('.level-tab-btn');
  const periodCard = document.getElementById('periodCard');
  const periodTabBtn = document.getElementById('periodTabBtn');
  const planSteamChip = document.getElementById('planSteamChip');
  const weakCard = document.getElementById('weakCard');
  const mediumCard = document.getElementById('mediumCard');
  const engagementCard = document.getElementById('engagementCard');
  const weakHowToExplain = document.getElementById('weakHowToExplain');
  const mediumHowToExplain = document.getElementById('mediumHowToExplain');
  const weakExercises = document.getElementById('weakExercises');
  const mediumExercises = document.getElementById('mediumExercises');
  const engagementList = document.getElementById('engagementList');

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

  // --- QUICK ACTION POPUP (6 BUTTONS, SAME POPUP) ---
  // Do not remove any of these 6 without asking (see PRODUCT.md).
  const ANSWERS_MARKER = '===ANSWERS===';
  const NO_TABLES_RULE = 'Never use a table. Use only headings and lists.';
  const NO_BOLD_RULE = 'Do NOT use bold, italics or any emphasis anywhere in the questions or options, so the correct answer cannot be guessed from formatting.';
  const ANSWERS_RULE = `${NO_BOLD_RULE} Do NOT put answers next to the questions. After the very last question, write a line containing only ${ANSWERS_MARKER} and then the complete answer key (same numbers, one short line each).`;

  const QUICK_ACTIONS = {
    'pop-quiz': {
      title: 'Printable Pop Quiz',
      hasAnswers: true,
      stripBold: true,
      prompt: (t) => `Generate a Printable Pop Quiz of 15 questions on the topic "${t}", laid out cleanly so it can be printed for classroom use. Use exactly these three sections, each with its heading on its own line, in this order:
## True / False
(5 statements)
## Fill in the Blanks
(5 sentences, each with one blank written as ______. Blank rules: each blank has exactly ONE correct answer, the exact word used in the textbook. Do NOT make example-style blanks like "is like a ___" (examples may appear in the sentence, never as the answer). All 5 answers must be different, no repeats.)
## One-Word Answers
(5 questions that have a one-word answer)
Number the questions in each section as a list starting again from 1. Do NOT put a label like [True/False] before questions. For True / False, write only the statement, with NO options (no A/B, no "True"/"False" choices). ${ANSWERS_RULE} Put the answer key in the same three sections, in the same order, with the same headings and numbering.`
    },
    'mcqs': {
      title: 'MCQs',
      hasAnswers: true,
      stripBold: true,
      prompt: (t) => `Generate 10 Multiple-Choice Questions (MCQs) on the topic "${t}". Each question must have exactly 4 options labeled A, B, C, and D. Number all questions clearly. ${ANSWERS_RULE}`
    },
    'real-life': {
      title: 'Real-Life Examples',
      prompt: (t) => `Generate 5 simple real-life examples of "${t}". Write them in language appropriate for children, connecting the topic directly to everyday things, household items, or experiences kids recognize.`
    },
    'mini-research': {
      title: 'Mini Research Task',
      prompt: (t) => `Generate exactly ONE take-home mini research and exploration task related to "${t}" that students can easily do at home (e.g. observe something, ask a family member, or find an object). Include clear, simple step-by-step instructions on what to do and brief instructions on what to bring back or report to class.`
    },
    'resources': {
      title: 'Related Resources',
      links: (t) => {
        const q = encodeURIComponent(t);
        return [
          ['Search Google for activities', `https://www.google.com/search?q=${q}+teaching+activities`],
          ['Printable worksheets (Google)', `https://www.google.com/search?q=${q}+worksheets+printable`],
          ['Pinterest teaching ideas', `https://www.pinterest.com/search/pins/?q=${q}+teaching+ideas`],
          ['YouTube lesson explanations', `https://www.youtube.com/results?search_query=${q}+lesson+explanation`]
        ];
      }
    },
    'challenge': {
      title: 'Challenge Question',
      hasAnswers: true,
      stripBold: true,
      writeSpace: true,
      prompt: (t) => `Generate exactly 3 challenging, open-ended questions about "${t}" that can spark a classroom debate. Write them as a simple numbered list (1, 2, 3), one under the other. Each list item must contain ONLY the question in normal weight (no bold, no italics), and nothing else. Then write a line containing only ${ANSWERS_MARKER} and after it, for each question (same numbers), give a comprehensive model answer and key discussion points as a short bullet list.`
    }
  };

  let quickPopupRequestId = 0;
  let quickPopupText = { body: '', answers: '' };

  function isQuickPopupOpen() {
    return document.getElementById('quickPopup').classList.contains('open');
  }

  function closeQuickPopup() {
    quickPopupRequestId++; // ignore any reply still on its way
    document.getElementById('quickPopup').classList.remove('open');
  }

  function setQuickAnswersShown(shown) {
    const answersEl = document.getElementById('quickPopupAnswers');
    const btn = document.getElementById('quickPopupShowAnswers');
    answersEl.classList.toggle('is-shown', shown);
    btn.textContent = shown ? 'Hide answers' : 'Show answers';
  }

  function renderQuickMarkdown(md) {
    return (typeof marked !== 'undefined') ? marked.parse(md) : escapeHtml(md).replace(/\n/g, '<br>');
  }

  async function openQuickPopup(action) {
    const cfg = QUICK_ACTIONS[action];
    if (!cfg) return;

    const thread = getActiveThread();
    const topic = (thread && thread.topic) ? thread.topic : (topicInput.value.trim() || 'this topic');

    const popup = document.getElementById('quickPopup');
    const bodyEl = document.getElementById('quickPopupBody');
    const answersEl = document.getElementById('quickPopupAnswers');
    const showBtn = document.getElementById('quickPopupShowAnswers');
    const copyBtn = document.getElementById('quickPopupCopy');
    const printBtn = document.getElementById('quickPopupPrint');

    document.getElementById('quickPopupTitle').textContent = cfg.title;
    popup.dataset.action = action;
    quickPopupText = { body: '', answers: '' };
    answersEl.innerHTML = '';
    setQuickAnswersShown(false);
    showBtn.style.display = 'none';
    popup.classList.add('open');

    // Related Resources: plain links, no AI call
    if (cfg.links) {
      const links = cfg.links(topic);
      bodyEl.innerHTML = `<p class="quick-popup-topic">Links for <strong>${escapeHtml(topic)}</strong></p><ul class="resources-list">` +
        links.map(([label, url], i) => `<li><a class="resource-link" href="${url}" target="_blank" rel="noopener noreferrer"><span class="resource-icon" aria-hidden="true">${['🔍', '📄', '📌', '▶️'][i] || '🔗'}</span><span class="resource-label">${escapeHtml(label)}</span><span class="resource-open" aria-hidden="true" title="Opens in a new tab">↗</span></a></li>`).join('') +
        '</ul>';
      quickPopupText.body = links.map(([label, url]) => `${label}: ${url}`).join('\n');
      copyBtn.disabled = false;
      printBtn.disabled = false;
      return;
    }

    if (!thread) {
      popup.classList.remove('open');
      showToast('Please create a lesson plan first', 'error');
      return;
    }

    const token = await getAuthToken();
    if (!token) {
      popup.classList.remove('open');
      showToast('Please sign in again', 'warning');
      return;
    }

    const myRequest = ++quickPopupRequestId;
    bodyEl.innerHTML = '<p class="quick-popup-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Generating...</p>';
    copyBtn.disabled = true;
    printBtn.disabled = true;

    // Never stay on "Generating..." forever: give up after 60 seconds
    const abortTimer = new AbortController();
    const timeoutId = setTimeout(() => abortTimer.abort(), 60000);
    try {
      const response = await fetch('/api/followup', {
        method: 'POST',
        signal: abortTimer.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          topic: thread.topic,
          initialResponse: thread.initialResponse,
          history: [],
          message: `${cfg.prompt(topic)} ${NO_TABLES_RULE}`
        })
      });
      const result = await response.json();
      if (myRequest !== quickPopupRequestId) return; // popup was closed or reopened

      if (!result.success || !result.reply) {
        if (response.status === 503) {
          closeQuickPopup();
          showToast('Service is busy right now. Please try again in a moment.', 'error');
          return;
        }
        if (response.status === 401) {
          closeQuickPopup();
          showToast('Please sign in again', 'error');
          showAuthModal();
          return;
        }
        throw new Error(result.error || 'Failed to get a response.');
      }

      let bodyMd = result.reply;
      let answersMd = '';
      if (cfg.hasAnswers) {
        const idx = bodyMd.indexOf(ANSWERS_MARKER);
        if (idx !== -1) {
          answersMd = bodyMd.slice(idx + ANSWERS_MARKER.length).trim();
          bodyMd = bodyMd.slice(0, idx).trim();
        }
      }
      // Quiz/MCQ questions: no bold (it can give the answer away). Only ** is removed;
      // blanks (______) must stay, so underscores are escaped to stop markdown eating them.
      let bodyHtmlMd = bodyMd;
      if (cfg.stripBold) {
        bodyMd = bodyMd.replace(/\*\*/g, '');
        bodyHtmlMd = bodyMd.replace(/_{2,}/g, (m) => '\\_'.repeat(m.length));
      }

      quickPopupText = { body: bodyMd, answers: answersMd };
      bodyEl.innerHTML = renderQuickMarkdown(bodyHtmlMd);
      bodyEl.classList.toggle('has-write-space', !!cfg.writeSpace);
      if (answersMd) {
        answersEl.innerHTML = '<h3 class="quick-answers-heading">Answers</h3>' + renderQuickMarkdown(answersMd);
        showBtn.style.display = '';
      }
      copyBtn.disabled = false;
      printBtn.disabled = false;
    } catch (err) {
      if (myRequest !== quickPopupRequestId) return;
      console.error('Quick action error:', err);
      closeQuickPopup();
      showToast(err.name === 'AbortError' ? 'This took too long. Please try again.' : (err.message || 'Failed to generate. Try again.'), 'error');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function setupQuickPopup() {
    const popup = document.getElementById('quickPopup');
    document.getElementById('quickPopupClose').addEventListener('click', closeQuickPopup);
    popup.addEventListener('click', (e) => { if (e.target === popup) closeQuickPopup(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isQuickPopupOpen()) closeQuickPopup(); });

    document.getElementById('quickPopupShowAnswers').addEventListener('click', () => {
      setQuickAnswersShown(!document.getElementById('quickPopupAnswers').classList.contains('is-shown'));
    });
    document.getElementById('quickPopupCopy').addEventListener('click', () => {
      const showing = document.getElementById('quickPopupAnswers').classList.contains('is-shown');
      copyToClipboard(quickPopupText.body + (showing && quickPopupText.answers ? `\n\nAnswers\n${quickPopupText.answers}` : ''));
      showToast('Copied');
    });
    document.getElementById('quickPopupPrint').addEventListener('click', () => window.print());

    // Print only the popup (answers go on the last page only if they are showing)
    window.addEventListener('beforeprint', () => { if (isQuickPopupOpen()) document.body.classList.add('quick-popup-printing'); });
    window.addEventListener('afterprint', () => document.body.classList.remove('quick-popup-printing'));
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

    // Always open on the New topic page; saved topics stay in the sidebar
    showHeroView();
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
      btn.addEventListener('click', () => showLevelTab(btn.getAttribute('data-level')));
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

        if (target === 'foundation' || target === 'beginner' || target === 'weak') {
          contentText = `BASIC:\nHow to explain: ${foundation.howToExplain || ''}\n\nExercises:\n` + (foundation.exercises || []).join('\n');
        } else if (target === 'core' || target === 'intermediate' || target === 'medium') {
          contentText = `ADVANCED:\nHow to explain: ${core.howToExplain || ''}\n\nExercises:\n` + (core.exercises || []).join('\n');
        } else if (target === 'engagement') {
          contentText = `${tipsLabel(data).toUpperCase()}:\n${engagementLines(data).map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
        }

        copyToClipboard(contentText);
        const displayLabel = (target === 'foundation' || target === 'beginner' || target === 'weak') ? 'BASIC'
          : (target === 'core' || target === 'intermediate' || target === 'medium') ? 'ADVANCED'
          : target === 'engagement' ? tipsLabel(getActiveThread().initialResponse).toUpperCase()
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
        if (action) openQuickPopup(action);
      });
    });
    setupQuickPopup();

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

    const periodLength = getSelectedPeriodLength();
    showLoading('Creating your lesson plan...', `A ${periodLength}-minute plan with group work for Basic and Advanced groups.`);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          topic: topicName,
          periodLength,
          ...(sloInput && sloInput.value.trim() ? { slos: sloInput.value.trim().slice(0, 1000) } : {})
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
          showToast('Service is busy right now. Please try again in a moment.', 'error');
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
        periodLength,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        initialResponse: result.data,
        messages: []
      };

      threads.unshift(newThread);
      saveThreadsToStorage();
      renderSidebar();

      topicInput.value = '';
      if (sloInput) { sloInput.value = ''; updateSloCount(); }
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
          showToast('Service is busy right now. Please try again in a moment.', 'error');
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
    if (!classSelect || /\b(?:grade|class)\s*\d{1,2}\b|\b[oa]\s*level\b/i.test(topic)) return topic;
    const value = classSelect.value;
    return `${topic} (${/^\d+$/.test(value) ? 'Class ' + value : value})`;
  }

  function getSelectedPeriodLength() {
    const picked = document.querySelector('input[name="periodLength"]:checked');
    const value = picked ? Number(picked.value) : 40;
    return [35, 40, 45].includes(value) ? value : 40;
  }

  // Plans saved earlier only have the old 'teachingTips' text, so they keep that name
  function tipsLabel(data) {
    return (Array.isArray(data.engagementTips) && data.engagementTips.length) ? 'Engagement Tips' : 'Teaching Tips';
  }

  // Engagement tips as a list; plans saved earlier only have the old 'teachingTips' text
  function engagementLines(data) {
    if (Array.isArray(data.engagementTips) && data.engagementTips.length) return data.engagementTips;
    return data.teachingTips ? [data.teachingTips] : [];
  }

  // Shows one tab (period / foundation / core / engagement) and its card
  function showLevelTab(level) {
    const cards = { period: periodCard, foundation: weakCard, core: mediumCard, engagement: engagementCard };
    levelTabBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-level') === level));
    Object.values(cards).forEach(card => card && card.classList.remove('active'));
    if (cards[level]) cards[level].classList.add('active');
  }

  // Builds the minute-by-minute Period Plan card from the server's periodPlan object
  function renderPeriodPlan(plan, classLabel) {
    const timeline = document.getElementById('periodTimeline');
    const extras = document.getElementById('periodExtras');
    const metaMobile = document.getElementById('periodMetaMobile');
    timeline.innerHTML = '';
    extras.innerHTML = '';

    if (!plan) {
      activeTopicClass.textContent = classLabel;
      planSteamChip.style.display = 'none';
      metaMobile.textContent = '';
      return;
    }

    const esc = escapeHtml;
    const t = plan.timings || {};
    const steamText = (plan.steam && plan.steam.focus && plan.steam.focus.length)
      ? `STEAM: ${plan.steam.focus.join(' + ')}` : '';
    const periodText = `${plan.periodLength} minute period`;

    activeTopicClass.textContent = [classLabel, periodText].filter(Boolean).join(' · ');
    planSteamChip.textContent = steamText;
    planSteamChip.style.display = steamText ? 'inline-block' : 'none';
    metaMobile.innerHTML = `${esc(periodText)}${steamText ? ` · <strong>${esc(steamText)}</strong>` : ''}`;

    // Minute ranges are worked out from the timings so they always add up to the period length
    let cursor = 0;
    const range = (mins) => {
      const from = cursor;
      cursor += Number(mins) || 0;
      return `${from}–${cursor} min`;
    };
    const row = (time, title, body, cls, emoji) => `
      <div class="period-row ${cls}">
        <div class="period-time">${esc(time)}</div>
        <div class="period-body"><h3><span class="emoji" aria-hidden="true">${emoji}</span> ${esc(title)}</h3>${body}</div>
      </div>`;

    const gw = plan.groupWork || {};
    const board = (plan.explain && plan.explain.board) || [];
    const ticket = (plan.check && plan.check.exitTicket) || [];

    timeline.innerHTML = [
      row(range(t.hook), 'Hook', `<p>${esc(plan.hook)}</p>`, 'sec-hook', '💡'),
      row(range(t.explain), 'Explain', `
        <p>${esc(plan.explain && plan.explain.steps)}</p>
        ${board.length ? `<div class="board-box"><span class="board-label">Write on the board</span>${board.map(l => `<div>${esc(l)}</div>`).join('')}</div>` : ''}`, 'sec-explain', '📖'),
      row(range(t.groupWork), 'Group work: both groups at the same time', `
        <div class="group-grid">
          <div class="group-box foundation"><strong>Basic</strong><p>${esc(gw.foundation)}</p></div>
          <div class="group-box core"><strong>Advanced</strong><p>${esc(gw.core)}</p></div>
        </div>
        ${gw.finishedEarly ? `<p class="finished-early">Finished early? ${esc(gw.finishedEarly)}</p>` : ''}`, 'sec-group', '👥'),
      row(range(t.check), 'Check', ticket.length
        ? `<p>Exit ticket: 3 quick questions.</p><ol class="ticket-list">${ticket.map(q => `<li>${esc(String(q).replace(/^\s*\d+[.)]\s*/, ''))}</li>`).join('')}</ol>`
        : '<p>Exit ticket: 3 quick questions.</p>', 'sec-check', '✅'),
      row(range(t.homework), 'Homework', `<p>${esc(plan.homework)}</p>`, 'sec-homework', '🏠')
    ].join('');

    const card = (title, body, cls = '', emoji = '') => `<div class="extra-card ${cls}"><h3>${emoji ? `<span class="emoji" aria-hidden="true">${emoji}</span> ` : ''}${esc(title)}</h3>${body}</div>`;
    const materials = plan.materials || [];
    extras.innerHTML = [
      plan.steam && plan.steam.activity ? card('STEAM activity', `<p>${esc(plan.steam.activity)}</p>`, 'sec-steam', '🔬') : '',
      plan.classManagement ? card('Class management', `<p>${esc(plan.classManagement)}</p>`) : '',
      materials.length ? card('You will need', `<p>${materials.map(esc).join(', ')}</p>`) : ''
    ].join('');
  }

  // Plain-text version of the Period Plan for Copy / Share
  function buildPeriodPlanText(plan) {
    if (!plan || !plan.hook) return '';
    const t = plan.timings || {};
    let cursor = 0;
    const range = (mins) => {
      const from = cursor;
      cursor += Number(mins) || 0;
      return `${from}-${cursor} min`;
    };
    const gw = plan.groupWork || {};
    const lines = [];
    lines.push(`--- PERIOD PLAN (${plan.periodLength} minutes) ---`);
    lines.push(`${range(t.hook)} HOOK: ${plan.hook}`);
    lines.push(`${range(t.explain)} EXPLAIN: ${plan.explain.steps}`);
    if (plan.explain.board.length) lines.push(`  Write on the board:\n${plan.explain.board.map(l => `   - ${l}`).join('\n')}`);
    lines.push(`${range(t.groupWork)} GROUP WORK (all groups at the same time):`);
    lines.push(`  Basic: ${gw.foundation}`);
    lines.push(`  Advanced: ${gw.core}`);
    if (gw.finishedEarly) lines.push(`  Finished early: ${gw.finishedEarly}`);
    lines.push(`${range(t.check)} CHECK (exit ticket):`);
    plan.check.exitTicket.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
    lines.push(`${range(t.homework)} HOMEWORK: ${plan.homework}`);
    if (plan.steam.activity) lines.push(`\nSTEAM${plan.steam.focus.length ? ` (${plan.steam.focus.join(', ')})` : ''}: ${plan.steam.activity}`);
    if (plan.classManagement) lines.push(`\nCLASS MANAGEMENT: ${plan.classManagement}`);
    if (plan.materials.length) lines.push(`\nYOU WILL NEED: ${plan.materials.join(', ')}`);
    return lines.join('\n') + '\n\n';
  }

  // Splits "Photosynthesis for Grade 7" into a heading and a "Class 7" label
  function splitTopicAndClass(topic) {
    const text = (topic || '').trim();
    const levelMatch = text.match(/\(?\b([oa])\s*level\b\)?/i);
    if (levelMatch) {
      const levelTitle = text.replace(levelMatch[0], '').replace(/\s+(?:for|in)\s*$/i, '').replace(/[\s,\-–:]+$/, '').trim();
      return { title: levelTitle || text, classLabel: `${levelMatch[1].toUpperCase()} Level` };
    }
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
    if (navTopicTitle) navTopicTitle.textContent = classLabel ? `${title} · ${classLabel}` : title;
    appLayout.classList.add('is-plan-view');

    const data = thread.initialResponse;

    // "SLOs covered" box (only for plans made with pasted SLOs)
    if (sloCovered && sloCoveredList) {
      const slos = Array.isArray(data.slos) ? data.slos : [];
      sloCoveredList.innerHTML = slos.map(s => `<li>${escapeHtml(s)}</li>`).join('');
      sloCovered.style.display = slos.length ? '' : 'none';
    }

    // Period Plan tab (plans made before this feature have none, so the tab is hidden for them)
    const hasPeriodPlan = !!(data.periodPlan && data.periodPlan.hook);
    renderPeriodPlan(hasPeriodPlan ? data.periodPlan : null, classLabel);
    periodTabBtn.style.display = hasPeriodPlan ? '' : 'none';
    showLevelTab(hasPeriodPlan ? 'period' : 'foundation');

    const foundation = data.foundation || data.beginner || data.weak || {};
    const core = data.core || data.intermediate || data.medium || {};

    weakHowToExplain.textContent = foundation.howToExplain || 'No explanation available.';
    renderExerciseList(weakExercises, foundation.exercises || []);

    mediumHowToExplain.textContent = core.howToExplain || 'No explanation available.';
    renderExerciseList(mediumExercises, core.exercises || []);

    const tipsName = tipsLabel(data);
    document.querySelector('.level-tab-btn.engagement-tab').textContent = tipsName;
    document.querySelector('#engagementCard .level-pill').textContent = tipsName;
    document.querySelector('.engagement-intro').style.display = tipsName === 'Engagement Tips' ? '' : 'none';
    engagementList.innerHTML = '';
    const tips = engagementLines(data);
    if (!tips.length) tips.push('No engagement tips for this plan.');
    tips.forEach(t => { const li = document.createElement('li'); li.textContent = t; engagementList.appendChild(li); });

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
    
    if (Array.isArray(data.slos) && data.slos.length) {
      fullText += 'SLOs COVERED:\n' + data.slos.map((s, i) => ` ${i + 1}. ${s}`).join('\n') + '\n\n';
    }

    // 0. Period Plan (minute by minute)
    fullText += buildPeriodPlanText(data.periodPlan);

    // 1. Basic
    const foundation = data.foundation || data.beginner || data.weak || {};
    fullText += `--- 1. BASIC ---\nHow to Explain: ${foundation.howToExplain || ''}\nExercises:\n`;
    (foundation.exercises || []).forEach((ex, i) => fullText += ` ${i+1}. ${ex}\n`);

    // 2. Advanced
    const core = data.core || data.intermediate || data.medium || {};
    fullText += `\n--- 2. ADVANCED ---\nHow to Explain: ${core.howToExplain || ''}\nExercises:\n`;
    (core.exercises || []).forEach((ex, i) => fullText += ` ${i+1}. ${ex}\n`);

    // 3. Engagement tips
    if (engagementLines(data).length) {
      fullText += `\n--- ${tipsLabel(data).toUpperCase()} ---\n${engagementLines(data).map((t, i) => ` ${i+1}. ${t}`).join('\n')}\n`;
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
