const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Automatically load environment variables from .env file
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of envLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (key && !process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
} catch (e) {
  console.warn('[Env Loader] Could not read .env file:', e.message);
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Fallback Model List to guarantee 100% uptime and zero rate-limit crashes
const GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'groq/compound-mini',
  'groq/compound'
];

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'warikhan1995@gmail.com';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'support@example.com';

// Monthly Free Plan Generation Limit per User
const MONTHLY_FREE_LIMIT = 10;

// Persistent Usage Storage (Local cache + Cloud Firestore)
const USAGE_DATA_DIR = path.join(__dirname, 'data');
const USAGE_DATA_FILE = path.join(USAGE_DATA_DIR, 'usageCounters.json');

if (!fs.existsSync(USAGE_DATA_DIR)) {
  try {
    fs.mkdirSync(USAGE_DATA_DIR, { recursive: true });
  } catch (e) {
    console.warn('[Usage Storage] Could not create data directory:', e.message);
  }
}

let localUsageStore = {};
try {
  if (fs.existsSync(USAGE_DATA_FILE)) {
    const raw = fs.readFileSync(USAGE_DATA_FILE, 'utf8');
    localUsageStore = JSON.parse(raw);
  } else {
    fs.writeFileSync(USAGE_DATA_FILE, '{}', 'utf8');
  }
} catch (e) {
  console.warn('[Usage Storage] Failed reading local usage cache file:', e.message);
  localUsageStore = {};
}

function saveUsageStoreToFile() {
  try {
    fs.writeFileSync(USAGE_DATA_FILE, JSON.stringify(localUsageStore, null, 2), 'utf8');
  } catch (e) {
    console.error('[Usage Storage] Failed writing local usage cache file:', e.message);
  }
}

// Optional Cloud Firestore connection via firebase-admin
let firestoreDb = null;
try {
  const admin = require('firebase-admin');
  const { getFirestore } = require('firebase-admin/firestore');

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    } catch (e) {
      serviceAccount = require(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_KEY));
    }
    const adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'teacher-ai-ab79f'
    });
    firestoreDb = getFirestore(adminApp);
    console.log('[Firebase Admin] Connected to Cloud Firestore with service account.');
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const adminApp = admin.initializeApp({
      projectId: 'teacher-ai-ab79f'
    });
    firestoreDb = getFirestore(adminApp);
    console.log('[Firebase Admin] Connected to Cloud Firestore via GOOGLE_APPLICATION_CREDENTIALS.');
  }
} catch (e) {
  console.warn('[Firebase Admin] Cloud Firestore note:', e.message);
}

// Helper: Format current calendar month as YYYY-MM
function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Helper: Retrieve user monthly usage
async function getMonthlyUsage(email) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const monthKey = getCurrentMonthKey();
  const counterId = `${cleanEmail}_${monthKey}`;

  // Ensure latest persisted data is synced into local cache
  try {
    if (fs.existsSync(USAGE_DATA_FILE)) {
      const raw = fs.readFileSync(USAGE_DATA_FILE, 'utf8');
      const diskData = JSON.parse(raw);
      if (diskData && typeof diskData === 'object') {
        localUsageStore = { ...diskData, ...localUsageStore };
      }
    }
  } catch (e) {
    // Ignore read errors and use memory cache
  }

  let record = localUsageStore[counterId] || null;

  // Sync from Cloud Firestore if available
  if (firestoreDb) {
    try {
      const snap = await firestoreDb.collection('usageCounters').doc(counterId).get();
      if (snap.exists) {
        const data = snap.data();
        if (data && typeof data.count === 'number') {
          if (!record || data.count > record.count) {
            record = {
              counterId,
              email: cleanEmail,
              month: monthKey,
              count: data.count,
              updatedAt: data.updatedAt,
              lastGeneratedAt: data.lastGeneratedAt
            };
            localUsageStore[counterId] = record;
            saveUsageStoreToFile();
          }
        }
      }
    } catch (fsErr) {
      console.warn(`[Firestore] Read error for ${counterId}:`, fsErr.message);
    }
  }

  const count = record && typeof record.count === 'number' ? record.count : 0;
  const remaining = Math.max(0, MONTHLY_FREE_LIMIT - count);
  const limitReached = count >= MONTHLY_FREE_LIMIT;

  return {
    counterId,
    email: cleanEmail,
    month: monthKey,
    count,
    limit: MONTHLY_FREE_LIMIT,
    remaining,
    limitReached
  };
}

