# Integração Firebase — projeto `louise-01`

## Arquivos
| Arquivo | Função |
|---|---|
| `firebase-config.js` | Configuração do app web (`firebaseConfig`). |
| `firebase-sync.js` | Inicia o Firebase (App + Analytics) e atualiza o ícone de status. |
| `sync-core.js` | Lógica pura que decide o estado do ícone (conectado / offline / erro). |
| `firebase.json`, `firestore.rules`, `firestore.indexes.json` | Configuração do Firebase CLI e regras do Firestore. |

O SDK é carregado do CDN (`https://www.gstatic.com/firebasejs/13.4.0/`). Não há `npm install` nem build.

## Ícone de status (topo do sistema)
Nuvem com um ponto colorido. Toque nele para ver o detalhe.
- **Verde** — SDK carregado e app iniciado.
- **Cinza piscando** — conectando.
- **Âmbar** — sem internet.
- **Vermelho** — o Firebase não carregou (abra o console do navegador).

O ícone confirma que o Firebase **inicializou**. Ele não prova que há dados sendo gravados.

## Uso futuro
Após o carregamento, ficam disponíveis `window.firebaseApp` e `window.firebaseAnalytics`, e o evento `firebase:ready` é disparado.

## Segurança — leia antes de gravar dados
- Os valores de `firebaseConfig` são identificadores públicos, não senhas. Mesmo assim, no Google Cloud Console (APIs e serviços › Credenciais) restrinja a chave de API por **referenciador HTTP** ao seu domínio.
- `firestore.rules` bloqueia toda leitura e escrita. Isso é intencional: o login do sistema é só local (senha no navegador) e não protege dados na nuvem. Antes de sincronizar alunos/financeiro, ative o **Firebase Authentication** e escreva regras com `request.auth != null`.
- Publique as regras com: `firebase deploy --only firestore:rules`.
- Em Authentication › Configurações › Domínios autorizados, inclua o domínio onde o site está publicado.
