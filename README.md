# Studio de Pilates LOUISE KARLA — Sistema de Gestão (V4 + Firebase)

PWA de gestão do studio (alunos, agenda, financeiro, reposições, relatórios), agora com
**login por e-mail/senha (Firebase Authentication)** e **sincronização na nuvem (Cloud Firestore)**
entre celular, tablet e computador. Funciona offline depois do primeiro acesso.

Projeto Firebase: `louise-01`

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | Estrutura das telas |
| `style.css` | Visual |
| `app.js` | Toda a lógica do sistema + login Firebase + sincronização |
| `firebase-config.js` | Chaves do app Web do projeto `louise-01` (já preenchido) |
| `firebase-config.example.js` | Modelo para usar outro projeto |
| `firestore.rules` | Regras de segurança (cada usuário só acessa os próprios dados) |
| `firestore.indexes.json` | Índices do Firestore (nenhum necessário) |
| `firebase.json` / `.firebaserc` | Configuração do Firebase CLI (Hosting + Firestore) |
| `manifest.webmanifest` / `icons/` | Instalação como app (PWA) — Android, iOS e computador |
| `sw.js` | Service worker (abre offline) |
| `launch-config.json` | Servidor local para testar |
| `ARQUITETURA-V4.md` | Como a sincronização funciona por dentro |

## Ativar o Firebase (uma vez só) — Console: https://console.firebase.google.com/project/louise-01

1. **Authentication → Método de login → E-mail/senha → Ativar.**
2. **Authentication → Usuários → Adicionar usuário**: crie o e-mail e a senha da proprietária.
   (Opcional: em *Configurações → Ações do usuário*, desative "Permitir criação de contas", assim ninguém mais se cadastra.)
3. **Firestore Database → Criar banco de dados** (modo produção; região `southamerica-east1` é a mais próxima).
4. **Firestore Database → Regras**: cole o conteúdo de `firestore.rules` e clique em **Publicar**.
   Sem este passo, a nuvem responde "permissão negada".

Pelo terminal (alternativa aos passos 3-4): `npm i -g firebase-tools && firebase login && firebase deploy --only firestore`

## Publicar o site

**GitHub Pages** (repositório atual): envie todos os arquivos para a raiz do repositório →
*Settings → Pages → Deploy from a branch → main / (root)*.

**Firebase Hosting** (opcional): `firebase deploy --only hosting` → `https://louise-01.web.app`

## Primeiro acesso

1. Abra o site e entre com o e-mail e a senha criados no passo 2.
2. **Aparelho com dados antigos** (versão em arquivo HTML único): na primeira entrada, se a nuvem estiver vazia,
   os dados do aparelho são enviados automaticamente. Se a nuvem já tiver dados, o sistema pergunta qual manter
   (e guarda uma cópia de segurança do que for substituído).
3. Nos outros aparelhos, basta entrar com a mesma conta: os dados são baixados e depois acompanham em tempo real.

O ícone de nuvem no topo mostra o estado (verde = sincronizado, laranja = sem internet, vermelho = erro).
Em **Configurações → Nuvem** há "Sincronizar agora", "Baixar da nuvem" e "Enviar este aparelho".

## Instalar no celular (iPhone/iPad e Android)

O site precisa estar publicado em **HTTPS** (GitHub Pages e Firebase Hosting já são). Abra o endereço no navegador:

- **iPhone / iPad (Safari):** toque em **Compartilhar** → **Adicionar à Tela de Início** → **Adicionar**.
  (No iOS 16.4+ o Chrome/Edge também têm essa opção no menu Compartilhar.)
- **Android (Chrome):** toque em **Instalar no celular** na tela de login (ou em Configurações → Instalar aplicativo).
  Se o botão não aparecer, use o menu **⋮ → Instalar aplicativo / Adicionar à tela inicial**.
- **Computador (Chrome/Edge):** ícone de instalar na barra de endereço.

Depois de instalado, abre em tela cheia com o ícone "Studio LK" e funciona offline.
No iPhone o app instalado tem armazenamento separado do Safari: entre de novo com e-mail e senha e os dados
descem da nuvem automaticamente.
Para trocar o ícone, substitua os arquivos de `icons/` (192, 512, maskable-512 e apple-touch-icon de 180×180, sem transparência)
e aumente `VERSION` em `sw.js`.

## Boas práticas de segurança

- A `apiKey` do Firebase Web **não é segredo**; a proteção real são o login e o `firestore.rules`.
- Opcional: no Google Cloud Console → *APIs e serviços → Credenciais*, restrinja a chave por referenciador HTTP
  (`https://meumaterialcursos-svg.github.io/*`, `https://louise-01.web.app/*`, `https://louise-01.firebaseapp.com/*`, `http://localhost:*`),
  mantendo habilitadas as APIs *Identity Toolkit*, *Token Service* e *Cloud Firestore*.
- Use uma senha forte. Para trocar: Configurações → Alterar senha, ou "Esqueci minha senha" na tela de login (e-mail do Firebase).
- Faça backup de vez em quando (Configurações → Exportar backup).

## Limitações conhecidas

- **Anexos de documentos** (PDF/imagens em "Documentos do aluno") e GIFs enviados por você ficam só no aparelho
  (IndexedDB) e **não** vão para a nuvem. Fotos dos alunos e todo o restante sincronizam.
- Dois aparelhos editando ao mesmo tempo: vale a última gravação (a alteração mais recente prevalece).
- Sem a config do Firebase (ou com `firebase-config.js` do modelo), o sistema roda no modo local antigo, sem nuvem.

## Testar localmente

```bash
npx http-server . -p 5173 -c-1     # ou use launch-config.json
# abrir http://localhost:5173
```
