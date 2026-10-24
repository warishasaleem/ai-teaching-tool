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
          if (key) {
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

// ============================================================================
// Firebase Admin SDK & Cloud Firestore Connection
// Strictly loads service account key from GOOGLE_APPLICATION_CREDENTIALS path
// ============================================================================
let firestoreDb = null;
let adminAuth = null;
let firestoreInitError = null;

try {
  const admin = require('firebase-admin');
  const { getFirestore } = require('firebase-admin/firestore');
  const { getAuth } = require('firebase-admin/auth');

  const credPathEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPathEnv || !credPathEnv.trim()) {
    firestoreInitError = 'GOOGLE_APPLICATION_CREDENTIALS environment variable is not set in .env.';
    console.error(`[Firebase Admin Error] ${firestoreInitError}`);
  } else {
    const rawPath = credPathEnv.trim().replace(/^["']|["']$/g, '');
    const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(__dirname, rawPath);

    if (!fs.existsSync(resolvedPath)) {
      firestoreInitError = `Firebase service account key file not found at: ${resolvedPath}`;
      console.error(`[Firebase Admin Error] ${firestoreInitError}`);
    } else {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = resolvedPath;
      let credential;
      if (typeof admin.cert === 'function') {
        credential = admin.cert(require(resolvedPath));
      } else if (admin.credential && typeof admin.credential.cert === 'function') {
        credential = admin.credential.cert(require(resolvedPath));
      } else if (typeof admin.applicationDefault === 'function') {
        credential = admin.applicationDefault();
      }

      const adminApp = admin.initializeApp({
        credential,
        projectId: 'teacher-ai-ab79f'
      });

      firestoreDb = getFirestore(adminApp);
      adminAuth = getAuth(adminApp);
      console.log(`[Firebase Admin] Successfully connected to Cloud Firestore with service account key: ${resolvedPath}`);
    }
  }
} catch (e) {
  firestoreInitError = `Failed to initialize Firebase Admin SDK: ${e.message}`;
  console.error(`[Firebase Admin Error] ${firestoreInitError}`);
}

// Helper: Verify Firebase ID token from Authorization header or body
// Returns decoded token object { uid, email, email_verified, ... } or throws 401/503 error
async function verifyFirebaseTokenFromRequest(req) {
  if (!adminAuth) {
    console.error('[Auth Error] Admin Auth is not initialized:', firestoreInitError);
    const err = new Error('Service abhi available nahi, thori der baad try karein');
    err.status = 503;
    throw err;
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  let idToken = null;

  if (authHeader && typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer ')) {
      idToken = authHeader.slice(7).trim();
    } else {
      idToken = authHeader.trim();
    }
  } else if (req.body && req.body.idToken) {
    idToken = req.body.idToken;
  }

  if (!idToken) {
    const err = new Error('Unauthorized: Firebase ID token is missing.');
    err.status = 401;
    throw err;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!decoded || !decoded.email) {
      const err = new Error('Unauthorized: Valid email not associated with token.');
      err.status = 401;
      throw err;
    }
    return decoded;
  } catch (authErr) {
    console.warn('[Firebase Auth Verification Failed]:', authErr.message);
    const err = new Error('Unauthorized: Invalid or expired authentication token.');
    err.status = 401;
    throw err;
  }
}

// Helper: Format current calendar month as YYYY-MM
function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Helper: Retrieve user monthly usage strictly from Cloud Firestore collection 'usageCounters'
async function getMonthlyUsage(email) {
  if (!firestoreDb) {
    console.error('[Firestore Error] Cloud Firestore not connected:', firestoreInitError);
    const err = new Error('Service abhi available nahi, thori der baad try karein');
    err.status = 503;
    throw err;
  }

  const cleanEmail = (email || '').toLowerCase().trim();
  const monthKey = getCurrentMonthKey();
  const counterId = `${cleanEmail}_${monthKey}`;

  try {
    const docRef = firestoreDb.collection('usageCounters').doc(counterId);
    const snap = await docRef.get();

    let count = 0;
    if (snap.exists) {
      const data = snap.data();
      if (data && typeof data.count === 'number') {
        count = Math.max(0, data.count);
      }
    }

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
  } catch (dbErr) {
    console.error(`[Firestore Error] getMonthlyUsage failed for ${counterId}:`, dbErr.message);
    const err = new Error('Service abhi available nahi, thori der baad try karein');
    err.status = 503;
    throw err;
  }
}

// Helper: Increment monthly generation count strictly in Cloud Firestore collection 'usageCounters'
async function incrementMonthlyUsage(email, userId) {
  if (!firestoreDb) {
    console.error('[Firestore Error] Cloud Firestore not connected:', firestoreInitError);
    const err = new Error('Service abhi available nahi, thori der baad try karein');
    err.status = 503;
    throw err;
  }

  const cleanEmail = (email || '').toLowerCase().trim();
  const monthKey = getCurrentMonthKey();
  const counterId = `${cleanEmail}_${monthKey}`;

  // 1. Verify current quota before incrementing
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
  try {
    const { FieldValue } = require('firebase-admin/firestore');
    const docRef = firestoreDb.collection('usageCounters').doc(counterId);

    await docRef.set({
      counterId,
      email: cleanEmail,
      userId: userId || '',
      month: monthKey,
      count: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
      lastGeneratedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`[Firestore] Successfully incremented usage for ${counterId}: ${newCount}/${MONTHLY_FREE_LIMIT}`);

    return {
      allowed: true,
      count: newCount,
      remaining: Math.max(0, MONTHLY_FREE_LIMIT - newCount),
      limitReached: newCount >= MONTHLY_FREE_LIMIT
    };
  } catch (dbErr) {
    console.error(`[Firestore Error] incrementMonthlyUsage failed for ${counterId}:`, dbErr.message);
    const err = new Error('Service abhi available nahi, thori der baad try karein');
    err.status = 503;
    throw err;
  }
}

// Helper: Roll back monthly generation count in Cloud Firestore if AI call fails
async function decrementMonthlyUsage(email) {
  if (!firestoreDb) return;
  const cleanEmail = (email || '').toLowerCase().trim();
  const monthKey = getCurrentMonthKey();
  const counterId = `${cleanEmail}_${monthKey}`;

  try {
    const { FieldValue } = require('firebase-admin/firestore');
    await firestoreDb.collection('usageCounters').doc(counterId).set({
      count: FieldValue.increment(-1),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[Firestore] Rolled back generation count for ${counterId}`);
  } catch (e) {
    console.warn(`[Firestore] Rollback error for ${counterId}:`, e.message);
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

// Legal Pages Routes (with dynamic CONTACT_EMAIL injection)
app.get(['/privacy', '/privacy.html'], (req, res) => {
  const filePath = path.join(__dirname, 'public', 'privacy.html');
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/support@example\.com/g, CONTACT_EMAIL);
    res.type('html').send(content);
  } catch (err) {
    res.sendFile(filePath);
  }
});

app.get(['/terms', '/terms.html'], (req, res) => {
  const filePath = path.join(__dirname, 'public', 'terms.html');
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/support@example\.com/g, CONTACT_EMAIL);
    res.type('html').send(content);
  } catch (err) {
    res.sendFile(filePath);
  }
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
      from: `"TEACHER AI Alert" <${CONTACT_EMAIL}>`,
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

// 2d. Monthly Usage Endpoint (Authenticated via Firebase ID token)
app.get('/api/user/usage', async (req, res) => {
  try {
    // 1. Verify token - DO NOT accept email from URL/body!
    const decodedToken = await verifyFirebaseTokenFromRequest(req);
    const cleanEmail = (decodedToken.email || '').toLowerCase().trim();

    if (!cleanEmail) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User email not found in token.'
      });
    }

    const usage = await getMonthlyUsage(cleanEmail);
    return res.json({
      success: true,
      ...usage
    });
  } catch (err) {
    const statusCode = err.status || 500;
    if (statusCode === 401) {
      return res.status(401).json({
        success: false,
        error: err.message || 'Unauthorized: Valid Firebase ID token is required.'
      });
    }
    console.error('Error in /api/user/usage:', err.message);
    return res.status(503).json({
      success: false,
      error: 'Service abhi available nahi, thori der baad try karein'
    });
  }
});

// 3. Initial Topic Generation Endpoint (Authenticated via Firebase ID token, 10 Plans/Month Limit)
app.post('/api/generate', async (req, res) => {
  let usageIncremented = false;
  let cleanEmail = '';

  try {
    // 1. Verify token - DO NOT accept email from URL/body!
    const decodedToken = await verifyFirebaseTokenFromRequest(req);
    cleanEmail = (decodedToken.email || '').toLowerCase().trim();
    const userId = decodedToken.uid || '';

    if (!cleanEmail) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User email not found in token.'
      });
    }

    const { topic } = req.body;
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ success: false, error: 'Topic is required.' });
    }

    // 2. SERVER-SIDE CHECK: Check monthly usage limit in Firestore BEFORE calling Groq AI
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

    // 3. SERVER-SIDE UPDATE: Increment count in Firestore before calling the AI
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

    console.log(`[Usage Limit] Teacher ${cleanEmail} generating plan: count=${usageUpdate.count}/${MONTHLY_FREE_LIMIT}, remaining=${usageUpdate.remaining}`);

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

    let responseJSON = null;
    try {
      responseJSON = JSON.parse(rawContent);
    } catch (parseErr) {
      console.warn('[JSON Parse Warning] Attempting sanitization on Groq response:', parseErr.message);
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        responseJSON = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse AI output into valid lesson plan JSON.');
      }
    }

    // Ensure array structure and fallbacks for backward compatibility
    const fallbackCategory = (aliases) => {
      for (const a of aliases) {
        if (responseJSON[a] && typeof responseJSON[a] === 'object') {
          return {
            howToExplain: responseJSON[a].howToExplain || '',
            exercises: Array.isArray(responseJSON[a].exercises) ? responseJSON[a].exercises : []
          };
        }
      }
      return { howToExplain: '', exercises: [] };
    };

    const foundationData = fallbackCategory(['foundation', 'beginner', 'weak']);
    const coreData = fallbackCategory(['core', 'intermediate', 'medium']);
    const advancedData = fallbackCategory(['advanced', 'intelligent']);

    responseJSON = {
      greeting: responseJSON.greeting || `Here is your differentiated lesson plan for "${topic.trim()}".`,
      foundation: foundationData,
      core: coreData,
      advanced: advancedData,
      beginner: foundationData,            // Backward compatibility alias
      intermediate: coreData,              // Backward compatibility alias
      teachingTips: responseJSON.teachingTips || responseJSON.tips || ''
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
      console.warn(`[Usage Limit] Rolled back usage count for ${cleanEmail} due to error: ${err.message}`);
    }
    console.error('Error in /api/generate:', err.message);

    const statusCode = err.status || 500;
    if (statusCode === 401) {
      return res.status(401).json({
        success: false,
        error: err.message || 'Unauthorized: Valid Firebase ID token is required.'
      });
    }
    if (statusCode === 400 || statusCode === 403) {
      return res.status(statusCode).json({
        success: false,
        error: err.message
      });
    }

    // Any Firestore or service account or AI connection failure:
    return res.status(503).json({
      success: false,
      error: 'Service abhi available nahi, thori der baad try karein'
    });
  }
});

// 4. Follow-Up Chat Endpoint
app.post('/api/followup', async (req, res) => {
  try {
    const decodedToken = await verifyFirebaseTokenFromRequest(req);
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
    console.error('Error in /api/followup:', err.message);
    const statusCode = err.status || 500;
    if (statusCode === 401) {
      return res.status(401).json({
        success: false,
        error: err.message || 'Unauthorized: Valid Firebase ID token is required.'
      });
    }
    if (statusCode === 400) {
      return res.status(400).json({ success: false, error: err.message });
    }
    return res.status(503).json({
      success: false,
      error: 'Service abhi available nahi, thori der baad try karein'
    });
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

// Process Crash Protection: Log errors without terminating server process
process.on('uncaughtException', (err) => {
  console.error('[Process Uncaught Exception]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process Unhandled Rejection]:', reason);
});
