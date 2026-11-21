# Arquitetura V4 — Firebase

## Visão geral

```
Navegador (PWA)
 ├─ index.html + style.css + app.js         interface e regras de negócio
 ├─ localStorage                              cópia local dos dados (fonte para uso offline)
 ├─ Firebase Authentication (e-mail/senha)    identidade → uid
 └─ Cloud Firestore                           cópia na nuvem + tempo real entre aparelhos
```

O sistema continua "local primeiro": toda leitura usa o `db` em memória e toda gravação chama `save()`
(localStorage). O módulo "FIREBASE" do `app.js` apenas espelha esse `db` para o Firestore e traz de volta
as mudanças feitas em outros aparelhos.

## Modelo de dados no Firestore

```
users/{uid}/sync/meta                        ponteiro da versão atual
users/{uid}/chunks/db-{rev}-{n}              JSON do banco, dividido em pedaços
users/{uid}/chunks/photos-{rev}-{n}          JSON de { photos, exphotos } dividido em pedaços
```

`meta`: `{ v, rev, device, ts, db:{rev,n,len}, photos:{rev,n,len}, stats:{students,classes,finance} }`

Por que pedaços? O Firestore limita cada documento a 1 MiB. O banco inteiro (e as fotos em base64) pode passar disso,
então é serializado e cortado em blocos de ~200 mil caracteres (sem partir emojis ao meio).

## Gravação (push)

1. `save()` / `savePhotos()` / `exphSave()` marcam `db` e/ou `photos` como *sujos* (`sp_cloud_dirty`, persistente).
2. Após 2 s sem novas alterações (ou ao esconder/fechar a aba) o push roda:
   - grava os pedaços novos (`writeBatch`, 10 por lote) com uma `rev` nova;
   - **só depois** troca o ponteiro em `sync/meta` numa transação (mescla com o `meta` atual do servidor,
     então um aparelho que só mudou fotos não desfaz o `db` de outro);
   - apaga os pedaços da revisão anterior; uma vez por dia varre pedaços órfãos.
3. Se houve novas alterações durante o envio, o flag continua sujo e um novo envio é agendado.
4. Sem internet: o flag permanece; ao voltar (`online`) o envio é refeito. Falha: nova tentativa em 30 s.

Como o ponteiro só muda depois dos pedaços, quem lê nunca vê uma versão pela metade.

## Leitura / tempo real (pull)

`onSnapshot(sync/meta)`. Só eventos confirmados pelo servidor (`fromCache=false`) decidem algo.
Comparando `meta.rev` com a última revisão aplicada neste aparelho (`sp_cloud_rev`):

| Situação | Ação |
|---|---|
| Nuvem vazia | envia este aparelho |
| `rev` igual e nada pendente | nada |
| `rev` diferente, nada pendente aqui | baixa e aplica (re-renderiza a tela) |
| `rev` diferente **e** há alterações pendentes aqui | pergunta: manter este aparelho ou usar a nuvem |
| Primeiro vínculo, dados dos dois lados | pergunta qual manter (nuvem "vazia" não pergunta) |

Antes de substituir os dados locais, o estado atual é guardado em `sp_pre_cloud_pull`.
Ao aplicar, o "cofre de alunos" local é recriado a partir do banco novo para que alunos excluídos em outro
aparelho não ressuscitem.

## Autenticação

- Tela de login com e-mail + senha (`signInWithEmailAndPassword`); "Manter conectado" escolhe persistência
  local (30 dias+) ou de sessão.
- A sessão é restaurada offline pelo SDK, então o app abre sem internet.
- "Esqueci minha senha" → `sendPasswordResetEmail`. Alterar senha → reautenticação + `updatePassword`.
- Se a config do Firebase estiver ausente/de exemplo, o login antigo por senha local continua valendo (modo local).
- Com Firebase ativo, o login local antigo é desligado (não há "senha padrão" como brecha).

## Segurança

`firestore.rules`: somente `request.auth.uid == {uid}` lê/grava em `users/{uid}/...`; chunks só aceitam
os campos `p, rev, i, d` e `d` string; qualquer outro caminho é negado.

## PWA / offline

`sw.js`: arquivos do site em *rede primeiro* (pega atualização, cai no cache offline); SDK do Firebase
(`gstatic.com/firebasejs/10.14.1`) em cache com atualização em segundo plano; tráfego do Firestore/Auth não é interceptado.
O Firestore usa cache persistente (IndexedDB) quando o navegador permite.
Para forçar atualização do cache após mudar arquivos, altere `VERSION` em `sw.js`.

## Fora do escopo (ainda local)

Anexos de documentos e GIFs de exercícios enviados (IndexedDB `sp_docs`). Para sincronizá-los seria necessário
Firebase Storage (o bucket `louise-01.firebasestorage.app` já existe) + regras de Storage.

## Como foi verificado

Teste automatizado em navegador headless contra um Firebase **simulado** (Auth + Firestore em memória), com dois
"aparelhos": login (certo/errado), 1º envio, download em aparelho novo, tempo real A↔B, payload de 600 mil emojis em
vários pedaços sem corrupção, fotos, offline → reconexão, exclusão sem ressuscitar, conflito/1º vínculo (ambas as
escolhas), troca e redefinição de senha, logout, modo local, falha do SDK e abertura offline via service worker.
**Não foi testado contra o projeto real** `louise-01`: faça os passos do README (Authentication, Firestore, regras).
