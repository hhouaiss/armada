# Remettre Armada en ligne sur Railway

Les services Railway ont été supprimés le 2026-10-22 après la fuite des variables d'environnement
chez Railway (voir `SECURITY-INCIDENT-2026-10-22.md`). Ce fichier décrit leur configuration
pour les recréer. **Aucune valeur ne doit être reprise de l'ancienne config : toutes ont fuité.**

Projet Railway : `responsible-fascination` (id `5c1bbe0f-31a7-4d88-80f7-59e26292b277`),
environnement `production`, région `europe-west4-drams3a`, 1 réplica par service.
(L'autre projet, `extraordinary-enthusiasm`, est vide.)

## Ce qui a été supprimé / conservé
| Élément | État |
|---|---|
| Service `armada` (gateway) | supprimé, avec ses variables et son domaine `armada-production-221a.up.railway.app` |
| Service `connector-runner` | supprimé, avec ses variables |
| Service `Postgres` | supprimé, avec ses variables et son proxy TCP public |
| Volume `postgres-volume` (id `7064957c-3271-4d65-b3cb-591c0534309a`, 500 Mo) | **conservé, détaché** : contient les données de l'app, y compris des secrets chiffrés avec l'ancienne `ENCRYPTION_KEY` |

## 1. Postgres
- Nouveau service depuis l'image `ghcr.io/railwayapp-templates/postgres-ssl:18`
  (ou template `postgres`), réseau privé `postgres`.
- Pour récupérer les données : attacher le volume `postgres-volume` sur `/var/lib/postgresql/data`.
  ⚠️ Le data dir garde **l'ancien mot de passe** (le rôle a été créé à l'init) :
  immédiatement après le démarrage, `ALTER USER postgres WITH PASSWORD '<nouveau>';`
  et mettre la même valeur dans `POSTGRES_PASSWORD` / `PGPASSWORD`.
- Purger les secrets de cette base avant tout redémarrage de l'app :
  `DATABASE_URL=... npx tsx gateway/scripts/rotate-encryption-key.ts purge --apply`
  (depuis `gateway/` : `npx tsx scripts/rotate-encryption-key.ts purge --apply`).
- Ne recréer un proxy TCP public (`DATABASE_PUBLIC_URL`) que si nécessaire.
- Variables générées par le template : `DATABASE_URL`, `DATABASE_PUBLIC_URL`, `PGDATA`, `PGDATABASE`,
  `PGHOST`, `PGPASSWORD`, `PGPORT`, `PGUSER`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `POSTGRES_USER`,
  `SSL_CERT_DAYS`, `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`.

## 2. Service `armada` (gateway)
- Source : repo `hhouaiss/armada`, branche `main`, root directory `/gateway`.
- Config : `gateway/railway.toml` (Railpack, `preDeployCommand = npx prisma migrate deploy`,
  `npm start`, healthcheck TCP 18790). Watch patterns : `/gateway/**`.
- Domaine : générer un domaine Railway (l'ancien était `armada-production-221a.up.railway.app` —
  mettre à jour `GATEWAY_WS_URL` / `GATEWAY_HTTP_URL` / `NEXT_PUBLIC_GATEWAY_WS_URL` côté web).
- Variables (toutes avec de **nouvelles** valeurs) :
  | Variable | Valeur |
  |---|---|
  | `DATABASE_URL`, `DIRECT_URL` | `${{Postgres.DATABASE_URL}}` (référence, pas de copie) |
  | `ENCRYPTION_KEY` | `openssl rand -hex 32` — identique sur armada, connector-runner et le web |
  | `CONNECTOR_RUNNER_TOKEN` | `openssl rand -hex 32` — identique sur armada et connector-runner |
  | `CONNECTOR_RUNNER_URL` | `http://connector-runner.railway.internal:${{connector-runner.PORT}}` |
  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | nouveau secret du client OAuth Google |
  | `GEMINI_API_KEY` | nouvelle clé |
  | `TYPESAFE_API_KEY` | nouvelle clé |
  | `ARAMADA_API_KEY` | nouvelle clé (nom tel quel dans l'ancienne config ; non lue par le code actuel) |
  | `WEB_APP_URL` | URL publique du web (`https://www.armadahq.app`) |
  | `NODE_ENV` | `production` |
  | `PORT` | `18790` |
  Selon les besoins : `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`,
  `MCP_CONNECTOR_PLATFORM_V2=true` (voir `gateway/.env.example`).

## 3. Service `connector-runner`
- Source : repo `hhouaiss/armada`, branche `main`, root directory `/gateway`,
  config file `/gateway/railway.connector-runner.toml`
  (Railpack, `npm run start:connector-runner`, healthcheck `/health`).
- Variables : `DATABASE_URL`, `DIRECT_URL` (référence Postgres), `ENCRYPTION_KEY`, `CONNECTOR_RUNNER_TOKEN`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `WEB_APP_URL`, `NODE_ENV=production`,
  `RAILPACK_DEPLOY_APT_PACKAGES="uv python3"`. **Ne pas** définir `CONNECTOR_RUNNER_PORT`.
  `PORT` : laisser Railway l'injecter (l'ancienne config le définissait explicitement).

## 4. Web (Vercel)
Mettre à jour `ENCRYPTION_KEY`, `CONNECTOR_RUNNER_TOKEN`, `GOOGLE_CLIENT_SECRET`, `SHOPIFY_API_SECRET`,
`NEXTAUTH_SECRET`, `LOGIN_ACCESS_KEY`, les URLs du gateway et `DATABASE_URL`/`DIRECT_URL`, puis redéployer.

## 5. Après le redémarrage
Reconnecter la boutique Shopify, ressaisir les clés LLM et reconnecter les intégrations
(Anthropic, Telegram, Klaviyo, Google Search Console) : elles ont été purgées.
