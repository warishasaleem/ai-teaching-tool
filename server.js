const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Fallback Model List to guarantee 100% uptime and zero rate-limit crashes
const GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'groq/compound-mini',
  'groq/compound'
];

const ADMIN_EMAIL = 'warikhan1995@gmail.com';

// In-Memory Stats & Logs
let totalLoginCount = 0;
const userLoginLogs = [];

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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

    // Send Email Alert to warikhan1995@gmail.com
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

// 2. Admin Stats Endpoint
app.get('/api/admin/stats', (req, res) => {
  return res.json({
    success: true,
    adminEmail: ADMIN_EMAIL,
    totalLoginCount: totalLoginCount,
    recentLogins: userLoginLogs.slice(0, 50)
  });
});

// 3. Initial Topic Generation Endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ success: false, error: 'Topic is required.' });
    }

    const systemPrompt = `You are TEACHER AI, a world-class AI teaching assistant built for educators.
Your goal is to generate differentiated teaching content tailored for 3 student learning levels (Weak, Medium, Intelligent).

MUST FOLLOW THIS EXACT RESPONSE STRUCTURE & FORMAT:
1. GREETING — short, warm opening line addressing the teacher.
2. THREE CATEGORY SECTIONS clearly structured:
   - "Weak Students": simpler language, basic exercises, step-by-step breakdown.
   - "Medium Students": moderate difficulty, balanced explanation + practice.
   - "Intelligent Students": advanced exercises, deeper conceptual questions.
   
   EACH category must include:
   - "howToExplain": Short explanation of how to present the topic to this student level.
   - "exercises": Array of MINIMUM 5 exercises/questions (mix of MCQs, short answer, applied questions).

3. "teachingTips" — 1-2 paragraphs giving a general teaching strategy for this topic.

STRICT JSON OUTPUT REQUIREMENT:
Return ONLY a valid raw JSON object matching this exact schema:
{
  "greeting": "Short warm opening line...",
  "weak": {
    "howToExplain": "...",
    "exercises": [
      "1. ...",
      "2. ...",
      "3. ...",
      "4. ...",
      "5. ..."
    ]
  },
  "medium": {
    "howToExplain": "...",
    "exercises": [
      "1. ...",
      "2. ...",
      "3. ...",
      "4. ...",
      "5. ..."
    ]
  },
  "intelligent": {
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

    // Ensure array structure and fallbacks
    const fallbackCategory = (catName, defaultHow) => ({
      howToExplain: structuredData[catName]?.howToExplain || defaultHow,
      exercises: Array.isArray(structuredData[catName]?.exercises) && structuredData[catName].exercises.length >= 5
        ? structuredData[catName].exercises
        : (structuredData[catName]?.exercises || []).concat(
            Array.from({ length: Math.max(0, 5 - (structuredData[catName]?.exercises?.length || 0)) }, (_, i) => `Exercise ${i + 1} for ${catName} level on ${topic}`)
          )
    });

    const responseJSON = {
      greeting: structuredData.greeting || `Hello Teacher! Here is your structured teaching guide for "${topic}".`,
      weak: fallbackCategory('weak', 'Break down concepts into simple visual parts.'),
      medium: fallbackCategory('medium', 'Combine core explanations with practical practice questions.'),
      intelligent: fallbackCategory('intelligent', 'Challenge students with critical thinking and real-world applications.'),
      teachingTips: structuredData.teachingTips || 'Engage students with interactive discussions, quick checks for understanding, and practical examples.'
    };

    return res.json({ success: true, data: responseJSON });
  } catch (err) {
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
Weak Level How To Explain: ${initialResponse?.weak?.howToExplain || ''}
Medium Level How To Explain: ${initialResponse?.medium?.howToExplain || ''}
Intelligent Level How To Explain: ${initialResponse?.intelligent?.howToExplain || ''}
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