// Helper: Increment monthly generation count on the server before calling AI
async function incrementMonthlyUsage(email, userId) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const monthKey = getCurrentMonthKey();
  const counterId = `${cleanEmail}_${monthKey}`;
  const now = new Date();

  const current = await getMonthlyUsage(cleanEmail);
  if (current.limitReached) {
    return {
      allowed: false,
      count: current.count,
      remaining: 0,
      limitReached: true,
      error: 'Free limit reached. Contact us for a School License'
    };
  }

  const newCount = current.count + 1;
  const updatedRecord = {
    counterId,
    email: cleanEmail,
    userId: userId || '',
    month: monthKey,
    count: newCount,
    updatedAt: now.toISOString(),
    lastGeneratedAt: now.toISOString()
  };

  localUsageStore[counterId] = updatedRecord;
  saveUsageStoreToFile();

  // Persist to Firestore if available
  if (firestoreDb) {
    try {
      const { FieldValue } = require('firebase-admin/firestore');
      await firestoreDb.collection('usageCounters').doc(counterId).set({
        email: cleanEmail,
        userId: userId || '',
        month: monthKey,
        count: newCount,
        updatedAt: FieldValue.serverTimestamp(),
        lastGeneratedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      console.log(`[Firestore] Successfully synced usage count for ${counterId}: ${newCount}`);
    } catch (fsErr) {
      console.warn(`[Firestore] Write error for ${counterId}:`, fsErr.message);
    }
  }

  return {
    allowed: true,
    count: newCount,
    remaining: Math.max(0, MONTHLY_FREE_LIMIT - newCount),
    limitReached: newCount >= MONTHLY_FREE_LIMIT
  };
}

// Helper: Roll back monthly generation count if AI call fails
async function decrementMonthlyUsage(email) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const monthKey = getCurrentMonthKey();
  const counterId = `${cleanEmail}_${monthKey}`;

  if (localUsageStore[counterId] && typeof localUsageStore[counterId].count === 'number') {
    localUsageStore[counterId].count = Math.max(0, localUsageStore[counterId].count - 1);
    saveUsageStoreToFile();
  }

  if (firestoreDb) {
    try {
      const { FieldValue } = require('firebase-admin/firestore');
      await firestoreDb.collection('usageCounters').doc(counterId).set({
        count: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      // Ignore rollback errors
    }
  }
}

// In-Memory Stats & Logs
let totalLoginCount = 0;
const userLoginLogs = [];

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Favicon route - ensure /favicon.ico does not return 404
app.get('/favicon.ico', (req, res) => {
  res.type('image/svg+xml');
  res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
});

// Safe Client App Configuration
app.get('/api/config', (req, res) => {
  res.json({
    contactEmail: CONTACT_EMAIL
  });
});

// Legal Pages Routes
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'public')));

// Configure Nodemailer Transporter
let transporter = nodemailer.createTransport({
  host: 'smtp.ethereal.email',
  port: 587,
  auth: {
    user: 'ethereal.user@ethereal.email',
    pass: 'ethereal_pass'
  }
});

nodemailer.createTestAccount((err, account) => {
  if (!err && account) {
    transporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: {
        user: account.user,
        pass: account.pass
      }
    });
  }
});

// Resilient helper function to call Groq API with automatic model fallback
async function callGroqAPIWithFallback(basePayload) {
  let lastError = null;

  for (const modelCandidate of GROQ_MODELS) {
    try {
      const payload = { ...basePayload, model: modelCandidate };
      const res = await new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const req = https.request('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          }
        }, (response) => {
          let body = '';
          response.on('data', chunk => body += chunk);
          response.on('end', () => {
            if (response.statusCode >= 200 && response.statusCode < 300) {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(new Error('Failed to parse Groq response JSON'));
              }
            } else {
              reject(new Error(`Groq API Error (${response.statusCode}): ${body}`));
            }
          });
        });

        req.on('error', (err) => reject(err));
        req.write(data);
        req.end();
      });

      console.log(`[Groq API] Successfully used model: ${modelCandidate}`);
      return res;
    } catch (err) {
      console.warn(`[Groq API] Model ${modelCandidate} failed (${err.message}). Trying fallback...`);
      lastError = err;
    }
  }

  throw lastError || new Error('All Groq API models exhausted.');
}

