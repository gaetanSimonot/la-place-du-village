# Claude Code — Project Configuration

## Rules

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary — prefer editing existing files
- NEVER create documentation files unless explicitly requested
- NEVER save working files or tests to root — use `/src`, `/tests`, `/docs`, `/config`, `/scripts`
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- Keep files under 500 lines
- Validate input at system boundaries
- INTERDIT : hardcoder des données mock dans les composants. Toute donnée affichée doit venir de l'API ou de la DB. Aucune exception.

## Agent Comms (SendMessage-First Coordination)

Named agents coordinate via `SendMessage`, not polling or shared state.

```
Lead (you) ←→ architect ←→ developer ←→ tester ←→ reviewer
              (named agents message each other directly)
```

### Spawning a Coordinated Team

```javascript
// ALL agents in ONE message, each knows WHO to message next
Agent({ prompt: "Research the codebase. SendMessage findings to 'architect'.",
  subagent_type: "researcher", name: "researcher", run_in_background: true })
Agent({ prompt: "Wait for 'researcher'. Design solution. SendMessage to 'coder'.",
  subagent_type: "system-architect", name: "architect", run_in_background: true })
Agent({ prompt: "Wait for 'architect'. Implement it. SendMessage to 'tester'.",
  subagent_type: "coder", name: "coder", run_in_background: true })
Agent({ prompt: "Wait for 'coder'. Write tests. SendMessage results to 'reviewer'.",
  subagent_type: "tester", name: "tester", run_in_background: true })
Agent({ prompt: "Wait for 'tester'. Review code quality and security.",
  subagent_type: "reviewer", name: "reviewer", run_in_background: true })

// Kick off the pipeline
SendMessage({ to: "researcher", summary: "Start", message: "[task context]" })
```

### Patterns

| Pattern | Flow | Use When |
|---------|------|----------|
| **Pipeline** | A → B → C → D | Sequential dependencies (feature dev) |
| **Fan-out** | Lead → A, B, C → Lead | Independent parallel work (research) |
| **Supervisor** | Lead ↔ workers | Ongoing coordination (complex refactor) |

### Rules

- ALWAYS name agents — `name: "role"` makes them addressable
- ALWAYS include comms instructions in prompts — who to message, what to send
- Spawn ALL agents in ONE message with `run_in_background: true`
- After spawning: STOP, tell user what's running, wait for results
- NEVER poll status — agents message back or complete automatically

## Agent Routing

| Task | Agents |
|------|--------|
| Bug Fix | researcher, coder, tester |
| Feature | architect, coder, tester, reviewer |
| Refactor | architect, coder, reviewer |
| Performance | perf-engineer, coder |
| Security | security-architect, auditor |

### When to Swarm
- **YES**: 3+ files, new features, cross-module refactoring, API changes, security, performance
- **NO**: single file edits, 1-2 line fixes, docs updates, config changes, questions

## Agents

**Core**: `coder`, `reviewer`, `tester`, `planner`, `researcher`
**Architecture**: `system-architect`, `backend-dev`, `mobile-dev`
**Security**: `security-architect`, `security-auditor`
**Performance**: `performance-engineer`, `perf-analyzer`
**Coordination**: `hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator`
**GitHub**: `pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`

Any string works as a custom agent type.

## Build & Test

- ALWAYS run tests after code changes
- ALWAYS verify build succeeds before committing

```bash
npm run build && npm test
```

---

## 🔧 Backlog technique — Chantier d'assainissement auth

**Priorité : MOYENNE — pas urgent**

### Contexte

Le 20 mai 2026, on a refactoré le flow auth pour résoudre le bug "marche au 2ème coup" sur Google OAuth. Le fix actuel fonctionne en prod mais laisse **2 problèmes connus** à résoudre.

### Problème 1 — Erreur PKCE en console

Au login Google, la console affiche :

```
AuthPKCECodeVerifierMissingError: PKCE code verifier not found in storage
```

La session est quand même établie via le fallback de supabase-js, donc **l'utilisateur EST loggé**, mais l'erreur s'affiche dans la console (visible si DevTools ouvert).

