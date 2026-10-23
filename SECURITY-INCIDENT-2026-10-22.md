# Incident Railway – fuite des variables d'environnement (2026-10-22)

Railway a signalé qu'un tiers a pu lire (et en partie déchiffrer) les variables d'environnement
des services. `DATABASE_URL` + `ENCRYPTION_KEY` y étaient tous deux : tout ce qui est chiffré en
base doit être considéré comme compromis.

Le projet étant à l'arrêt, la stratégie retenue est : **tout révoquer, purger les secrets en base,
ne rien rechiffrer**.

## État constaté le 2026-10-22
- Railway (`responsible-fascination`) : services `armada`, `connector-runner`, `Postgres`. Plus aucun
  déploiement actif depuis le 27/09, mais les variables sont toujours en place et Postgres a un
  **proxy TCP public**. La base réellement utilisée par le gateway est ce Postgres Railway
  (la table `app_connections` n'existe pas dans Supabase).
  Variables du gateway : `ARAMADA_API_KEY`, `CONNECTOR_RUNNER_TOKEN`, `CONNECTOR_RUNNER_URL`, `DATABASE_URL`,
  `DIRECT_URL`, `ENCRYPTION_KEY`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `TYPESAFE_API_KEY`, `WEB_APP_URL`. Pas de clé Anthropic/OpenAI/OpenRouter/Telegram en variable Railway.
- Supabase `Storeteam` : secrets uniquement liés à leggo.dblg@gmail.com et demo@storeteam.ai
  (1 boutique `houaissstore.myshopify.com`, clés LLM openai/openrouter/ollama, intégrations
  anthropic/telegram/klaviyo/google-search-console). Aucun utilisateur tiers à prévenir.
  Logs des dernières 24 h : rien d'anormal (seulement l'app web Vercel `armadahq.app`).
- Le web (Vercel, `www.armadahq.app`) est **toujours en ligne**.
- Configuration Railway sauvegardée dans `RAILWAY-RESTORE.md`.

## Fait (vérifié le 2026-10-22)
- App Shopify désinstallée, web Vercel en pause.
- Railway : services `armada`, `Postgres` et `connector-runner` supprimés (projet vide).
- Supabase : secrets purgés (0 token boutique, 0 clé LLM, 0 intégration chiffrée).
- Clés révoquées chez les fournisseurs (confirmé par le propriétaire le 2026-10-23).
- Incident clos côté Armada. Pour redémarrer : `RAILWAY-RESTORE.md`.

## 0. Couper
- [ ] Railway : supprimer (ou mettre à l'arrêt) les services gateway et connector-runner, et
      **supprimer toutes leurs variables** — un service à l'arrêt garde ses variables.
- [ ] Web (Vercel ou autre) : mettre en pause le déploiement.

## 1. Base de données (Supabase)
- [ ] Settings → Database → **Reset database password**.
- [ ] Settings → API → régénérer le **JWT secret** (invalide anon + service_role keys).
- [ ] Logs (Database / API) depuis ~2 semaines : IP inconnues, requêtes sur `stores`,
      `llm_api_keys`, `integrations`, `app_connections`.
- [ ] Purger les secrets (depuis `gateway/`, avec la **nouvelle** `DATABASE_URL`) :
      ```
      DATABASE_URL=... npx tsx scripts/rotate-encryption-key.ts purge          # dry run, affiche les comptes
      DATABASE_URL=... npx tsx scripts/rotate-encryption-key.ts purge --apply
      ```

## 2. Clés de la plateforme — révoquer (pas seulement remplacer)
| Variable | Action |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys → delete. Vérifier l'usage. |
| `OPENAI_API_KEY` | platform.openai.com → API keys → revoke. Vérifier l'usage. |
| `OPENROUTER_API_KEY` | openrouter.ai → Keys → delete. Vérifier l'activité. |
| `GEMINI_API_KEY` | aistudio.google.com / GCP Credentials → delete. |
| `TYPESAFE_API_KEY` | révoquer chez Typesafe. |
| `SHOPIFY_API_SECRET` | Shopify Partners → app → Client credentials → rotate secret. |
| `GOOGLE_CLIENT_SECRET` | GCP → APIs & Services → Credentials → OAuth client → reset secret. |
| `GOOGLE_APPLICATION_CREDENTIALS` | GCP → IAM → Service accounts → Keys → supprimer la clé. |
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/revoke`. |
| `CONNECTOR_RUNNER_TOKEN`, `ENCRYPTION_KEY`, `NEXTAUTH_SECRET`, `LOGIN_ACCESS_KEY` | Rien à révoquer chez un tiers : générer de nouvelles valeurs (`openssl rand -hex 32`) au redémarrage. |

## 3. Secrets des utilisateurs (déchiffrables avec la clé fuitée)
- [ ] **Shopify** : pour chaque boutique de `stores`, désinstaller l'app (Admin → Apps) ou la
      supprimer depuis Partners → invalide les access tokens.
- [ ] **Clés LLM utilisateurs** (`llm_api_keys`) : prévenir chaque utilisateur de révoquer sa clé.
- [ ] **OAuth Google** : révoquer côté client OAuth (le reset du secret ci-dessus empêche le
      refresh) ; utilisateurs : myaccount.google.com/permissions.
- [ ] **Autres connecteurs MCP** (Notion, Klaviyo, …) : prévenir les utilisateurs / révoquer les tokens.

Lister qui prévenir **avant** la purge :
```sql
select s."shopifyDomain", u.email from stores s join users u on u.id = s."userId";
select k.provider, u.email from llm_api_keys k join users u on u.id = k."userId";
select i.platform, u.email from integrations i join users u on u.id = i."userId";
select c.label, d.slug, u.email from app_connections c
  join connector_definitions d on d.id = c."connectorDefinitionId" join users u on u.id = c."userId";
```

## 4. Logs à vérifier
Shopify (appels Admin API), consoles LLM (usage/coût), GCP audit logs, Supabase, Telegram.

## 5. Au redémarrage du projet
Nouvelles valeurs pour toutes les variables, même `ENCRYPTION_KEY` sur gateway, connector-runner
et web, puis reconnecter boutiques et connecteurs.
