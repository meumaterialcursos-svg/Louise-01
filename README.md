# Studio Pilates LOUISE KARLA — Sistema de Gestão

Aplicativo web (PWA) de gestão: alunos, agenda, ocupação e financeiro. Os dados ficam no navegador (localStorage); o Firebase está integrado (inicialização + Analytics) para evoluir para sincronização na nuvem.

## Publicar
Sirva a pasta por **https** (GitHub Pages, Cloudflare Pages, Netlify ou Firebase Hosting). Abrir o `index.html` direto do computador não carrega os módulos do Firebase.

## Estrutura
- `index.html` — aplicativo completo.
- `firebase-config.js`, `firebase-sync.js`, `sync-core.js` — integração Firebase (veja `FIREBASE.md`).
- `firebase.json`, `firestore.rules`, `firestore.indexes.json` — Firebase CLI / Firestore.
- `manifest.webmanifest`, `sw.js`, `icon*.png`, `icon.svg`, `apple-touch-icon.png` — PWA (instalável e offline).
- `_headers` — cabeçalhos HTTP (Cloudflare Pages / Netlify).
