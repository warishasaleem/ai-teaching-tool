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

// Groq models, period timings and prompts live in ai-config.js
const {
  GROQ_MODELS,
  GENERATE_SETTINGS,
  FOLLOWUP_SETTINGS,
  PERIOD_LENGTHS,
  DEFAULT_PERIOD_LENGTH,
  PERIOD_TIMINGS,
  buildGenerateSystemPrompt,
  buildGenerateUserPrompt,
  buildFollowupSystemPrompt
} = require('./ai-config');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'warikhan1995@gmail.com';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'teacherai.support@gmail.com';

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
    const err = new Error('Service is busy right now. Please try again in a moment.');
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
    const err = new Error('Service is busy right now. Please try again in a moment.');
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
    const err = new Error('Service is busy right now. Please try again in a moment.');
    err.status = 503;
    throw err;
  }
}

// Helper: Increment monthly generation count strictly in Cloud Firestore collection 'usageCounters'
async function incrementMonthlyUsage(email, userId) {
  if (!firestoreDb) {
    console.error('[Firestore Error] Cloud Firestore not connected:', firestoreInitError);
    const err = new Error('Service is busy right now. Please try again in a moment.');
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
    const err = new Error('Service is busy right now. Please try again in a moment.');
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
    content = content.replace(/teacherai\.support@gmail\.com|support@example\.com/g, CONTACT_EMAIL);
    res.type('html').send(content);
  } catch (err) {
    res.sendFile(filePath);
  }
});

app.get(['/terms', '/terms.html'], (req, res) => {
  const filePath = path.join(__dirname, 'public', 'terms.html');
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/teacherai\.support@gmail\.com|support@example\.com/g, CONTACT_EMAIL);
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

// Helper: Clean the AI's period plan into a fixed shape; minutes always come from PERIOD_TIMINGS
function normalizePeriodPlan(raw, periodLength) {
  const p = (raw && typeof raw === 'object') ? raw : {};
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const list = (v) => {
    if (Array.isArray(v)) return v.map(item => String(item).trim()).filter(Boolean);
    return typeof v === 'string' && v.trim() ? [v.trim()] : [];
  };
  const asObject = (v, key) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : { [key]: v };
  const explain = asObject(p.explain, 'steps');
  const groupWork = asObject(p.groupWork, 'foundation');
  const check = asObject(p.check, 'exitTicket');
  const steam = asObject(p.steam, 'activity');

  return {
    periodLength,
    timings: { ...PERIOD_TIMINGS[periodLength] },
    hook: text(p.hook),
    explain: { steps: text(explain.steps), board: list(explain.board) },
    groupWork: {
      foundation: text(groupWork.foundation),
      core: text(groupWork.core),
      finishedEarly: text(groupWork.finishedEarly)
    },
    check: { exitTicket: list(check.exitTicket) },
    homework: text(p.homework),
    steam: { focus: list(steam.focus), activity: text(steam.activity) },
    classManagement: text(p.classManagement),
    materials: list(p.materials)
  };
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
      error: 'Service is busy right now. Please try again in a moment.'
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

    // Optional SLOs pasted by the teacher: max ~1000 chars, one SLO per line
    const slos = (typeof req.body.slos === 'string' ? req.body.slos.slice(0, 1000) : '')
      .split(/\r?\n/)
      .map(l => l.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 10);

    const requestedLength = Number(req.body.periodLength);
    const periodLength = PERIOD_LENGTHS.includes(requestedLength) ? requestedLength : DEFAULT_PERIOD_LENGTH;

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

    const basePayload = {
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildGenerateSystemPrompt(periodLength) },
        { role: 'user', content: buildGenerateUserPrompt(topic.trim(), slos) }
      ],
      ...GENERATE_SETTINGS
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

    responseJSON = {
      greeting: responseJSON.greeting || `Here is your differentiated lesson plan for "${topic.trim()}".`,
      periodPlan: normalizePeriodPlan(responseJSON.periodPlan, periodLength),
      foundation: foundationData,
      core: coreData,
      ...(slos.length ? { slos } : {}),
      beginner: foundationData,            // Backward compatibility alias
      intermediate: coreData,              // Backward compatibility alias
      engagementTips: (Array.isArray(responseJSON.engagementTips) ? responseJSON.engagementTips : [])
        .map(t => String(t).trim()).filter(Boolean).slice(0, 5)
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
      error: 'Service is busy right now. Please try again in a moment.'
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

    const systemPrompt = buildFollowupSystemPrompt(topic, initialResponse);

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
      ...FOLLOWUP_SETTINGS
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
      error: 'Service is busy right now. Please try again in a moment.'
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