// 1. Endpoint: Login Notification Trigger
app.post('/api/notify-login', async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    totalLoginCount++;
    const timestamp = new Date().toLocaleString();

    const logEntry = {
      id: totalLoginCount,
      name: name || 'Teacher User',
      email: email,
      time: timestamp
    };

    userLoginLogs.unshift(logEntry);
    console.log(`🔔 NEW USER LOGIN ALERT #${totalLoginCount}: ${name} (${email}) at ${timestamp}`);

    // Send Email Alert to ADMIN_EMAIL
    const mailOptions = {
      from: '"TEACHER AI Alert" <no-reply@teacher-ai.org>',
      to: ADMIN_EMAIL,
      subject: `🔔 New User Login Alert #${totalLoginCount}: ${name} (${email})`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #0b0d14; color: #ffffff; border-radius: 10px;">
          <h2 style="color: #6366f1;">🔔 TEACHER AI - New Sign-In Notification</h2>
          <p>A new teacher has just signed into the TEACHER AI portal!</p>
          <hr style="border-color: #333;" />
          <p><strong>Teacher Name:</strong> ${name || 'Educator'}</p>
          <p><strong>Teacher Email:</strong> ${email}</p>
          <p><strong>Sign-In Time:</strong> ${timestamp}</p>
          <p><strong>Total Sign-In Count:</strong> <span style="font-size: 1.2rem; color: #10b981; font-weight: bold;">${totalLoginCount}</span></p>
          <hr style="border-color: #333;" />
          <p style="font-size: 0.8rem; color: #aaa;">Automated notification sent to ${ADMIN_EMAIL}.</p>
        </div>
      `
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (!error) {
        console.log(`[Email Notifier] Notification sent to ${ADMIN_EMAIL}`);
      }
    });

    return res.json({
      success: true,
      message: `Notification sent to ${ADMIN_EMAIL}`,
      totalLoginCount: totalLoginCount
    });

  } catch (err) {
    console.error('Error in /api/notify-login:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Admin Users Dashboard Route
app.get('/admin/users', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 2b. Admin Stats Endpoint (does not expose raw admin email)
app.get('/api/admin/stats', (req, res) => {
  return res.json({
    success: true,
    totalLoginCount: totalLoginCount,
    recentLogins: userLoginLogs.slice(0, 50)
  });
});

// 2c. Admin Verify Endpoint (checks if current email is the authorized administrator)
app.post('/api/admin/verify', (req, res) => {
  const { email } = req.body || {};
  const cleanEmail = (email || '').toLowerCase().trim();
  const adminEmails = ADMIN_EMAIL.split(',').map(e => e.trim().toLowerCase());
  const isAdmin = cleanEmail.length > 0 && adminEmails.includes(cleanEmail);
  return res.json({ success: true, isAdmin });
});

// 2d. Monthly Usage Endpoint (Query free plan status for teacher)
app.get('/api/user/usage', async (req, res) => {
  try {
    const { email } = req.query;
    const cleanEmail = (email || '').toLowerCase().trim();
    if (!cleanEmail) {
      return res.status(400).json({ success: false, error: 'Email parameter is required.' });
    }

    const usage = await getMonthlyUsage(cleanEmail);
    return res.json({
      success: true,
      ...usage
    });
  } catch (err) {
    console.error('Error in /api/user/usage:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Initial Topic Generation Endpoint (Strictly Enforces 10 Plans/Month Server-Side)
app.post('/api/generate', async (req, res) => {
  let usageIncremented = false;
  let cleanEmail = '';
  try {
    const { topic, email, userId } = req.body;
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ success: false, error: 'Topic is required.' });
    }

    cleanEmail = (email || '').toLowerCase().trim();
    if (!cleanEmail) {
      return res.status(400).json({ success: false, error: 'Teacher email is required to verify monthly usage.' });
    }

    // 1. SERVER-SIDE CHECK: Check monthly usage limit BEFORE calling Groq AI
    const usageCheck = await getMonthlyUsage(cleanEmail);
    if (usageCheck.limitReached) {
      console.warn(`[Usage Limit] Blocked generation request for ${cleanEmail} (Free limit of ${MONTHLY_FREE_LIMIT} reached).`);
      return res.status(403).json({
        success: false,
        error: 'Free limit reached. Contact us for a School License',
        limitReached: true,
        count: usageCheck.count,
        limit: MONTHLY_FREE_LIMIT,
        remaining: 0
      });
    }

    // 2. SERVER-SIDE UPDATE: Increment count on server before calling the AI
    const usageUpdate = await incrementMonthlyUsage(cleanEmail, userId);
    if (!usageUpdate.allowed) {
      return res.status(403).json({
        success: false,
        error: 'Free limit reached. Contact us for a School License',
        limitReached: true,
        count: usageUpdate.count,
        limit: MONTHLY_FREE_LIMIT,
        remaining: 0
      });
    }
    usageIncremented = true;

    console.log(`[Usage Limit] Teacher ${cleanEmail} generated plan: count=${usageUpdate.count}/${MONTHLY_FREE_LIMIT}, remaining=${usageUpdate.remaining}`);

    const systemPrompt = `You are TEACHER AI, a world-class AI teaching assistant built for educators.
Your goal is to generate differentiated teaching content tailored for 3 student learning levels (Foundation, Core, Advanced).

MUST FOLLOW THIS EXACT RESPONSE STRUCTURE & FORMAT:
1. GREETING — short, warm opening line addressing the teacher.
2. THREE CATEGORY SECTIONS clearly structured:
   - "Foundation": simpler language, basic exercises, step-by-step breakdown.
   - "Core": moderate difficulty, balanced explanation + practice.
   - "Advanced": advanced exercises, deeper conceptual questions.
   
   EACH category must include:
   - "howToExplain": Short explanation of how to present the topic to this student level.
   - "exercises": Array of MINIMUM 5 exercises/questions (mix of MCQs, short answer, applied questions).

3. "teachingTips" — 1-2 paragraphs giving a general teaching strategy for this topic.

STRICT JSON OUTPUT REQUIREMENT:
Return ONLY a valid raw JSON object matching this exact schema:
{
  "greeting": "Short warm opening line...",
  "foundation": {
    "howToExplain": "...",
    "exercises": [
      "1. ...",
      "2. ...",
      "3. ...",
      "4. ...",
      "5. ..."
    ]
  },
  "core": {
    "howToExplain": "...",
    "exercises": [
      "1. ...",
      "2. ...",
      "3. ...",
      "4. ...",
      "5. ..."
    ]
  },
  "advanced": {
    "howToExplain": "...",
    "exercises": [
      "1. ...",
      "2. ...",
      "3. ...",
      "4. ...",
      "5. ..."
    ]
  },
  "teachingTips": "..."
}`;

    const basePayload = {
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Topic to teach: "${topic.trim()}"` }
      ],
      temperature: 0.7,
      max_tokens: 2500
    };

    const groqRes = await callGroqAPIWithFallback(basePayload);
    let rawContent = groqRes.choices?.[0]?.message?.content || '';

    // Clean JSON content if wrapped in code blocks
    rawContent = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();

    let structuredData;
    try {
      structuredData = JSON.parse(rawContent);
    } catch (parseError) {
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) {
        structuredData = JSON.parse(match[0]);
      } else {
        throw new Error('Could not extract JSON from AI response.');
      }
    }

    // Ensure array structure and fallbacks (supports foundation/core/advanced with backward compatibility for beginner/weak, intermediate/medium, advanced/intelligent)
    const fallbackCategory = (keys, defaultHow) => {
      let catObj = null;
      for (const k of keys) {
        if (structuredData && structuredData[k]) {
          catObj = structuredData[k];
          break;
        }
      }
      if (!catObj) catObj = {};
      const primaryKey = keys[0];
      const exercisesList = Array.isArray(catObj.exercises) && catObj.exercises.length >= 5
        ? catObj.exercises
        : (catObj.exercises || []).concat(
            Array.from({ length: Math.max(0, 5 - (catObj.exercises?.length || 0)) }, (_, i) => `Exercise ${i + 1} for ${primaryKey} level on ${topic}`)
          );
      return {
        howToExplain: catObj.howToExplain || defaultHow,
        exercises: exercisesList
      };
    };

    const foundationData = fallbackCategory(['foundation', 'beginner', 'weak'], 'Break down concepts into simple visual parts.');
    const coreData = fallbackCategory(['core', 'intermediate', 'medium'], 'Combine core explanations with practical practice questions.');
    const advancedData = fallbackCategory(['advanced', 'intelligent'], 'Challenge students with critical thinking and real-world applications.');

    const responseJSON = {
      greeting: structuredData.greeting || `Hello Teacher! Here is your structured teaching guide for "${topic}".`,
      foundation: foundationData,
      core: coreData,
      advanced: advancedData,
      // Legacy aliases for backward compatibility with previously saved client threads
      beginner: foundationData,
      intermediate: coreData,
      weak: foundationData,
      medium: coreData,
      intelligent: advancedData,
      teachingTips: structuredData.teachingTips || 'Engage students with interactive discussions, quick checks for understanding, and practical examples.'
    };

    return res.json({
      success: true,
      data: responseJSON,
      usage: {
        count: usageUpdate.count,
        limit: MONTHLY_FREE_LIMIT,
        remaining: usageUpdate.remaining,
        limitReached: usageUpdate.limitReached
      }
    });
  } catch (err) {
    if (usageIncremented && cleanEmail) {
      await decrementMonthlyUsage(cleanEmail);
      console.warn(`[Usage Limit] Rolled back usage count for ${cleanEmail} due to AI error: ${err.message}`);
    }
    console.error('Error in /api/generate:', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error while generating lesson plan.' });
  }
});