**Cause racine** : le code verifier PKCE est stocké en `localStorage` qui peut être perdu entre le moment du `signInWithOAuth` et le retour sur `/auth/callback` (changement de contexte browser, cache PWA, navigation privée, iOS Safari, etc.).

### Problème 2 — Erreurs hydration React #418 / #423

Présentes en console à chaque chargement de page.

**Cause probable** : mismatch entre l'état SSR (server rend "logged out" car aucun cookie auth) et l'état client (qui récupère la session depuis localStorage après hydration). React panique et recrée le root from scratch, causant des flashs UI au login et des comportements bizarres.

### Solution recommandée

**Migration vers `@supabase/ssr`** (déjà installé en `^0.10.0` mais sous-utilisé). Ce package officiel Supabase remplace le stockage localStorage par des cookies httpOnly lus en SSR.

**Bénéfices** :
- Plus d'erreur PKCE (cookies survivent à tous les contextes browser, contrairement à localStorage)
- Hydration auth-aware côté serveur → résout naturellement #418/#423 (le serveur sait que l'user est loggé et rend la bonne UI dès le départ)
- Plus sécurisé (httpOnly = inaccessible au JS, donc immunisé contre XSS)
- Pattern officiel recommandé par Supabase pour Next.js App Router en 2025-2026

### Étendue du chantier (estimation 4-8h)

**Fichiers à toucher** :

- `src/lib/supabase.ts` → adapter pour utiliser `createBrowserClient` de `@supabase/ssr`
- `src/lib/supabase-admin.ts` → adapter pour le pattern server avec service_role
- **À créer** : `src/lib/supabase-server.ts` → pour les Server Components avec `createServerClient`
- **À créer** : `middleware.ts` à la racine du projet → rafraîchit les cookies auth à chaque requête (**CRITIQUE** — sans ce middleware, le SSR ne voit jamais la session)
- `src/app/auth/callback/page.tsx` → probablement convertir en `route.ts` (server-side) pour gérer les cookies proprement
- Vérifier toutes les API routes (`src/app/api/**/route.ts`) qui utilisent Supabase → s'assurer qu'elles utilisent le bon client SSR
- `AuthContext` → simplifier (le middleware gère la majorité maintenant)

### Précautions ABSOLUES quand tu attaqueras ce chantier

1. **Travailler en branche feature** (`git checkout -b ssr-migration`), JAMAIS direct sur `main`
2. **Avant tout code, faire un audit complet** des points de consommation Supabase dans le projet (comme on a fait pour le back button trap et le history audit)
3. **Lire la doc officielle** : https://supabase.com/docs/guides/auth/server-side/nextjs (instruction stricte : ne pas inventer le pattern, suivre la doc à la lettre)
4. **Test en preview Vercel** AVANT toute promote en production
5. **Test multi-contexte obligatoire** : Chrome desktop, Chrome Android PWA, Firefox desktop, iOS Safari PWA si possible, mode navigation privée
6. **Garder le rollback Vercel à disposition** (30 sec en cas de catastrophe)
7. Ne PAS lancer ce chantier sous pression de déploiement — c'est un chantier qui mérite une demi-journée calme, pas une fin d'après-midi paniquée

### Bonus une fois la migration faite

Une fois `@supabase/ssr` en place, faire un audit ciblé des hydration errors résiduelles s'il en reste. Probablement quelques composants qui lisent `window`/`localStorage` pendant le render — fix typique : ajouter un state `mounted` qui flip à `true` dans `useEffect`.

### Ce qu'on a déjà fait le 20 mai 2026 (ne PAS redéfaire)

- URL-based `?next=` returnTo (au lieu de sessionStorage)
- Triple sanitize `sanitizeNext` pour open-redirect protection
- `flowType: 'pkce'` ajouté explicitement dans le browser client (`src/lib/supabase.ts`)
- PWA cache config assainie (`cacheStartUrl: false`, NetworkFirst pour HTML, etc.)
- Site URL Supabase Dashboard corrigée vers le domaine prod
- `console.log` de diagnostic dans callback retirés
- Logging réduit, comportement silencieux mais robuste
