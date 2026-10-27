# Teacher AI — Claude ke liye qaide

## Project
- Express server (`server.js`) + static frontend (`public/`), Render par live: https://ai-teaching-tool.onrender.com
- Login: Firebase Google Auth (client, `public/firebaseConfig.js`), token server par `firebase-admin` se verify hota hai
- AI: Groq API (`/api/generate`, `/api/followup`), model fallback list `server.js` mein
- Usage limit: 10 plans/month, Firestore `usageCounters` collection mein (server-side)
- Frontend logic: `public/app.js` (ES module), page: `public/index.html`, styles: `public/style.css`
- Local chalana: `npm start` → http://localhost:3000

## Qaide (hamesha)
1. **Test pehle:** har change pehle localhost:3000 par chala kar test karo, phir user ko batao kya test hua aur kya nahi.
2. **Commit/push sirf ijazat se:** user ki saaf ijazat ke baghair `git commit` ya `git push` nahi. `--force` (push ya kisi bhi command mein) kabhi nahi.
3. **Secrets:** `.env` aur Firebase service account key (JSON) kabhi parhni, dikhani, chat mein likhni ya GitHub par bhejni nahi. Inhe `git add` bhi nahi karna.
4. **Cache version:** har badlav ke baad `public/index.html` mein `app.js?v=` ka number 1 barhao (taake browser naya code le).

## Token bachat ke qaide
1. Browser screenshots sirf tab lo jab Warisha kahein, ya UI design check karna zaroori ho.
2. Test ke liye pehle server logs, console errors, network requests, page text aur `curl` use karo.
3. Ek task mein zyada se zyada 1-2 screenshots.
4. Badi files poori mat padho, sirf zaroori hissa padho.
5. Kaam khatam ho to chhota summary do: kya badla, kya test kiya, Warisha ko kya check karna hai.

## Guide ka tareeqa (Warisha non-technical hain)
- Har jawab simple Roman Urdu mein, chhota, aur ek waqt mein sirf ek kaam.
- `PRODUCT.md` ki "Checklist" kaam ka order hai. Kaam khatam ho to us ka box tick karo aur khud batao: "Agla kaam: …".
- Jab Warisha sirf "next" likhein: checklist dekh kar agla khula kaam shuru karo.
- Jo kaam Warisha ne khud karna hai (Google Cloud, UptimeRobot, Render, Firebase Console): click-by-click steps do. Keys ya password kabhi mat maango.
- Har push ke baad 3-4 minute ruk kar live site check karo: https://ai-teaching-tool.onrender.com khulta hai, aur bina login `POST /api/generate` 401 deta hai. Phir batao.
- Warisha ko jawab max 5 short bullets mein do. Simple words. Sirf: kya kiya, kya test karna hai, koi sawal. Lambi tafseel sirf maangne par.
