# Integração Firebase — projeto `louise-01`

## Arquivos
| Arquivo | Função |
|---|---|
| `firebase-config.js` | Configuração do app web (`firebaseConfig`). |
| `firebase-sync.js` | Firebase App + Analytics, verificação da conexão, login (Authentication) e sincronização com o Firestore. |
| `sync-core.js` | Motor de sincronização (diff por registro, conflitos) e textos do indicador — sem dependência do Firebase. |
| `firestore.rules` | Regras de segurança: cada conta só acessa `users/{uid}/items/*`. |
| `firebase.json`, `firestore.indexes.json` | Configuração do Firebase CLI. |

O SDK é carregado do CDN (`https://www.gstatic.com/firebasejs/13.4.0/`). Não há `npm install` nem build.

## Configuração (uma vez só)
No [console do Firebase](https://console.firebase.google.com/) › projeto **louise-01**:

1. **Firestore Database › Criar banco de dados** — modo de produção; escolha uma região (ex.: `southamerica-east1`, São Paulo).
2. **Firestore › Regras** — cole o conteúdo de `firestore.rules` e clique em **Publicar**
   (ou, com o CLI: `firebase deploy --only firestore:rules`).
3. **Authentication › Começar › Método de login** — ative **E-mail/senha**.
4. **Authentication › Configurações › Domínios autorizados** — inclua o domínio onde o site está publicado
   (ex.: `seuusuario.github.io`).
5. Abra o sistema › ícone da nuvem (ou Configurações › *Sincronização na nuvem*) › **Criar conta**
   com seu e-mail e uma senha. Nos outros aparelhos, use **Entrar** com a mesma conta.
6. **Recomendado:** depois de criar a sua conta, em Authentication › Configurações › *Ações do usuário*,
   desmarque **Ativar criação (cadastro)**. Assim ninguém mais consegue abrir contas neste projeto.
7. **Recomendado:** no Google Cloud Console › APIs e serviços › Credenciais, restrinja a chave de API por
   **referenciador HTTP** ao seu domínio.

## Como a sincronização funciona
- **Automática:** toda alteração salva no sistema é enviada ~1 segundo depois. Alterações feitas em outro aparelho
  chegam em segundos, sem recarregar a página.
- **Um documento por registro:** só o que mudou é enviado (economiza a cota gratuita).
- **Funciona offline:** sem internet o sistema continua normal; ao reconectar, o que ficou pendente é enviado.
- **Primeira vez em um aparelho:** os dados da nuvem prevalecem em caso de conflito (uma cópia do banco local fica em
  `localStorage › sp_pre_sync_backup`). Registros que só existem neste aparelho são enviados. Um aparelho novo
  (sem alunos/aulas/lançamentos) apenas recebe a nuvem.
- **Depois disso:** se o mesmo registro foi alterado em dois aparelhos ao mesmo tempo, vale o que foi alterado
  por último a ser enviado.
- **Exclusões** também sincronizam. Por segurança, se a nuvem aparecer vazia/trocada, nada é apagado localmente:
  os dados do aparelho são reenviados.
- **Não sincroniza:** senha de acesso ao sistema, aparência (tema, modo escuro), documentos anexados (IndexedDB) e
  itens maiores que ~700 KB (o painel avisa).

## Ícone de status (topo do sistema e tela de login)
- **Verde** — Firebase verificado e dados sincronizados.
- **Azul piscando** — sincronizando.
- **Cinza** — Firebase conectado, nuvem desligada (faça login) · **cinza piscando** — conectando.
- **Âmbar** — sem internet ou alterações aguardando envio.
- **Vermelho** — erro (a mensagem diz o motivo, ex.: regras não publicadas, chave bloqueada).

## Cotas (plano gratuito Spark)
20 mil gravações e 50 mil leituras por dia. O cache local do Firestore faz o app ler só o que mudou desde a última
abertura, e só registros alterados são gravados.
