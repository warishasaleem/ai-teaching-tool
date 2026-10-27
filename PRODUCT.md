# Teacher AI — Product Spec (for Claude Code)

Source: "Teacher AI — Product Pack" (owner: Warisha, 24–25 Oct 2026).
This file is REFERENCE. Build ONE task at a time from "Build order" below. After each task:
test on localhost:3000, bump `app.js?v=` in index.html, tell Warisha, and WAIT. Never commit/push without her OK.

## What the product is
Teacher AI gives a Pakistani school teacher, from one topic, in ~1 minute, a lesson for ONE mixed-ability
class at 3 levels (Foundation, Core, Advanced) — and (new) a full minute-by-minute period plan.
Users now: teachers. Later: head teacher / principal (NOT in this phase).

## Rules (never break)
- `.env` and the Firebase service-account key: never read, print, log, or commit.
- Every change tested on localhost before telling Warisha it is done.
- No `git push --force`, no `npm audit fix --force`.
- Keep the current stack (Express + plain HTML/CSS/JS + Firebase Auth/Firestore + Groq). No new framework.
- Every API (`/api/generate`, `/api/followup`, `/api/user/usage`) requires a Firebase ID token (`Authorization: Bearer`), email taken from the verified token. Already live — don't break it.
- **6 lesson buttons are required — never remove or rename them without asking Warisha:** Printable Pop Quiz, MCQs, Real-Life Examples, Mini Research Task, Related Resources, Challenge Question. All in one row, all open the same simple popup (Copy / Print / Close). Pop Quiz and MCQs also have "Show answers" (answers print on the last page only when shown). They use `/api/followup`, which does not count toward the 10 plans/month limit.
- Firestore collections `usageCounters`, `licenses`, `planCache`, `schools`: server-only (Admin SDK). Browser access stays blocked in firestore.rules.

## Current stack (live)
- Frontend: `public/` (index.html, app.js, style.css), cache-bust with `app.js?v=N`
- Server: Node + Express `server.js`; AI via Groq API
- Auth: Firebase Google sign-in only
- DB: Firestore — `userLogs/{email}` (browser writes own), `usageCounters/{email}_{YYYY-MM}` (server only, 10 plans/month)
- History: browser localStorage `teacher_ai_threads_{email}`
- Hosting: Render free tier, auto-deploy from GitHub `main`

## Build order (one at a time)

### 1. Login flicker fix
On refresh the login screen flashes before the app. Show a full-screen loader (logo + spinner) until the
FIRST `onAuthStateChanged` callback fires. Then: signed out → login card; signed in → app. No flash.

### 2. Minimal UI (see mockup screenshots Warisha will share)
- Light theme default: background #F6F7F9, cards #FFFFFF, borders #E3E5EA, text #16181D, muted #5B616E,
  accent #4F46E5. Font min 16px for body text. Level colours: Foundation orange (#9A3412 on #FFF5EB),
  Core blue (#1D4ED8 on #EEF4FF), Advanced green (#047857 on #ECFDF5).
- Header: only "X free plans left" pill + profile photo. REMOVE from header: Tabs/Grid/Copy/Print/Delete,
  topic chip, user name.
- REMOVE "AI Teaching Assistant — Hello…" banner and "Plan Controls" label.
- Plan page: topic as big heading, "Class X" under it. ONE toolbar above the plan: level tabs + Copy + Print.
  Tabs are default; remove Grid view.
- Remove the long description line under each level; keep level name + colour.
- Quick actions: 3 instead of 6 → Pop quiz, MCQs, Answer key. Follow-up box stays under the plan.
- Sidebar: collapse/expand button at top; collapsed → plan uses full width; default collapsed on mobile.
  Inside: + New topic, search, past topics; user name + sign out at the bottom.
- Empty state (new topic): one centred card — "What are you teaching today?", Topic input, Class select,
  one button, 3 sample topic chips.
- Mobile 390px: single column, level tabs scroll horizontally, Share/Copy buttons at bottom.

### 3. Period Plan (the main differentiator)
- New input: period length 35 / 40 / 45 min (default 40).
- New FIRST tab "Period Plan". AI must return (structured JSON, then render):
  - Hook (~5 min): one everyday local example/question
  - Explain (~10 min): simple steps + "Write on the board" (3–4 short lines)
  - Group work (~15 min): Foundation / Core / Advanced tasks done AT THE SAME TIME + "finished early" task
  - Check (~5 min): 3-question exit ticket
  - Homework (~5 min)
  - Minutes scale to the chosen period length.
  - STEAM: one hands-on activity with cheap materials (paper, bottle, thread) + which S/T/E/A/M it uses
  - Class management: how to seat groups, group leader role, quiet signal
  - "You will need": materials list
- Existing level tabs (Foundation/Core/Advanced explanation + 5+ exercises) stay after it.
- Put the Groq model name and prompts in one config place.

### 4. SLO box
Optional textarea: "Paste learning outcomes (SLOs) from the book". If filled, the plan must target those SLOs
(one period per SLO, or the first SLO if several — confirm with Warisha). Only SLO points, never full book text.

### 5. Unlimited access (licenses)
Before the limit check in `/api/generate`: if `licenses/{email}` exists and `expiresAt` is in the future,
skip the 10/month limit. Fields: plan ("unlimited" | "school"), schoolName, expiresAt, addedBy, createdAt.
First version: Warisha adds docs by hand in Firebase Console. Update firestore.rules: browser cannot read/write `licenses`.

## NOT in this phase
Principal view, school logo, board dropdown, pricing page, payments, Urdu, WhatsApp share, caching, SEO.

## Success check
Two teachers, given no help, create their first plan within 1 minute.

## Checklist
- [x] Task 1 loader push
- [x] Task 2 minimal UI
- [ ] Task 3 Period Plan
- [ ] Task 4 SLO box
- [ ] Task 5 licenses
- [ ] Google login screen par app ka naam "Teacher AI" + Privacy/Terms links (Google Cloud OAuth consent screen)
- [ ] UptimeRobot se site jagaye rakhna
- [ ] Purana E:\software\Teacher ai folder "Teacher ai OLD" rename
- [ ] 2 teachers se 1-minute test
- [ ] 2-3 schools pilot

## Last session
- Added 6 quick-action popups on the plan page (Printable Pop Quiz, MCQs, Real-Life Examples, Mini Research Task, Related Resources, Challenge Question). They use `/api/followup`, so they don't count toward the 10 plans/month limit.
- Pop Quiz: 3 sections (True/False, Fill in the Blanks, One-Word Answers), 5 each. MCQs: no bold. Challenge: 3 questions, model answers behind "Show answers". Answers print on the last page only when shown.
- All app text and the 8 server messages are now English. Class list has O Level and A Level.
- Period Plan WIP is saved on branch `period-plan` (not on main). Backup copy: `C:\Users\Light-Tech\Teacher-ai-backup-period-plan`.
- Next: Task 3 Period Plan — merge `period-plan` into main (expect conflicts in app.js, index.html, style.css).