// 4. Follow-Up Chat Endpoint
app.post('/api/followup', async (req, res) => {
  try {
    const { topic, initialResponse, history, message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Follow-up message is required.' });
    }

    const systemPrompt = `You are TEACHER AI, an interactive AI teaching assistant.
The teacher is currently asking follow-up questions about the topic: "${topic || 'Lesson Topic'}".

Context of Initial Differentiated Teaching Plan provided earlier:
Greeting: ${initialResponse?.greeting || ''}
Foundation Level How To Explain: ${initialResponse?.foundation?.howToExplain || initialResponse?.beginner?.howToExplain || initialResponse?.weak?.howToExplain || ''}
Core Level How To Explain: ${initialResponse?.core?.howToExplain || initialResponse?.intermediate?.howToExplain || initialResponse?.medium?.howToExplain || ''}
Advanced Level How To Explain: ${initialResponse?.advanced?.howToExplain || initialResponse?.intelligent?.howToExplain || ''}
Teaching Tips: ${initialResponse?.teachingTips || ''}

Instructions:
- Provide clear, direct, and practical answers for teachers.
- If the teacher asks to modify exercises, add questions, simplify explanations, or create a quiz/worksheet, provide the requested content directly with clear formatting using markdown (bullet points, bold text, numbered lists).
- Keep your tone warm, encouraging, and highly professional.`;

    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    if (Array.isArray(history)) {
      history.forEach(item => {
        if (item.sender === 'user' || item.role === 'user') {
          messages.push({ role: 'user', content: item.content || item.text || '' });
        } else if (item.sender === 'assistant' || item.role === 'assistant') {
          messages.push({ role: 'assistant', content: item.content || item.text || '' });
        }
      });
    }

    messages.push({ role: 'user', content: message.trim() });

    const basePayload = {
      messages: messages,
      temperature: 0.7,
      max_tokens: 2000
    };

    const groqRes = await callGroqAPIWithFallback(basePayload);
    const reply = groqRes.choices?.[0]?.message?.content || 'I am ready to help refine your lesson plan.';

    return res.json({ success: true, reply: reply });
  } catch (err) {
    console.error('Error in /api/followup:', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error processing follow-up.' });
  }
});

// 5. Catch-All Route: Branded 404 Page matching dark theme
app.use((req, res) => {
  res.status(404);
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, 'public', '404.html'));
  } else if (req.accepts('json')) {
    res.json({ success: false, error: 'Not Found' });
  } else {
    res.type('txt').send('404 Not Found');
  }
});

const server = app.listen(PORT, () => {
  console.log(`TEACHER AI Server is running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const ALT_PORT = PORT + 1;
    console.log(`Port ${PORT} in use, trying http://localhost:${ALT_PORT}...`);
    app.listen(ALT_PORT, () => {
      console.log(`TEACHER AI Server is running on http://localhost:${ALT_PORT}`);
    });
  } else {
    console.error('Server error:', err);
  }
});
