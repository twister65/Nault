# Nault — Audit des dépendances dépréciées et préparation Angular 22

**Document de référence initial :** 21 octobre 2026 — **mise à jour de suivi : 23 octobre 2026**
**Dépôt :** [twister65/Nault](https://github.com/twister65/Nault)  
**Branche de travail actuelle :** [`upgrade/angular-22`](https://github.com/twister65/Nault/tree/upgrade/angular-22)  
**Base de cette reprise :** [`eb9c778`](https://github.com/twister65/Nault/commit/eb9c778cf881f88b04a8af035a9c5e3696c0b2e1). Les corrections sont maintenant **publiées** dans [`ac374aa`](https://github.com/twister65/Nault/commit/ac374aa6821ab14b7d56be5ca1154b847b3678d3), après autorisation explicite de l’utilisateur le 23 octobre. Les résultats locaux ci-dessous restent distincts des résultats CI.
**Statut actuel :** Angular 21 validé et fusionné ; Angular 22 en cours, compilations Web/Vercel **non validées**. Ne pas déclarer cette migration terminée.

> **Lecture obligatoire avant reprise par ChatGPT Work ou un autre intervenant :** commencer par le présent état opérationnel, puis lire les décisions techniques et l'historique archivés ci-dessous. Leurs descriptions au présent étaient exactes à leur date mais ne remplacent pas cet état actualisé. Vérifier systématiquement la tête Git, les versions installées et les derniers runs avant toute modification.

### Suite des corrections du 23 octobre — événements et QR

Trois commits supplémentaires sur `upgrade/angular-22` après le point `c3284eb` :

- [`6d6fd01`](https://github.com/twister65/Nault/commit/6d6fd01fb666a755a43352f57fb8657f9bc86635) : alignement du type littéral des commandes WebSocket et description TypeScript explicite des points d'entrée Emscripten/WebGL du service PoW. Aucun nouvel algorithme de calcul n'a été ajouté.
- [`203ba5e`](https://github.com/twister65/Nault/commit/203ba5ecade8b1a5b534090e8ddf4d3a9f324481) : typage des événements navigateur/deeplinks, des deux `ViewChild`, du dictionnaire de paramètres d'URL et de la sélection nullable de compte dans `AppComponent`.
- [`1df6f81`](https://github.com/twister65/Nault/commit/1df6f81be35053e01ea188fb3af5159b55984167) : correction importante du contrat du scanner QR. La promesse du service retourne `{reference: string, content: string}`, conforme à `QrModalComponent.activeModal.close`, et **non** `string`. Initialisation explicite de ses champs de formulaire et d'appareil photo.

**Mesure obtenue** : [CI Angular 22, run 39885403454](https://github.com/twister65/Nault/actions/runs/39885403454) sur **`c3284eb`** : 878 erreurs TypeScript contre **1 060** sur la référence `7920bff`, soit **182 diagnostics éliminés**. Le build Web échoue encore, et le build Electron ainsi que les tests ultérieurs du workflow ne sont donc pas atteints. Ce résultat n'inclut **pas** les corrections `6d6fd01`, `203ba5e`, `1df6f81`.

**CI de la tête `1df6f81`** : [validation 39885967252](https://github.com/twister65/Nault/actions/runs/39885967252) et [lint 39885967270](https://github.com/twister65/Nault/actions/runs/39885967270), **en attente/en cours lors de ce point de reprise**. Consulter leurs conclusions avant de calculer la prochaine différence. Ne pas relancer des commits par anticipation tant que la CI valide une tête donnée ; une nouvelle mise à jour peut annuler les jobs précédents via la règle de concurrence.

**Priorité pour la suite :** le typage des modèles complexes restants : `musig.service.ts` (module WASM de multisignature : précautions cryptographiques et validation spécifique), `wallet.service.ts`, `util.service.ts`, puis `account-details`, `sign`, `sweeper` et les autres composants. Ne pas maquiller les diagnostics par des assertions arbitraires ; traiter les types d'API et de collections à leur source. Garder **tous les contrôles stricts**, le problème BLE ouvert et les tests matériels reportés à la fin d'Angular 22.


## Reprise ciblée — 23 octobre 2026, typage des services partagés

**Point d'arrêt pour reprise dans Chat ou Work :** tête de code [`c3284eb`](https://github.com/twister65/Nault/commit/c3284eb04c11840f40dd1e5fb5b33d506383d513), branche **`upgrade/angular-22`**. Quatre commits de corrections de types ont été publiés depuis le lot `ac374aa`, sans modifier `master`, Apache, Vercel, les transports Ledger/BLE ni les règles de signature. Aucune correction de niveau `strict: false`, `skipLibCheck` ou `@ts-nocheck` n'a été introduite.

- [`922c3e5`](https://github.com/twister65/Nault/commit/922c3e547fd71343e1fbe9edc886322943a87e00) : interfaces typées pour confirmations Nano via WebSocket, commandes d'abonnement, compteurs et timers, flux RxJS du wallet, cache de work, notifications et composant d'affichage. L'annotation du message WebSocket ne remplace **pas** une validation structurelle des données JSON reçues ; la validation RPC reste inchangée.
- [`7ef12ef`](https://github.com/twister65/Nault/commit/7ef12efaf7fb1feb9e78f506d90e578b5b2c1183) : état `NodeService.node.status: boolean | null`, message de mise hors ligne nullable et paramètres RPC typés ; gestion explicite des erreurs `unknown` pour classifier les erreurs réseau.
- [`4777ad1`](https://github.com/twister65/Nault/commit/4777ad1f8a00c16ef8f84b2ad8f3433970a020b6) : types de file PoW, états et résultats différés des workers ; suppression des tableaux `never[]` dans ce service. En cas d'exception non conforme, la file remonte un échec PoW plutôt qu'une valeur indéterminée.
- [`c3284eb`](https://github.com/twister65/Nault/commit/c3284eb04c11840f40dd1e5fb5b33d506383d513) : modèles du carnet d'adresses, noms non null dans le réordonnancement, résultat asynchrone du lecteur QR et chaînes des deeplinks.

**Contrôles à la rédaction :** le lint et CodeQL sont **success** sur le commit `4777ad1` ([lint 39885213960](https://github.com/twister65/Nault/actions/runs/39885213960), [CodeQL 39885213943](https://github.com/twister65/Nault/actions/runs/39885213943)). Le run `Validate Angular 22 migration` pour le commit final `c3284eb`, [39885403454](https://github.com/twister65/Nault/actions/runs/39885403454), était encore **en cours** : **NE PAS** attribuer une validation Web/PWA/Electron à ces corrections avant lecture du résultat. Les runs plus anciens ont pu être annulés par la concurrence CI lors de nouveaux commits.

**Prochaine action impérative :** lire le log du run 39885403454 sur le bon SHA, recompter les diagnostics TypeScript restants, et commencer par la cause commune suivante plutôt que multiplier les assertions de type. Valider les changements des API RPC, les formats des messages WebSocket, les données de notification et les calculs PoW avec les tests ciblés existants. Vérifier ensuite `npm ci`, `wallet:build`, `desktop:build`, lint, tests Angular/RPC, tests simulés Ledger et CodeQL sur **un même commit**. Les quelques anciens tests d'intégration peuvent dépendre de données non entièrement formées : adapter les fixtures sans affaiblir les interfaces métier.

**Contraintes inchangées :** Angular 22 n'est toujours **pas terminée**, ne pas fusionner `master` ni publier une release. Garder le domaine de staging CORS autorisé `https://nault-wallet-staging-olaverre-1312.vercel.app`. Aucun test matériel Bluetooth avant la campagne Angular 22 ; le problème de deuxième reconnexion Nano X reste ouvert, et `Clear session` est le contournement confirmé. Ne pas régénérer arbitrairement le verrou npm ni pousser d'`npm audit fix --force`.

---

## Reprise de migration — 23 octobre 2026, second lot Angular 22

**Statut : lot de compatibilité publié et testé partiellement ; migration toujours NON TERMINÉE.** Ce chapitre remplace les diagnostics opérationnels antérieurs lorsqu'une correction est explicitement indiquée. Aucun passage à `strict: false`, `skipLibCheck`, `@ts-nocheck` ou suppression de tests n'a été ajouté.

### Point de reprise après réinitialisation du quota

- **Commit de code publié : [`ac374aa6821ab14b7d56be5ca1154b847b3678d3`](https://github.com/twister65/Nault/commit/ac374aa6821ab14b7d56be5ca1154b847b3678d3)**, parent documentaire `a2c7a7460995a96c43970ad20b851e685f918783`. Les 13 fichiers de corrections, y compris le verrou npm, sont sur GitHub.
- Le refus de publication antérieur est **résolu** par l'autorisation explicite de l'utilisateur : publier les corrections sur `upgrade/angular-22`, **sans fusion dans `master`**. Ne pas redemander cette autorisation pour ce lot.
- Repartir de la tête distante de `upgrade/angular-22`. Si l'environnement local existe encore (`/workspace/scratch/374eca8cb5ed/Nault`), vérifier `git status` avant synchronisation : l'ancien commit local `49db239e6d1b32fce236c87e71aa539297d7660a` contient les mêmes corrections et ne doit pas être réappliqué une seconde fois.
- CI déclenchée sur le commit publié : [validation Angular 22 — 39883092182](https://github.com/twister65/Nault/actions/runs/39883092182), [lint — 39883092151](https://github.com/twister65/Nault/actions/runs/39883092151), [CodeQL — 39883092197](https://github.com/twister65/Nault/actions/runs/39883092197), [verrou npm — 39883092154](https://github.com/twister65/Nault/actions/runs/39883092154), [Docker — 39883092188](https://github.com/twister65/Nault/actions/runs/39883092188). **En cours ou en attente lors de cette mise à jour**, aucun succès global revendiqué. Une mise à jour documentaire peut relancer/remplacer ces runs : vérifier le SHA et les derniers résultats avant reprise.
- La prochaine tâche technique est le typage strict des modèles/services partagés : voir les 1 060 diagnostics locaux et leur répartition ci-dessous. Conserver les contrôles stricts et corriger les modèles avant les composants.
- Les campagnes matérielles restent suspendues, le problème de seconde reconnexion Nano X reste ouvert, l'origine de staging à conserver est `https://nault-wallet-staging-olaverre-1312.vercel.app`. Aucun déploiement effectué ; l'accès Vercel restait refusé au dernier essai.
- `master` vérifié avant publication : `0a94c865659a2add43e7832278f93df247f2130b`. Aucune fusion ni écriture sur cette branche.

### Corrections du présent lot (publiées dans ac374aa)

- **ESLint 10.13.0**, `angular-eslint@22.6.0` et son peer `typescript-eslint@8.72.0`, manifeste et lockfile v2 synchronisés. Les plugins Angular 22 ne fournissent plus `configs.recommended` ; la configuration utilise les presets publiés dans `angular-eslint`. Les sélecteurs et dérogations existants sont conservés. La nouvelle préférence OnPush reste désactivée pour préserver `ChangeDetectionStrategy.Eager` issu de la migration Angular ; ce lot ne change pas la stratégie de détection de l'application.
- **RxJS applicatif 7.8.2** : les imports racine de Transloco fonctionnent désormais. **Exception explicitement isolée :** le transport Ledger BLE installé, `@ledgerhq/hw-transport-web-ble@6.27.5`, exige `rxjs: 6`. L'alias npm exact `rxjs-ledger: npm:rxjs@6.6.7` fournit le Subject et l'opérateur `filter` aux deux adaptateurs BLE uniquement. Aucun alias Webpack, override global, changement de version du transport ni changement des conditions de filtrage des trames. Les tests utilisent également cette frontière RxJS 6. La modernisation du transport Ledger reste un lot séparé.
- **Scanner QR** : `@zxing/ngx-scanner@22.0.1`, `@zxing/browser@0.2.1`, `@zxing/library@0.23.0`. Contraintes publiées vérifiées : scanner 22.0.1 accepte TypeScript `^6.0.0` ; browser 0.2.1 accepte library `^0.23.0`. Éviter scanner 22.0.0 (peer TS 5.9) et browser 0.2.0 (peer library 0.22). La nouvelle library introduit `ts-custom-error@3.3.1`, qui corrige la déclaration générique incompatible avec TS6.
- **Configuration TypeScript** : retrait de `downlevelIteration` pour la cible ES2022 et de `baseUrl`, remplacé par des chemins explicites `app/*`, `environments/*` et `stream`. Suppression des diagnostics Angular étendus inapplicables lorsque `strictTemplates` reste désactivé, comme dans la base existante. Electron utilise la résolution Node16/CommonJS avec `rootDir: src` explicite pour conserver `desktop-app/dist/desktop-app.js` ; compilation Electron toujours en échec sur les types stricts.
- **CSS** : chemins relatifs explicites vers `qr-code.svg` dans account-details, receive et sign, pour conserver la résolution des ressources après retrait de `baseUrl`.
- **Tests simulés** : mocks d'exports ESM marqués `__esModule` pour TypeScript 6 et ajout de `ChangeDetectionStrategy.Eager` aux mocks Angular. Aucun scénario retiré.

### Résultats locaux et limites

Environnement : Node **24.19.0**, npm **11.9.0**, Angular **22.2.3**, TypeScript **6.0.3** (versions résolues à confirmer par le lockfile).

| Vérification | Résultat |
| --- | --- |
| `npm ci --legacy-peer-deps --no-audit --no-fund` | Échec local de construction native `node-hid` : extraction des en-têtes Node, `fchown EINVAL`. La CI Ubuntu avec Node 22.22.3 reste indispensable pour valider l'installation native. |
| Installation avec `--ignore-scripts` | Réussie pour vérifier le verrou et travailler sur Web/lint ; **ne constitue pas une validation native Electron**. |
| `npm run lint` et `npm run lint:flat` | Réussis, **0 erreur / 7 avertissements** de directives eslint-disable inutilisées préexistantes. |
| `node scripts/test-ledger-bluetooth.js` | **43/43 réussis**, sur le JavaScript émis localement par TypeScript. Le compilateur Electron signale encore des erreurs : ce succès isolé ne valide pas la chaîne `desktop:build`, le matériel ni la reconnexion Nano X. |
| `npm run wallet:build` | Échec : **1 060 diagnostics TypeScript** dans le code applicatif. Les erreurs de résolution RxJS/Transloco, `ts-custom-error`, TS5101/NG4003 et les chemins CSS QR ne sont plus observées. Aucun `dist/ngsw.json` validé. |
| `npm run desktop:compile` | Échec : types stricts du main process et des services, déclarations tierces et bibliothèque Intl. Ne pas annoncer Electron prêt. |
| Angular/RPC, APK, plateformes et tests matériels | Non validés sur ce lot ; compilation à rétablir d'abord. |
| Vercel | Lecture du déploiement existant refusée par l'API : **403**, accès à l'espace `olaverre-1312` non autorisé pour la connexion actuelle. Aucun déploiement ni changement d'alias effectué. |

### Prochain blocage : migration des types stricts

Le TypeScript 6.0.3 installé déclare **`strict` activé par défaut**, alors que Nault n'avait pas activé ce mode explicitement auparavant. Il ne s'agit donc pas uniquement de quelques champs Angular : le build révèle une dette de typage applicative étendue. Ne pas la masquer par un interrupteur global.

Répartition du dernier build local : **353 TS7006** (paramètres implicites), **188 TS2322**, **158 TS2339**, **75 TS2345**, **52 TS2531**, **34 TS18046**, **30 TS7015**, **29 TS2564**, et autres diagnostics. Principales zones : wallet.service (85), musig.service (76), account-details (73), sign (66), pow.service (63), sweeper (58), configure-app (54), receive (49). Ces nombres sont des diagnostics, pas nécessairement autant de corrections indépendantes.

Procéder par modèles partagés et services, puis composants : typer les réponses RPC, états nullables, collections et erreurs externes ; vérifier les invariants des clés et signatures plutôt qu'ajouter des assertions arbitraires. Conserver les contrôles stricts. Relancer ensuite Web/PWA, Electron, Angular/RPC et les 43 tests Ledger sur le même SHA. **Pas de fusion master ni de déploiement de staging tant que le build n'est pas validé.**

## État opérationnel précédent — 22 octobre 2026 (avant ce lot)


### 1. Jalons validés et périmètre

- **Angular 21 : terminé et intégré à `master`.** [PR #24](https://github.com/twister65/Nault/pull/24) fusionnée le **22/10/2026 à 19:27 UTC**, commit de merge [`0a94c865`](https://github.com/twister65/Nault/commit/0a94c865659a2add43e7832278f93df247f2130b). Les contrôles Angular 21 ont réussi : compilation Web/PWA, Electron, lint flat config, tests automatisés et CodeQL ; voir notamment [run Angular 21 39839404907](https://github.com/twister65/Nault/actions/runs/39839404907), [lint 39839404948](https://github.com/twister65/Nault/actions/runs/39839404948) et [CodeQL 39839393732](https://github.com/twister65/Nault/actions/runs/39839393732). La section historique qui décrit cette PR comme « Draft — non fusionnée » est **obsolète**.
- **Angular 22 : branche existante conservée**, sans réécriture d'historique. `master` y a été incorporé par [`9c7f6a3`](https://github.com/twister65/Nault/commit/9c7f6a3fb9c552a00abc0e5a7040cfbcf1fba8af). Le dernier commit consulté est [`67896f0`](https://github.com/twister65/Nault/commit/67896f0a4fd7335af05321448baab59b578a647d), migration Angular 22. **Ne pas fusionner Angular 22 dans `master` avant CI et validation fonctionnelle.**
- **Versions déclarées dans `package.json` au commit consulté :** `@angular/core@^22.2.3`, `@angular/cli@^22.2.4`, `typescript@~6.0.2`, `@angular-eslint/builder@^22.6.0`, `@ng-bootstrap/ng-bootstrap@^21.0.0`, `@jsverse/transloco@^8.4.0`, `rxjs@^6.5.5`. **Attention : `eslint@^9.39.5` dans le manifeste alors que `eslint.config.cjs` et le workflow de validation attendent ESLint 10.13.0.** La précédente validation d'ESLint 10 concernait Angular 21 ; ne pas la transposer automatiquement à la branche Angular 22.
- Le lockfile Angular 22 a fait l'objet de régénérations réussies ([runs 39841233014](https://github.com/twister65/Nault/actions/runs/39841233014) et [39841455677](https://github.com/twister65/Nault/actions/runs/39841455677)), **mais la synchronisation et la compatibilité doivent être revérifiées après chaque changement du manifeste**, notamment après le commit `67896f0`. Un workflow de régénération réussi ne démontre pas que l'application compile.

### 2. Blocages observés — ne pas les masquer

| Zone | Faits vérifiés | Action suivante / critère de sortie |
| --- | --- | --- |
| **Web/PWA Angular 22** | [Validation 39841611069](https://github.com/twister65/Nault/actions/runs/39841611069) **failure** sur un commit antérieur à `67896f0`, à l'étape `Build production Web wallet and service worker`. | Réexécuter sur la **tête courante**, obtenir un build production et `dist/ngsw.json` valide. |
| **RxJS et traductions** | Le compilateur indique que `@jsverse/transloco` importe `map`, `retry`, `tap`, `switchMap`, etc., non exportés à la racine par le RxJS 6 installé. | Vérifier les contraintes peer et l'usage applicatif ; envisager RxJS 7 compatible avec Angular 22 et l'ensemble des bibliothèques, avec migration ciblée et tests. **Ne pas détourner le problème avec un alias Webpack sans justification.** |
| **TypeScript 6 et Angular compiler** | `TS5101` sur `baseUrl` et `downlevelIteration` du `tsconfig.json` ; `NG4003` : `extendedDiagnostics` actif tandis que `strictTemplates` est désactivé ; `TS2564` sur des champs de composants ; `TS2344` dans `ts-custom-error`. | Traiter par catégorie : retirer les options TS devenues inutiles ou documenter temporairement `ignoreDeprecations: "6.0"`, aligner les diagnostics Angular, corriger les initialisations/types et inspecter le parent de `ts-custom-error`. Ne pas désactiver globalement les vérifications pour « passer » la CI. |
| **ESLint 10 / flat config** | [Lint 39841610854](https://github.com/twister65/Nault/actions/runs/39841610854) **failure** : `Cannot read properties of undefined (reading 'recommended')`. `eslint.config.cjs` accède notamment à `angularTs.configs.recommended.rules`. Manifeste courant : ESLint 9, alors que [`angular-22-validation.yml`](https://github.com/twister65/Nault/blob/upgrade/angular-22/.github/workflows/angular-22-validation.yml) attend ESLint 10.13.0 et `@typescript-eslint/parser@8.72.0`. | Vérifier les exports réels des paquets `@angular-eslint@22`, adapter la flat config aux API publiées, aligner versions ESLint / typescript-eslint / verrou et obtenir `npm run lint` **et** `npm run lint:flat` verts. |
| **Electron / Android / sécurité** | Les jobs Angular 22 n'ont pas encore prouvé une chaîne de build et de tests complète. CodeQL a réussi sur certains commits ([39841610954](https://github.com/twister65/Nault/actions/runs/39841610954)), alors que le lint, la validation Angular 22 et certains Docker ont échoué. | Ne pas interpréter CodeQL vert comme validation fonctionnelle ; valider Web/PWA, Electron/TypeScript, tests RPC, Ledger simulés, Android/APK et sécurité sur **le même commit final**. |

Les erreurs citées proviennent des jobs GitHub Actions inspectés le 22 octobre 2026 ; si le commit courant les a déjà corrigées, le prouver par un **nouveau run vert** plutôt que reproduire des diagnostics anciens.

### 3. Déploiement Vercel stable et CORS Apache — contrainte utilisateur

**Aucune modification répétée d'Apache n'est souhaitée.** L'instance Apache n'autorise que les origines suivantes pour les tests :

```apache
SetEnvIf Origin "^https://(nault-wallet-staging-olaverre-1312|nault-tablet-css-test|nault-android-test(-olaverre-1312)?)\.vercel\.app$" NAULT_CORS_ORIGIN=$0
```

- Privilégier l'URL stable **`https://nault-wallet-staging-olaverre-1312.vercel.app`** pour Angular 22. Les autres domaines autorisés sont `https://nault-tablet-css-test.vercel.app`, `https://nault-android-test.vercel.app` et `https://nault-android-test-olaverre-1312.vercel.app`. **Les URL éphémères** de type `nom-projet-<hash>-olaverre-1312.vercel.app` **ne correspondent pas** à cette règle Apache.
- Projet Vercel de staging existant : `nault-wallet-staging` ; ne pas modifier le projet public de production ni supposer qu'un alias temporaire est autorisé. Respecter l'authentification/protection déjà en place et ne pas exposer les endpoints Nano/RsNano ni les secrets.
- Déploiement de staging Angular 22 déclenché pour le commit `67896f0` : `dpl_Ay7HaL1cBZy27qXZYkB9pdSXXFfb`, **ERROR**, avec `Command "npm run wallet:build" exited with 1`. **Aucun nouveau build Angular 22 opérationnel à annoncer.** L'alias stable conserve potentiellement le dernier déploiement `READY` : vérifier à quel commit il pointe avant les tests.
- Corriger d'abord les erreurs de build puis déployer la **version validée sur le domaine stable**, contrôler le commit servi, les routes PWA et les appels RPC/WebSocket/CORS depuis cette origine. Une simple modification du nom de domaine **ne résout pas** une erreur de compilation.

### 4. Consignes explicites pour Work — ordre et garde-fous

1. **Lire ce document**, puis inspecter `package.json`, `package-lock.json`, `eslint.config.cjs`, `angular.json`, les `tsconfig*`, les workflows et **les nouveaux logs CI/Vercel**, avant de coder. Utiliser les données du commit actuel, non les anciens décomptes « 19 deprecated » conservés plus bas à titre historique.
2. Rendre `npm ci --legacy-peer-deps --no-audit --no-fund` reproductible sous Node compatible Angular 22 ; aligner ESLint 10 / flat config / TypeScript 6 et tester les paquets Angular tiers (`@ng-bootstrap/ng-bootstrap`, `@jsverse/transloco`, `@zxing/ngx-scanner`) un par un. Préserver le builder Webpack tant que le worker PoW n'est pas migré et validé.
3. Corriger les erreurs Angular/TypeScript/RxJS en commits ciblés. Exiger **build Web/PWA + `ngsw.json`**, build Electron, lint, tests Angular unitaires, RPC Nano/RsNano, régressions USB/BLE simulées et CodeQL **sur la tête finale de `upgrade/angular-22`**. Documenter les échecs restants et les changements de versions réellement testés.
4. Utiliser un **domaine Vercel déjà autorisé par Apache** pour les tests Web/Android ; éviter les previews éphémères comme origine RPC. Ne pas modifier `SetEnvIf`, ne pas rendre le projet public et ne pas effectuer de déploiement du vrai site de production Nault.
5. **Pas de nouvel essai matériel Bluetooth pour l'instant.** La seconde reconnexion Nano X après éloignement/réapprochement reste **non corrigée** ; l'action manuelle `Clear session` fonctionne. Garder ce problème documenté et isolé ; reprendre les essais réels USB/WebHID/BLE, Android tablette/smartphone, Linux et Windows **après la migration Angular 22**, conformément à la décision de l'utilisateur.
6. **Ne pas fusionner Angular 22 dans `master`**, ni modifier les règles Apache, ni modifier la chaîne de signature Ledger pour corriger une erreur de build. Préparer la PR et ses preuves CI pour revue ; conserver l'historique de `upgrade/angular-22`. Les changements sur le moteur RPC, les politiques de sécurité et le Bluetooth restent des lots distincts sauf correctif indispensable et testé.

### 5. Distinction historique / état présent

Les sections suivantes constituent le journal technique des lots Angular 21 et des enquêtes Bluetooth effectuées auparavant. Elles sont **conservées volontairement**, mais leurs formules telles que « aucune fusion effectuée », « migration Angular 22 non encore exécutée », « retrait U2F à étudier » ou les anciens chiffres de vulnérabilités **ne décrivent plus le présent**. En cas de contradiction, **les résultats de CI du dernier commit et les décisions de ce chapitre opérationnel prévalent**. Mettre ce chapitre à jour après chaque correction importante, avec commit, run, statut de build et domaines Vercel testés.

---

## Historique des lots et diagnostics antérieurs (conservé)

## Synchronisation de master — 22 octobre 2026

- Commit d'intégration sur la branche de nettoyage : [59abee10](https://github.com/twister65/Nault/commit/59abee10c3bb955028cb48fcdbedb07af7756286). **Ce commit fusionne `master` vers `fix/angular-21-deprecated-dependencies`, et non l'inverse** : la branche `master` et `upgrade/angular-22` demeurent inchangées.
- Résolution explicite des trois fichiers ayant évolué des deux côtés. `wallet.service.ts` et `wallet.service.spec.ts` de `master` contiennent déjà les correctifs de coalescence présents dans la branche plus les nouveaux contrôles de réception Ledger indisponible : leurs versions `master` sont conservées. `ledger.service.ts` fusionne les changements disjoints et les deux champs insérés au même emplacement, préservant l'instruction de reconnexion pour les fonds reçus ainsi que les messages d'état Bluetooth, tout en retirant U2F.
- Diff GitHub maintenant sans retard vis-à-vis de `master` : PR [#24](https://github.com/twister65/Nault/pull/24) sans conflit Git automatique mais **en brouillon, sans fusion**. Tests automatisés et CodeQL à relancer sur la tête combinée avant toute intégration.
- Les essais matériels Nano X, WebHID et USB restent reportés à la campagne Angular 22. L'incident de deuxième reconnexion Bluetooth demeure ouvert, contourné par `Clear session` ; aucune réussite matérielle n'est revendiquée.

## Lot 7 — polyfill url et traçage des dépendances transitives (22 octobre 2026)

**Inventaire après ESLint 10 (run [39836383702](https://github.com/twister65/Nault/actions/runs/39836383702)) :** les avertissements `deprecated` passent **de 15 à 12** ; `npm audit` passe de **57 à 49 alertes** (35 élevées, 11 modérées, 3 faibles, 0 critique), avec **6 paquets directs** signalés contre 8. La CI Angular 21 complète du commit `73272cd` est **verte** ([run 39837094273](https://github.com/twister65/Nault/actions/runs/39837094273)) : Web/PWA, Electron/TypeScript, lint flat config, tests automatisés USB/BLE/RPC et **101 tests Angular**. `desktop-app/tsconfig.json` définit explicitement `types: ["node"]` pour ne pas importer automatiquement des déclarations ambient tierces incompatibles, sans désactiver le type-checking.

**Traçabilité établie par `npm explain` ([inventaire GitHub Actions](https://github.com/twister65/Nault/actions/runs/39837729256)) :**
- `@npmcli/move-file`, `are-we-there-yet`, `gauge`, `npmlog`, `glob@8` : `electron-builder@25.1.8 → app-builder-lib → @electron/rebuild@3.6.1 → node-gyp@9.4.1` et composants associés.
- `request`, `har-validator`, `uuid@3`, `debug@3` : `protractor@7 → webdriver-manager / browserstack / saucelabs`. Migrer Protractor requiert un runner E2E de remplacement avec tests fonctionnels.
- `glob@7` : notamment `@electron/asar` via Electron Builder, ainsi que l'ancienne chaîne de couverture Karma.
- `uuid@8` : `webpack-dev-server → sockjs`, amené par Angular 21 build-angular.
- `querystring@0.2.0` : uniquement `url@0.11.0` direct.

**Correction ciblée :** `url@^0.11.0 → ^0.11.4` sans changer l'API d'appel ni la chaîne Ledger/Bluetooth ; le `url@0.11.4` publié utilise `qs` et `punycode`, plus `querystring`. Le lockfile v2 a été régénéré et contrôlé automatiquement ([run 39838226628](https://github.com/twister65/Nault/actions/runs/39838226628)), avec confirmation de l'absence de `querystring`. Nouvelle CI et nouveau rapport de dépréciations à vérifier sur la tête finale de branche.

**Décision :** ne pas forcer de majors de `node-gyp`, `glob`, `uuid` ni de la pile Protractor par des overrides globaux. Examiner les migrations d'Electron Builder, E2E et les bibliothèques Angular par lots dédiés, en conservant la couverture et les builds Linux/Windows. Le Bluetooth matériel est suspendu jusqu'à Angular 22.

## Lot 6 — ESLint 10 et configuration flat (22 octobre 2026, validation en cours)

- Objectif : remplacer **ESLint 8.57.1 (fin de support)** directement par **ESLint 10.13.0**, compatible avec les peer dependencies de `@angular-eslint@21.4.0`. La ligne ESLint 9 étant également en fin de support, elle n'est pas utilisée comme palier.
- Mettre `@typescript-eslint/parser` et `@typescript-eslint/eslint-plugin` sur **8.56.0**, compatibles avec TypeScript 5.9 et ESLint 10. Ne pas modifier les versions du framework Angular 21.
- `eslint.config.cjs` remplace `.eslintrc.json`, avec recommandations Angular TypeScript/templates, extraction des templates inline et dérogations existantes (sélecteurs, standalone, inject, contrôle de flux).
- Le workflow temporaire `Regenerate ESLint 10 lockfile` régénère **uniquement `package-lock.json`** au format v2 sur la branche Angular 21. Le lockfile doit être vérifié par `npm ci --legacy-peer-deps`, `npm run lint`, builds et tests CI avant clôture de ce lot. Retirer ensuite ce workflow temporaire.
- Les dépendances transitives, bibliothèques Angular tierces, moteurs Ledger/RPC et `upgrade/angular-22` restent hors périmètre. Le défaut de deuxième reconnexion Bluetooth reste ouvert ; **aucun essai matériel supplémentaire demandé**.
- **Statut : préparation technique, pas encore validé ni fusionné.** Ne pas fusionner jusqu'à vérification de la CI et revue des différences avec `master` (dont les correctifs de réception Ledger indisponible).

## Lot 5 — mise à jour isolée de `electron-settings` (22 octobre 2026)

**Branche :** `fix/angular-21-deprecated-dependencies`, framework Angular **21 inchangé**. `master` et `upgrade/angular-22` non modifiées.

- **Package de production :** `electron-settings@4.0.2` → `4.0.4` dans `package.json` et `package-lock.json` (série 4.x ; maintien de l'API existante `setSync/getSync`). Dépendances vérifiées dans les lockfiles publics de deux projets tiers (Appium Inspector et Upscayl) : `lodash@^4.17.21`, `mkdirp@^1.0.4`, `write-file-atomic@^3.0.3`. Intégrité SHA512 du tarball vérifiée dans les deux références. `lodash` est déjà verrouillé en `4.17.21` dans Nault.
- Suppression de quatre dépendances transitives orphelines `lodash.get@4.4.2`, `lodash.has@4.5.2`, `lodash.set@4.3.2`, `lodash.unset@4.5.2` : leurs seuls parents, dans le lockfile avant correction, étaient `electron-settings@4.0.2`. Conserver `mkdirp@1.0.4` imbriqué et `write-file-atomic`.
- **Aucun changement** d'Electron, Angular, WebUSB, WebHID, Bluetooth ou moteur RPC. Aucun correctif automatique `npm audit fix --force`.
- Commits : [af4d335](https://github.com/twister65/Nault/commit/af4d33522bf10ba0b4c223fec93d2e2ba095f3bb) (manifest) et [39a315e](https://github.com/twister65/Nault/commit/39a315e8d7d71d4803d458c333f8968992c1d3fa) (lockfile).
- **Validation CI confirmée :** [Angular 21, run 39832187419](https://github.com/twister65/Nault/actions/runs/39832187419) **success** : Web/PWA, Electron/TypeScript, lint, **43 tests Ledger BLE/USB**, **31 tests RPC**, **101 tests Angular**. [Inventaire/audit, run 39832187366](https://github.com/twister65/Nault/actions/runs/39832187366) **success**, `npm ci` reproductible, **15 avertissements deprecated**. [CodeQL Advanced, run 39832187432](https://github.com/twister65/Nault/actions/runs/39832187432) et [Docker Hub, run 39832187391](https://github.com/twister65/Nault/actions/runs/39832187391) **success**. Lint indépendant [39832187396](https://github.com/twister65/Nault/actions/runs/39832187396) : **success**. Les échecs intermédiaires du commit manifest seul (`af4d335`) sont dus au lockfile momentanément non synchronisé ; **ne pas les confondre avec la CI validée du commit final**.
- **Audit de sécurité avant/après comparable :** run [39825282313](https://github.com/twister65/Nault/actions/runs/39825282313) (avant ce lot) : **60 vulnérabilités npm** (44 élevées, 13 modérées, 3 faibles, 0 critique), 9 paquets directs vulnérables, 15 dépréciations. Run [39832187366](https://github.com/twister65/Nault/actions/runs/39832187366) (après le lot) : **57 vulnérabilités npm** (42 élevées, 12 modérées, 3 faibles, 0 critique), **8 paquets directs vulnérables**, 15 dépréciations. **Réduction vérifiée de 3 alertes** sans modification des versions Angular, Electron ou BLE ; `electron-settings` ne figure plus dans la liste des paquets directs signalés par cet audit. Ne pas confondre diminution des vulnérabilités et diminution des avertissements deprecated.

### Suspension des essais matériels Bluetooth

Résultat utilisateur : réappairage avec `bluetoothctl` **réussit la première connexion** ; après éloignement/réapprochement, la deuxième reconnexion Bluetooth **échoue toujours malgré les commits expérimentaux** [e6b5293](https://github.com/twister65/Nault/commit/e6b5293c7401c29ff823d5c6e7f5b6285f05481c) et [8b6082e](https://github.com/twister65/Nault/commit/8b6082ed5abb04c33f64beec6e83cd54fc43562b). L'action manuelle **« Clear session » rétablit la connexion**. **Essais matériels suspendus à la demande de l'utilisateur** ; ne pas affirmer que la reconnexion automatique est corrigée. Une révision ultérieure du comportement BLE doit rester distincte des lots de dépendances, et les critères de fusion doivent tenir compte de cet incident ouvert.

### Séquencement validé

Finir le nettoyage compatible Angular 21 sur cette branche, puis revue/validation et fusion dans `master` en conservant les correctifs reçus depuis. Seulement ensuite poursuivre la migration Angular 22 sur la branche **existante** `upgrade/angular-22`, sans en réécrire l'historique.

---

## Comparaison du Bluetooth stable et suppression U2F — 22 octobre 2026

### Ce qui a réellement changé

L'ancien correctif de reconnexion est bien dans `master`, issu de `fix/ledger-bluetooth` : validation du transport GATT, suppression des listeners et des requêtes en vol, fermeture explicite de la session périmée, reconnexion forcée sans réutilisation du transport, protection contre les réponses de statut USB tardives. **Ces mécanismes n'ont pas été retirés par le nettoyage des dépendances**. `src/app/services/ledger-ble-control.ts` est identique dans `master` et la branche de nettoyage.

Vérification des lockfiles `fix/ledger-bluetooth`, `master`, `upgrade/angular-21` et `fix/angular-21-deprecated-dependencies` : tous verrouillent **Web BLE 6.27.5**, **WebUSB 6.27.5**, **WebHID 6.27.5**, **@ledgerhq/devices 7.0.2** et **Electron 44.7.0**. Le transport U2F 5.34.0 est inchangé dans toutes ces bases jusqu'au lot ci-dessous. Aucune mise à niveau de Ledger BLE n'a déclenché le nouveau timeout.

Depuis `master`, la branche de nettoyage a ajouté à `ledger-web-ble.ts` : libération du worker USB avant GATT, suivi de la phase de connexion, messages d'erreur Bluetooth plus explicites et **un nouvel essai GATT borné après absence de réponse MTU** (commits du 22/10/2026). Le timeout MTU lui-même, le gestionnaire des notifications et l'option manuelle `Reset Bluetooth session` existaient **déjà** dans `master`. Ne pas confondre le nouveau réessai expérimental avec une régression de versions de dépendances. Il doit être validé avec une véritable Nano X avant fusion.

**Attention avant fusion :** `master` contient d'autres corrections, dont des traitements de Ledger indisponible lors d'une réception XNO, absentes de la branche de nettoyage. Le merge futur devra préserver ces corrections indépendantes et passer les tests de non-régression.

### Retrait de `@ledgerhq/hw-transport-u2f@5.34.0` (lot isolé USB)

Le package U2F historique était encore réellement importé par `src/app/services/ledger.service.ts` : transport navigateur par défaut, détection `isSupported()`, et fallback lorsque ni WebUSB ni WebHID n'étaient disponibles. Sa dépréciation **ne pouvait pas être résolue par le seul nettoyage du lockfile** ; l'avertissement npm n'avait aucun lien fonctionnel avec Bluetooth.

Changement réalisé dans `fix/angular-21-deprecated-dependencies` :
- Suppression de l'import et du fallback U2F. USB navigateur : **WebUSB en priorité, WebHID sinon** ; si aucun transport moderne n'est disponible, afficher une instruction explicite sans tenter d'ouvrir un transport déprécié. USB Electron : **node-hid inchangé** ; Android : Bluetooth inchangé.
- Suppression de la préférence/temporisation U2F historique, de la dépendance directe dans `package.json` et de ses entrées orphelines (dont `u2f-api`) du lockfile v2. Aucun paquet BLE, HID ou Electron n'a changé de version.
- Tests ajoutés : sélection WebUSB/WebHID, refus USB navigateur non compatible, suppression des attentes de fallback U2F. Préserver la couverture des reconnexions USB/Bluetooth.
- Commits : [51118d0](https://github.com/twister65/Nault/commit/51118d0663f7bf2e0dfee3ee065a51cd5b894c40), [3d8e246](https://github.com/twister65/Nault/commit/3d8e246dbecc1322d6aa3558af0694b583d65313), [5eabb9c](https://github.com/twister65/Nault/commit/5eabb9c47f6d3509ace5458baee4d160e68e2e62), [20c12c8](https://github.com/twister65/Nault/commit/20c12c8089980f458abb3b845625e94f4bd91263).
- **Validation CI confirmée**, sur la branche après correction du test de déconnexion : [Angular 21 — run 39825282416](https://github.com/twister65/Nault/actions/runs/39825282416) **success** (Web/PWA, Electron/TypeScript, lint, **43 tests Ledger BLE/USB**, **31 tests RPC**, **101 tests Angular**) ; [inventaire npm — run 39825282313](https://github.com/twister65/Nault/actions/runs/39825282313) **success** : **16 → 15 avertissements deprecated**, `hw-transport-u2f` absent ; [CodeQL Advanced](https://github.com/twister65/Nault/actions/runs/39825282329), [lint](https://github.com/twister65/Nault/actions/runs/39825282323) et [Docker Hub](https://github.com/twister65/Nault/actions/runs/39825282316) **success**. Le premier passage avait échoué sur une assertion de test attendant un ancien libellé d'erreur BLE ; elle a été adaptée dans [2b43790](https://github.com/twister65/Nault/commit/2b43790d6f4a80bdfd4af9a61e926343ef04b2c3). **Le Bluetooth réel reste à valider**, notamment l'éloignement/réapprochement de la Nano X.
- **À valider sur matériel** avant fusion : Chromebook/Chrome WebUSB, WebHID selon navigateur, Electron USB sur Ubuntu/Windows, Nano X Bluetooth, reconnexion après déconnexion radio. Les anciens navigateurs ne supportant que U2F ne pourront plus utiliser l'USB ; il s'agit d'un abandon de support volontaire.

À plus long terme, les transports LedgerJS eux-mêmes sont dépréciés au profit de [Ledger Device Management Kit (DMK)](https://developers.ledger.com/docs/device-interaction/dmk-ts/integration/migrations/ledgerjs-to-dmk). Une migration DMK doit rester **distincte** de cette suppression ciblée afin de ne pas masquer la régression BLE.

---

## Linux / Nano X — après réappairage, échec de reconnexion après perte de portée (22 octobre 2026)

**Retour utilisateur (nouvel essai matériel) :** l'appairage a été rétabli via `bluetoothctl`. La première connexion de Nault en Bluetooth réussit : services et caractéristiques GATT trouvés, notifications activées, réponse MTU reçue, configuration Nano et adresse lues. Après éloignement de la Nano X, la connexion tombe normalement. Après rapprochement et clic sur **Reconnect via Bluetooth**, les services et caractéristiques sont à nouveau découverts et `startNotifications()` réussit, mais **aucun `MTU response received` n'arrive** : `Ledger Bluetooth MTU negotiation timed out`. Le journal source est `reconnect-bt-console.log`. Il ne contient pas de nouvelle preuve d'échec d'authentification.

**Interprétation :** une régression ou limitation de reprise des notifications Web Bluetooth/Chromium/BlueZ après une coupure de portée est plausible. Le succès de `startNotifications()` ne prouve pas que les événements `characteristicvaluechanged` sont de nouveau livrés. La cause exacte n'est pas prouvée sans trace HCI/GATT. Le message d'authentification doit rester réservé aux erreurs HCI/DOM d'authentification, pas aux timeouts MTU.

**Correctif expérimental, isolé à la phase de négociation MTU :**
- Dans `src/app/services/ledger-web-ble.ts`, après le **premier timeout MTU de 12 secondes**, supprimer les listeners et terminer la session, déconnecter GATT, attendre brièvement la libération de Chromium/BlueZ, puis rouvrir une **seule fois** le même `BluetoothDevice` autorisé en redécouvrant les services, caractéristiques et notifications. Pas de second sélecteur, pas de nouvel appairage forcé.
- Si la seconde négociation MTU échoue également, remonter l'erreur existante et conserver l'action manuelle **Reset Bluetooth session** (rechargement de la fenêtre suivi d'un nouveau clic utilisateur sur Reconnect). Ne pas créer de boucle infinie.
- Ne jamais rejouer automatiquement les commandes applicatives ou transactions Nano. Cette reprise intervient **avant** la lecture d'adresse et tout échange APDU ; aucun envoi/signature ne doit pouvoir être dupliqué.
- Tests de simulation pour une réponse MTU manquante sur la première session puis reçue sur la deuxième, et pour deux timeouts consécutifs, avec vérification du nettoyage des listeners et de l'absence de boucle.
- Commits : [e6b5293](https://github.com/twister65/Nault/commit/e6b5293c7401c29ff823d5c6e7f5b6285f05481c), [8b6082e](https://github.com/twister65/Nault/commit/8b6082ed5abb04c33f64beec6e83cd54fc43562b). [CI Angular 21, run 39822599966](https://github.com/twister65/Nault/actions/runs/39822599966) : **résultat à vérifier**, ne pas annoncer de validation réelle tant que le test matériel manque.

**Protocole manuel de validation :** sur Linux, mettre à jour la branche et tester BLE à courte distance (lecture de l'adresse), éloigner la clé jusqu'à déconnexion, la rapprocher, cliquer une seule fois sur `Reconnect via Bluetooth`. Observer si `retrying one fresh GATT session after missing MTU reply` apparaît et si `MTU negotiated` puis `account address read successfully` sont obtenus. Tester plusieurs cycles, sans signer de transaction. Si échec, essayer l'action `Reset Bluetooth session` puis cliquer Reconnect ; comparer les résultats.

**État : validation matérielle en attente** ; `master` et `upgrade/angular-22` non modifiées.

---

## Diagnostic HCI décisif — Nano X / appairage BLE, 22 octobre 2026

**Source :** extrait `btmon` fourni après l'échec de la connexion avec la Nano X. Le log transmis contient des adresses matérielles, volontairement **non reproduites** dans ce document.

| Événement HCI | Statut | Interprétation |
| --- | --- | --- |
| `LE Enhanced Connection Complete` | `Success (0x00)` | Liaison LE physique établie |
| `Encryption Change` | `PIN or Key Missing (0x06)` | L'une des extrémités ne dispose pas de la clé de chiffrement attendue ou refuse une ancienne association |
| `Disconnect` (commande hôte) | `Authentication Failure (0x05)` | L'hôte déclenche l'arrêt après échec d'authentification |
| `Disconnect Complete` | `Connection Terminated By Local Host (0x16)` | Déconnexion effectuée côté hôte |
| `MGMT Device Disconnected` | `authentication failure (0x04)` | BlueZ confirme le motif |

**Conclusion révisée :** cause probable et maintenant étayée : **appairage Bluetooth LE / clé de liaison persistée incohérente** entre Ubuntu/BlueZ et la Nano X. Le code `PIN or Key Missing` distingue clairement cette panne d'un problème de découverte de services propre à Nault, d'un bug Angular, du protocole RPC ou d'un simple problème de portée radio. Il ne permet cependant pas de savoir avec certitude quel appareil a perdu sa clé.

**Résolution préconisée, à confirmer matériellement :**

1. Fermer Nault, Ledger Live et tout autre client BLE. Débrancher l'USB de la Nano X.
2. Avec `bluetoothctl` sur Ubuntu, utiliser `devices Paired` et `info <adresse>` pour identifier **uniquement** l'association Nano X ; exécuter `remove <adresse>`. Ne pas effacer tous les périphériques ni les répertoires système BlueZ.
3. Sur la Nano X : **Control Center → Settings → Security → Reset pairings**, confirmer, puis éteindre/rallumer la Nano X. **Ne pas utiliser Reset Device** : seul le Bluetooth doit être réinitialisé, jamais la phrase de récupération.
4. Rallumer le Bluetooth et ouvrir l'application Nano sur la clé ; dans le portefeuille Ledger existant de Nault, déclencher explicitement `Reconnect via Bluetooth`, sélectionner la Nano X et confirmer tout code d'appairage affiché sur les deux appareils. Ne pas lancer en parallèle une association depuis GNOME ou `bluetoothctl pair`.
5. Vérifier `Encryption Change: Status: Success (0x00)`, puis `Ledger service found`, `MTU negotiated` et lecture de l'adresse Ledger. Aucun transfert requis.
6. Si l'échec persiste après une nouvelle association : recueillir seulement les nouveaux événements `Pairing Request`, `Pairing Failed`, `Encryption Change` et `Disconnect Complete` de `btmon`, sans publier les adresses MAC.

**Implications pour le code :** ne pas proposer de contournement désactivant le chiffrement Bluetooth, ni supprimer le contrôle d'appairage Electron. Le handshake USB/HID ajouté dans un lot précédent reste utile pour éviter une course mais **ne corrige pas une clé d'appairage manquante**. Ne pas prétendre que la connexion matérielle est réparée tant que l'essai après réappairage n'a pas été validé.

Références : [Ledger — navigation Nano X / Reset pairings](https://support.ledger.com/ru/article/Ledger-Nano-X-Nano-S-Plus-Navigation-Menu-Map), [bluetoothctl — commande remove](https://manpages.debian.org/unstable/bluez/bluetoothctl.1.en.html), [Electron — gestion de l'appairage Web Bluetooth](https://www.electronjs.org/docs/latest/tutorial/devices).

---

## Incident BLE Linux — deuxième échec après libération USB (22/10/2026, 18 h 42)

**Résultat du test matériel : toujours en échec** malgré le handshake de libération USB validé en CI. L'utilisateur confirme en terminal :
```text
[Ledger BLE chooser] selection completed { selected: true }
[Ledger USB] HID worker released before Bluetooth discovery
... bluetooth_device_bluez.cc:311 Leaking connection to paired device.
```

Le journal `NanoX-BT-console.log` confirme la suite :
```text
[Ledger BLE GATT] connected
[Ledger BLE GATT] discovering services
[Ledger BLE GATT] session disposed
[Ledger BLE GATT] session opening failed DisconnectedDevice
```

**Conclusion corrigée :** la fermeture de la session native USB est bien effectuée ; **la course USB/HID proposée dans le correctif précédent n'explique pas à elle seule l'échec**. La sélection Web Bluetooth et la connexion GATT réussissent, puis la découverte des services échoue parce que le lien disparaît. Les traces ne contiennent pas le motif HCI de déconnexion, ni le détail `ServicesResolved` de BlueZ.

**Clarification source Chromium :** [`bluetooth_device_bluez.cc` — `DisconnectGatt()`](https://chromium.googlesource.com/chromium/src/+/main/device/bluetooth/bluez/bluetooth_device_bluez.cc) émet `Leaking connection to paired device.` lorsqu'un appareil est déjà *paired* : Chromium refuse volontairement de forcer une déconnexion BlueZ partagée pour éviter d'interrompre un autre consommateur. Ce journal signale cette décision de gestion de connexion ; ce n'est **ni une preuve de fuite mémoire ni une cause de panne**.

**Instrumentation ajoutée, sans changement de protocole ni réessai automatique :**
- `ledger-web-ble.ts` journalise désormais la phase exacte (`GATT connection`, `GATT service discovery`, `GATT characteristic discovery`, `GATT notification subscription`, `Ledger MTU negotiation`), sa durée en millisecondes, et toute exception native de `getPrimaryServices()` si disponible. Aucune adresse Bluetooth, clé, signature ou APDU n'est ajoutée au journal.
- Tests simulés de rejet `getPrimaryServices()` et de coupure sur cette phase. Le premier essai CI a montré qu'un objet `Error` provenant d'un autre contexte JavaScript échappait à `instanceof Error` ; correction des logs dans [90b0267](https://github.com/twister65/Nault/commit/90b0267dd1e81d29228154dbc9715e3f484f33f6). Commits précédents : [c56178d](https://github.com/twister65/Nault/commit/c56178d7ad3b28f1289c52b6f8bbbe8bd78bb9c3), [e98bb85](https://github.com/twister65/Nault/commit/e98bb85cf5343bed41ec2107c6c334a143fa0cc2).
- **Validation automatisée confirmée :** [run 39817605630](https://github.com/twister65/Nault/actions/runs/39817605630) **success** : 35 tests Ledger Bluetooth, 31 tests RPC, 101 tests Angular, builds Web/PWA et Electron et lint. Cette validation ne signifie pas que la connexion Bluetooth réelle est réparée.

**Prochaine discrimination indispensable, sans réinitialiser l'appairage :** relever un court `btmon` en temps réel sur Ubuntu pendant une seule tentative Web Bluetooth ; repérer le motif HCI `Disconnect Complete` et les changements `ServicesResolved`/`Connected` de BlueZ. Vérifier ensuite si une connexion BLE directe, hors Nault mais via le même contrôleur BlueZ, peut découvrir le service Nano X documenté `13d63400-2c97-0004-0000-4c6564676572`. Si elle échoue aussi, la piste système/firmware/appairage prend le dessus ; si elle réussit, analyser le chemin Chromium/Electron et l'appel `getPrimaryServices()`. **Ne pas modifier aveuglément les UUID, désactiver l'appairage sécurisé ni redémarrer Bluetooth en boucle.**

**Statut : incident ouvert — le dernier correctif n'a pas résolu la connexion réelle.** Aucun impact documenté sur les 16 avertissements `npm deprecated`.

---

## Incident Linux Ledger Nano X — nouvelle analyse du 22/10/2026

**Retour matériel :** une reconnexion Bluetooth à froid après redémarrage de Nault échoue encore, après configuration initiale du portefeuille via **Configure Wallet → Use Ledger → USB**. Les traces BlueZ `journalctl` présentées sont anciennes et ne permettent pas de corréler une erreur nouvelle. Le fait que le chooser sélectionne la clé puis que GATT se ferme lors de la découverte des services demeure le constat antérieur ; **ne pas confondre cette observation avec une cause racine prouvée**.

**Causes logicielles plausibles, vérifiées dans les sources :**

1. Le passage USB → BLE envoyait un `ledger:disconnect` non bloquant. Côté Electron, `Ledger.resetLedger()` vidait son état et appelait `transport.close()` *sans en attendre l'achèvement*. En parallèle, un worker USB/HID encore en cours d'ouverture pouvait aboutir **après** ce changement d'état. Une ouverture GATT pouvait ainsi commencer sans garantie de libération du transport natif.
2. Dans `ConfigureWalletComponent`, le bouton de connexion via Bluetooth passait toujours par `importLedgerWallet(false)`, même si un portefeuille Ledger existait déjà : confirmation de remplacement, risque de réinitialisation des comptes locaux et perte du geste utilisateur nécessaire au chooser BLE. **Changer le transport d'un wallet Ledger existant ne doit pas reconfigurer ce wallet**.

**Changements apportés sur `fix/angular-21-deprecated-dependencies` :**

- Nouveau handshake IPC étroit et authentifié : `window.naultDesktop.releaseLedgerUsb()` appelle `ledger-release-usb` ; le processus Electron attend la fermeture du worker USB (et toute ouverture tardive annulée), **avant** `gatt.connect()`. La demande `navigator.bluetooth.requestDevice()` reste déclenchée par l'interaction utilisateur et **précède** cette attente asynchrone, pour ne pas perdre l'activation du chooser.
- Les générations d'ouverture USB sont invalidées lors du changement vers BLE et le worker termine sa fermeture avant l'accusé de réception. Les émetteurs IPC hors fenêtre principale/document fiable sont rejetés.
- `ConfigureWalletComponent.connectLedgerByBluetooth()/connectLedgerByUsb()` utilisent `refreshOnly=true` lorsqu'un wallet de type `ledger` existe ; une première importation continue d'utiliser `refreshOnly=false`. Ceci conserve les comptes et évite un dialogue d'écrasement lors d'un simple changement de transport.
- Régressions ajoutées : USB worker encore en ouverture, attente de fermeture effective avant GATT, refus IPC non autorisé, impossibilité d'ouvrir GATT si la libération échoue, et préservation du portefeuille dans les deux directions USB/Bluetooth.
- Commits principaux : [641f729](https://github.com/twister65/Nault/commit/641f729e19d94363c357d82b489bf744c6978531), [e4a6322](https://github.com/twister65/Nault/commit/e4a632255c3b798d583637da374351cad4dbb755), [3ca22dc](https://github.com/twister65/Nault/commit/3ca22dcd2f7007e75196aa1c5c9fdaece2d1ff71), [df846de](https://github.com/twister65/Nault/commit/df846deec839d8b346065fb1bf198540096cd55d), [b18c0a3](https://github.com/twister65/Nault/commit/b18c0a3cc48f7439b36742e742ffa0339fb6f939), [42b9a39](https://github.com/twister65/Nault/commit/42b9a396fe62f625923bc473b1b133e988b2c91e).

**Validation automatisée confirmée :** [GitHub Actions Angular 21, run 39772956885](https://github.com/twister65/Nault/actions/runs/39772956885) : **success**, build Web/PWA + manifeste, build Electron/TypeScript, lint, **101 tests Angular**, **31 tests RPC**, **33 tests Ledger Bluetooth**. [CodeQL, run 39772956906](https://github.com/twister65/Nault/actions/runs/39772956906), [lint, run 39772956953](https://github.com/twister65/Nault/actions/runs/39772956953) et [Docker Hub, run 39772956926](https://github.com/twister65/Nault/actions/runs/39772956926) : **success**. Les 3 nouveaux tests Angular vérifient la préservation du wallet Ledger existant ; les 4 nouveaux tests Ledger vérifient le handshake USB/BLE, son caractère bloquant et le rejet en cas d'échec. **L'efficacité réelle sur la Nano X n'est pas encore confirmée par un essai matériel ; ne pas fusionner avant vérification Linux.**

**Essai de confirmation :** reconstruire le dernier commit de la branche, conserver le wallet Ledger configuré en USB, utiliser `Reconnect via Bluetooth` sans recréer de wallet, sélectionner la Nano X, vérifier `[Ledger USB] HID worker released before Bluetooth discovery` **avant** `[Ledger BLE GATT] opening connection`. Puis vérifier l'adresse affichée sur la clé et dans Nault (même compte), ainsi que le retour vers USB. Aucun envoi n'est requis.

---

## Essai manuel Linux — Ledger Nano X Bluetooth (22 octobre 2026)

**Statut : incident matériel / BLE À REPRODUIRE — non résolu par la CI.**

L'utilisateur a testé Nault Linux, d'abord sa Ledger Nano X en USB, puis en Bluetooth. Après sélection dans la fenêtre Electron (`[Ledger BLE chooser] selection completed { selected: true }`), le navigateur indique `Bluetooth connection failed: Ledger Bluetooth disconnected. Click Reconnect.`. Le terminal/BlueZ signale `bluetooth_device_bluez.cc:311 Leaking connection to paired device.`.

**Diagnostic à partir du journal `NanoX.log` :** `[Ledger BLE GATT] opening connection {alreadyConnected: false}` → `connected` → `discovering services` → `session disposed {connected: false}` → `session opening failed DisconnectedDevice`. La connexion physique GATT est donc établie mais perdue *pendant la découverte des services*, **avant** découverte des caractéristiques, souscription aux notifications, MTU et premier échange Nano APDU. Les RPC, WebSocket et soldes ne sont pas impliqués. Le message Chromium « Leaking connection » est corrélé à cette coupure, mais **ne démontre pas une fuite de mémoire ni une cause unique**.

**Comportement de Nault :** `ledger-web-ble.ts` reçoit `gattserverdisconnected`, invalide la session et refuse de poursuivre l'échange. Conserver ce comportement fail-closed ; ne pas automatiser de nouvelle sélection, de nouvel appairage ou de tentative APDU après perte de lien.

**Contrôle ajouté :** [test de déconnexion pendant `getPrimaryServices()`](https://github.com/twister65/Nault/commit/12449bfb2ae50f9ea969f1e2dcbce60363333f3f), vérifiant le rejet `DisconnectedDevice`, l'absence de listeners restants et la possibilité d'une nouvelle ouverture explicite. Ce test simule l'évènement ; **il ne valide ni ne répare** le pilote BlueZ, la portée radio ou la véritable Nano X. Résultat CI à reporter pour le commit final.

**Protocole de reproduction conseillé (sans transférer de fonds) :**
1. Débrancher complètement le câble USB, fermer Nault et toute autre application susceptible de tenir la connexion Nano X, couper la connexion Bluetooth d'un éventuel autre appareil.
2. Vérifier la charge et la proximité de la Ledger par rapport à l'adaptateur Bluetooth, puis allumer/déverrouiller la Nano X, activer Bluetooth et ouvrir l'application Nano.
3. Redémarrer Nault et choisir explicitement **Bluetooth → Reconnect**, confirmer la Ledger dans le sélecteur. Tester d'abord une **connexion Bluetooth à froid**, indépendamment de la transition USB → Bluetooth.
4. Comparer avec une deuxième tentative après connexion USB puis déconnexion USB, en conservant les mêmes conditions physiques. Noter la présence/absence de `GATT connected`, `discovering services`, `notifications started`, `MTU negotiated`, `account address read successfully`.
5. En cas de nouvel échec : relever **uniquement les événements BlueZ anonymisés** (`sudo journalctl -u bluetooth --since '10 minutes ago' --no-pager`) et l'état du contrôleur (`bluetoothctl show` / `bluetoothctl info <MAC>` avec MAC masquée). Ne pas enregistrer d'APDU, de clé ou de seed. Éviter réinitialisation d'appairage sans besoin démontré.

**Critère de clôture :** une connexion Bluetooth à froid et une transition USB → Bluetooth reproductibles avec lecture d'adresse et reconnexion. Ne pas prétendre que les tests CI matériels sont verts : la CI exécute des simulations. L'incident reste ouvert en attendant un nouveau test Linux.

---

## Point d'étape du 22 octobre 2026 — Lot 3 VALIDÉ

**Ordre des branches demandé :** continuer exclusivement les mises à jour de dépendances dans `fix/angular-21-deprecated-dependencies` ; après validation et fusion de cette branche, réintégrer les corrections dans **`upgrade/angular-22`** pour poursuivre Angular 22. Cette dernière branche **existe déjà**, contient `@angular/core@^22.2.3` et `typescript@~6.0.2`, et a divergé : **préserver ses commits**, étudier les conflits et ne pas la recréer/écraser. Aucun changement appliqué à `master` ou `upgrade/angular-22` dans ce lot.

### Lot 3 — retirer `@angular/animations` et `rxjs-compat`

- `package.json` et `package-lock.json` : suppression de `@angular/animations@21.2.25` et `rxjs-compat@6.6.0`. Les recherches automatisées sous `src`, `desktop-app/src`, `scripts` et `e2e` ne trouvent **aucune référence** à ces deux packages. Dans le lockfile, `@angular/animations` n'était requis directement que par la racine ; `@angular/platform-browser` le mentionne en *peerDependency facultative*. `rxjs-compat` n'avait pas d'autre parent.
- Commits : [59d64ad](https://github.com/twister65/Nault/commit/59d64adba6b52c42886bed3d422f480467b37a81) (`package.json`), [0391045](https://github.com/twister65/Nault/commit/0391045260066f9436d4a14e73416e9919af6ff5) (`package-lock.json`).
- L'inventaire `npm ci` confirme **16 noms de paquets dépréciés** : **19 (initial) → 17 (après lots 1–2) → 16 (après lot 3)**, disparition de `@angular/animations` sans apparition d'autre avertissement. Références aux modules legacy surveillés : **0**.
- **CI complète validée** au commit [298ae54](https://github.com/twister65/Nault/commit/298ae548861367eb97f4c3bcffe806e519142d46) : [validation Angular 21 — run 39732056771](https://github.com/twister65/Nault/actions/runs/39732056771) **success** : `npm ci`, build Web/PWA + manifeste, build Electron + TypeScript, lint, **98/98 tests Angular**, **31/31 tests RPC**, **29 tests Ledger BLE**. [Inventaire npm/audit — run 39732056909](https://github.com/twister65/Nault/actions/runs/39732056909), [lint — 39732056916](https://github.com/twister65/Nault/actions/runs/39732056916), [CodeQL — 39732056922](https://github.com/twister65/Nault/actions/runs/39732056922), [Docker Hub — 39732056933](https://github.com/twister65/Nault/actions/runs/39732056933) : **success**.
- Validation matérielle encore requise : Linux / Windows / Android, Ledger Nano S Plus USB, Nano X Bluetooth, réception/envoi et reconnexion. **Aucune fusion** à ce stade.

### Inventaire de sécurité distinct du nombre de dépréciations

Le workflow d'inventaire archive maintenant `npm-audit-results.json`, un résumé des sévérités, et les dépendances **directes** concernées. Ce rapport est **diagnostique, non bloquant** ; il ne remplace pas les contrôles CodeQL et le merge gate existants.

**Instantané npm audit du 22/10/2026 (run 39732056909)** : **60 paquets signalés** (0 critique, 44 élevés, 13 modérés, 3 faibles), décompte incluant les dépendances de développement. Sans audit du lockfile initial effectué dans les mêmes conditions, **ne pas prétendre à une réduction de 19 à 16 vulnérabilités** : ces chiffres sont des avertissements *deprecated*, pas des CVE.

Les **9 dépendances directes vulnérables** signalées par npm sont :
- `@angular-devkit/build-angular`, `@angular/cli` (élevé) : bloquer toute *rétrogradation* suggérée par `npm audit fix` et traiter avec la migration Angular 22.
- `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` (élevé) : priorité aux mises à jour **compatibles Angular 21 + TypeScript 5.9** ; `fixAvailable: true` à vérifier dans le lockfile modifié.
- `electron-builder`, `electron-updater` (élevé) : changements de version majeurs proposés, à isoler dans une PR spécifique avec builds Linux/Windows et signature/update.
- `electron-settings` (élevé) : correctif indiqué comme disponible, à étudier en priorité en limitant le changement de version.
- `karma`, `protractor` (élevé) : dette des outils de test ; migration E2E/runner dédiée, sans retrait aveugle des cibles ni perte de couverture.

**Prudence :** l'outil `npm audit fix` peut proposer des **versions anciennes et inadaptées** (ex. Angular CLI 21.0.1 ou build-angular 0.1002.1, Karma 4, Protractor 3). Ne jamais exécuter `npm audit fix --force` ni accepter ces suggestions sans vérification des contraintes. Une alerte en dépendance de développement ne démontre pas, à elle seule, une exposition de l'application utilisateur.

### Prochain travail ciblé

1. Étudier `electron-settings` et `@typescript-eslint/*` (correctifs annoncés disponibles) avec `npm explain`, notes de version, résolution lockfile et tests ; ne pas modifier le moteur Ledger/RPC dans le même lot.
2. Préparer ESLint 9 (ou autre ligne maintenue compatible) et la migration *flat config* ; l'ESLint 8 actuel explique `@humanwhocodes/config-array/object-schema` dépréciés. Les dépendances peer des modules `@angular-eslint@21.4.0` acceptent ESLint 9, mais il faut adapter la config et recalculer le lockfile avant validation.
3. Réévaluer `request`, `glob`, `debug` et `node-gyp` par leurs parents, sans `overrides` risqués sur les modules natifs.
4. Après validation de la branche de nettoyage : revue/PR de fusion, puis intégration dans `upgrade/angular-22` existante en conservant les travaux Angular 22 déjà présents.

---

## Journal de migration — mise à jour du 22 octobre 2026

### Lot 1 — Plateforme Angular sans bootstrap dynamique

**Changement appliqué et validé en CI** (run du 22/10/2026) :

- `src/main.ts` : `platformBrowserDynamic()` remplacé par `platformBrowser()` depuis `@angular/platform-browser` ; maintien de `AppModule` et de `provideZoneChangeDetection()`.
- `src/test.ts` et `src/test-rpc.ts` : `BrowserDynamicTestingModule` / `platformBrowserDynamicTesting()` remplacés par `BrowserTestingModule` / `platformBrowserTesting()`, avec import explicite de `@angular/compiler` pour préserver le JIT des tests Karma.
- `package.json` et `package-lock.json` : suppression de la dépendance directe et des entrées dédiées à `@angular/platform-browser-dynamic@21.2.25`. Le lockfile version 2 a été synchronisé ; `npm ci` doit encore le confirmer.
- Commits du lot : [740f57b](https://github.com/twister65/Nault/commit/740f57b64fb84fabfa30070c06856431a2686fe6), [e9de47a](https://github.com/twister65/Nault/commit/e9de47a9b25f994797809d428200ac3bc8f59f25), [ed17326](https://github.com/twister65/Nault/commit/ed173261eb7c0a2cd70c791a63daa3000a74546d), [f721250](https://github.com/twister65/Nault/commit/f721250b0270d510eed227a334830b4115dc2f27), [6e5c1e1](https://github.com/twister65/Nault/commit/6e5c1e1957fd5962d4cff18b0e18b696767f65dc).

**Résultat observé :** `npm ci` et l'inventaire ont réussi : **19 → 18 avertissements npm distincts**, l'avertissement `@angular/platform-browser-dynamic` a disparu. [Inventaire CI, run 39709291547](https://github.com/twister65/Nault/actions/runs/39709291547).

**Validation observée :** [Angular 21, run 39709291508](https://github.com/twister65/Nault/actions/runs/39709291508) **success** : build production Web/PWA + manifeste, build Electron + compilation TypeScript, lint, **29 tests Ledger Web Bluetooth**, **31 tests RPC**, **98 tests Angular**. [Lint, run 39709291627](https://github.com/twister65/Nault/actions/runs/39709291627) et [CodeQL Advanced, run 39709291483](https://github.com/twister65/Nault/actions/runs/39709291483) : **success**.

**Lecture des résultats :** la base de référence initiale du rapport était 97/30 tests ; des commits de correctif `wallet.service` déjà présents sur la branche avant ce lot ont porté les suites à **98/31**. Ne pas attribuer ces tests supplémentaires au remplacement de `platform-browser-dynamic`. Aucune validation matérielle Ledger supplémentaire n'a été réalisée.

**État du lot 1 : VALIDÉ par les contrôles automatisés** ; validation manuelle multi-plateforme et fusion restant séparées.

**Conservation du périmètre :** aucun changement au moteur Ledger U2F/WebUSB/WebHID/BLE, ni à l'API RPC. À ce stade, le bootstrap NgModule est conservé ; la migration standalone n'est pas engagée.

### Lot 2 — Fin des dépendances directes Babel 6

**Changement appliqué et validé en CI le 22/10/2026 :**

1. Remplacement de `import 'babel-polyfill'` par `import 'core-js/stable'` dans `src/polyfills.ts` et `desktop-app/src/desktop-app.ts`. Le `core-js@3` existant est conservé ; les versions de Node, Electron et navigateurs cibles prennent en charge les générateurs modernes.
2. Suppression de `babel-polyfill@6.26.0` et `babel-runtime@6.26.0` des dépendances directes, avec synchronisation du lockfile (retrait de `core-js@2.6.11` et `regenerator-runtime` hérités). Aucune référence directe à ces packages dans le code après remplacement.
3. Un inventaire automatique des imports legacy a été ajouté au workflow d'audit ; le premier essai contenait une regex incorrectement échappée et a été corrigé dans [86cb17d](https://github.com/twister65/Nault/commit/86cb17d0723459ad97f50e99c79d1b2d50d97ce6), puis a relevé les deux imports Babel qui ont été remplacés.
4. **Régression détectée par la CI et corrigée :** au premier passage du lot, Karma ne démarrait pas (`ReferenceError: global is not defined`, run [39710402820](https://github.com/twister65/Nault/actions/runs/39710402820)). La ligne `global.Buffer` dépendait d'un alias global implicite. `src/polyfills.ts` initialise désormais explicitement `window.global = window` et `window.Buffer` sans accès préalable à un identifiant `global` inexistant ([d8d6ebd](https://github.com/twister65/Nault/commit/d8d6ebdf6442c7eb14b4ecebd9b0866bdee7534b)). Conserver cette protection pendant la migration du builder.
5. Commits principaux : [b0b540e](https://github.com/twister65/Nault/commit/b0b540ea17169e702ab005bac0fd32a5b8376ec2), [a8f2ea9](https://github.com/twister65/Nault/commit/a8f2ea90700fc0868e4cbd545fd6b56fb3c628ff), [d2c1507](https://github.com/twister65/Nault/commit/d2c1507ae94608046144da6ce408e551551ae6b9), [ee9a14d](https://github.com/twister65/Nault/commit/ee9a14d9621a0956dfa1a67c61cd72c74599f0a5), [d8d6ebd](https://github.com/twister65/Nault/commit/d8d6ebdf6442c7eb14b4ecebd9b0866bdee7534b).

**Résultat observé :** **19 → 17 noms de paquets dépréciés**, sans `@angular/platform-browser-dynamic` ni `core-js@2.6.11`. [Inventaire npm, run 39710932628](https://github.com/twister65/Nault/actions/runs/39710932628) : **success**, `npm ci` réussi, imports legacy référencés : **0**.

**Validation complète :** [run Angular 21 39710932651](https://github.com/twister65/Nault/actions/runs/39710932651) : **success**, build Web/PWA, build Electron/TS, lint, **98/98 tests Angular**, **31/31 tests RPC**, **29 tests Ledger BLE**. [Lint 39710932630](https://github.com/twister65/Nault/actions/runs/39710932630), [CodeQL Advanced 39710932621](https://github.com/twister65/Nault/actions/runs/39710932621), [Docker Hub 39710932620](https://github.com/twister65/Nault/actions/runs/39710932620) : **success**.

**État du lot 2 : VALIDÉ par la CI**. Les validations matérielles Linux/Windows/Chromebook/Android, Ledger Nano S Plus et Nano X restent à réaliser avant fusion ou publication.

### Prochains lots après cette étape

- Examiner le retrait de `@angular/animations` : aucun import direct n'a été trouvé par la recherche ciblée, mais vérifier les usages indirects des composants et bibliothèques Angular.
- Moderniser la chaîne ESLint 8 → version compatible avec Angular 22, sans imposer de mise à jour aveugle de packages transitifs.
- Évaluer `rxjs-compat`, `url/querystring` et les dépendances natives `node-gyp` ; tracer le parent réel avec `npm explain`.
- Conserver `@ledgerhq/hw-transport-u2f` tant que le fallback U2F dans `ledger.service.ts` n'a pas été remplacé et testé matériellement.
- Ensuite préparer **une branche Angular 22 dédiée**, Node `^22.22.3` / `^24.15.0` / `^26.0.0`, TypeScript `>=6.0 <6.1`, mise à niveau des composants ng-bootstrap/ZXing, migration et CI isolées.

---
### Préparation des lots suivants

Priorité : isoler `babel-polyfill` et `babel-runtime` (sources de `core-js@2`), après vérification des usages ; ne pas supprimer U2F car `src/app/services/ledger.service.ts` l'utilise encore comme fallback explicite. Vérifier les tests réels après chaque modification du lockfile.

---

## 1. Synthèse décisionnelle

L'exécution de référence du 21/10/2026 de `npm ci --legacy-peer-deps --no-audit --no-fund` sur la branche Angular 21 faisait apparaître **19 noms de paquets dépréciés** (le décompte correspond à des entrées uniques du journal d'installation, pas à 19 vulnérabilités ni à 19 dépendances directes). Quatre figurent dans le `package.json` de Nault : `@angular/animations`, `@angular/platform-browser-dynamic`, `@ledgerhq/hw-transport-u2f` et `eslint`. Les quinze autres sont transitives. Le lockfile v2 contient **2 008 entrées** dans `packages`, dont des versions imbriquées distinctes.

La base Angular 21 fonctionne : le run de validation du **21/10/2026** est vert, avec **97/97 tests Angular**, **30/30 tests RPC ciblés**, **29 tests Ledger Web Bluetooth**, lint, build Web/PWA, build Electron et compilation TypeScript réussis. Les tests automatisés ne remplacent pas les essais avec une véritable clé Ledger et les deux nœuds Nano/RsNano.

**Orientation recommandée :** corriger d'abord les blocages reproductibles, puis effectuer une migration Angular 22 sur **une nouvelle branche issue de la branche corrigée**, en conservant les changements Ledger/RPC séparés. Ne pas viser artificiellement « zéro avertissement » via des `overrides` globaux risquant de casser des dépendances historiques.

## 2. Sources vérifiables et méthode

- [GitHub Actions — inventaire npm, run 39529201308](https://github.com/twister65/Nault/actions/runs/39529201308) ; job `inventory` réussi, artifact `angular-21-deprecated-inventory` (ID 12314601934), fichier `deprecated-packages.txt` comportant **19 lignes**.
- [GitHub Actions — validation Angular 21, run 39529201309](https://github.com/twister65/Nault/actions/runs/39529201309) ; job `check` réussi.
- [GitHub Actions — lint, run 39529201327](https://github.com/twister65/Nault/actions/runs/39529201327) ; réussi.
- [package.json](https://github.com/twister65/Nault/blob/fix/angular-21-deprecated-dependencies/package.json), [package-lock.json](https://github.com/twister65/Nault/blob/fix/angular-21-deprecated-dependencies/package-lock.json), [angular.json](https://github.com/twister65/Nault/blob/fix/angular-21-deprecated-dependencies/angular.json), [src/main.ts](https://github.com/twister65/Nault/blob/fix/angular-21-deprecated-dependencies/src/main.ts), [src/polyfills.ts](https://github.com/twister65/Nault/blob/fix/angular-21-deprecated-dependencies/src/polyfills.ts).
- [Compatibilité officielle Angular](https://angular.dev/reference/versions), [guide de mise à jour](https://angular.dev/update-guide), [migration du builder](https://angular.dev/tools/cli/build-system-migration).

**Périmètre :** dépréciations npm constatées lors de l'installation et incompatibilités prévisibles pour Angular 22. **Hors périmètre :** un inventaire exhaustif des vulnérabilités CVE : `npm audit` doit être traité séparément. Une dépréciation n'est pas une preuve d'exploitabilité.

## 3. Inventaire des 19 dépendances dépréciées

### 3.1 Dépendances directes — 4

| Paquet installé | Constat audit | Correction envisagée | Priorité |
| --- | --- | --- | --- |
| `@angular/animations@21.2.25` | API/package déprécié | Inventorier modules/animations utilisés, migrer progressivement vers CSS et `animate.enter` / `animate.leave`; vérifier les bibliothèques tierces avant retrait | P1 |
| `@angular/platform-browser-dynamic@21.2.25` | Package déprécié | Le `src/main.ts` utilise `platformBrowserDynamic().bootstrapModule(AppModule)`. Évaluer `platformBrowser` depuis `@angular/platform-browser` et conserver l'amorçage NgModule si approprié ; tests AOT/JIT obligatoires | P1 |
| `@ledgerhq/hw-transport-u2f@5.34.0` | Transport U2F déprécié | Vérifier tous les appels et les éventuels fallbacks ; privilégier WebHID/WebUSB existants. **Ne supprimer qu'après tests Ledger USB et Web/BLE**, y compris Chromebook et Electron | P1, sécurité fonctionnelle |
| `eslint@8.57.1` | Version non prise en charge | Migrer configuration `.eslintrc.json` vers `eslint.config.*` (flat config) ; aligner `@angular-eslint` et `@typescript-eslint` avec Angular 22, préférer ESLint 10 si compatibilité vérifiée | P1 |

**Attention :** pour `@angular/animations`, des composants tiers peuvent encore exiger le module ; supprimer le package avant l'inventaire des usages provoquerait des régressions. Pour `@angular/platform-browser-dynamic`, vérifier le mode de compilation et éviter une refonte standalone hors scope.

### 3.2 Dépendances transitives — 15

| Paquet averti (version) | Filière/indice | Réponse proposée |
| --- | --- | --- |
| `@humanwhocodes/config-array@0.13.0` | Chaîne historique ESLint | Mettre à niveau la chaîne ESLint ; vérifier `npm explain` |
| `@humanwhocodes/object-schema@2.0.3` | Chaîne historique ESLint | Idem ; `@eslint/*` via dépendances maintenues |
| `@npmcli/move-file@2.0.1` | Ancienne dépendance outillage npm | Identifier le parent par `npm explain`, actualiser le parent |
| `are-we-there-yet@3.0.1` | Chaîne `node-gyp` / natifs | Mettre à niveau l'outil parent après vérification de la compilation native |
| `core-js@2.6.11` | **Confirmé dans le lockfile sous `babel-polyfill` et `babel-runtime`** | Retirer ces deux dépendances historiques **après** inventaire des imports/polyfills, ne garder que les polyfills réellement nécessaires |
| `debug@3.2.6` | Copie ancienne sous `https-proxy-agent` | Actualiser le parent, plutôt que forcer `debug` globalement |
| `gauge@4.0.4` | Chaîne native `node-gyp` | Moderniser le parent, reconstruire sur Electron |
| `glob@7.2.3` | Une chaîne constatée : `@ngneat/transloco → replace-in-file → glob` | Vérifier la version compatible de Transloco ; suivre autres parents |
| `glob@8.1.0` | Copie imbriquée sous `cacache` | Mettre à niveau la chaîne de cache/outillage |
| `har-validator@5.1.3` | Écosystème ancien de `request` | Rechercher et mettre à jour le parent responsable |
| `npmlog@6.0.2` | Chaîne `node-gyp` | Vérifier l'outillage de compilation natif |
| `querystring@0.2.0` | **Confirmé : dépendance de `url`** | Rechercher si `url` est encore requis ; migrer les appels vers WHATWG URL / `URLSearchParams` |
| `request@2.88.2` | HTTP legacy transitif | Identifier le parent, remplacer une bibliothèque non maintenue plutôt que forcer une résolution |
| `uuid@3.4.0` | Copie ancienne dans le lockfile | Identifier le parent, actualiser sans casser CJS/ESM |
| `uuid@8.3.2` | Copie sous `sockjs` | Examiner chaîne de dev-server ; laisser la CLI Angular traiter ses propres sous-dépendances |

**Méthode de remédiation :** `npm explain <paquet>` puis correction du **premier parent maintenu**. Une ligne de log peut désigner une version transitive même si le même paquet est aussi installé dans une version récente. Les chaînes indiquées comme « confirmées » ont été recoupées dans le lockfile ; les autres sont à confirmer avec `npm explain`.

### 3.3 Dette technique repérée mais **non comprise** dans ces 19 avertissements

- `babel-polyfill@6.26.0` et `babel-runtime@6.26.0` : présents en direct ; `src/polyfills.ts` contient `import 'babel-polyfill'`. Leur graphe introduit `core-js@2.6.11`. Vérifier les usages de `regenerator-runtime` avant suppression.
- `rxjs-compat@6.6.0` : couche de compatibilité à supprimer **seulement si** aucune ancienne forme d'import/opérateur n'est requise ; RxJS 6.5.3+ reste techniquement accepté par Angular 22.
- `protractor@7.0.0` : tests E2E anciens configurés dans `angular.json` et `protractor.conf.js`. Planifier migration vers Playwright (ou Cypress) sur une PR distincte ; l'existence du fichier n'atteste pas de tests E2E réellement exécutés par la CI actuelle.
- `karma-coverage-istanbul-reporter@3.0.3` et `jasmine-core@3.6.x` : réévaluer la stratégie couverture/tests. Préserver **d'abord** les 97 tests existants ; envisager `karma-coverage` ou un runner moderne dans une deuxième étape.
- `@ng-bootstrap/ng-bootstrap@11.0.0` : décalage majeur par rapport à Angular 21/22 ; la ligne **ng-bootstrap 21.x** cible Angular 22. Attention aux changements d'API et de comportement.
- `@zxing/ngx-scanner@3.4.0` : migration de bibliothèque nécessaire ; la série **22.x** vise Angular 22. Vérifier les contraintes TypeScript et les versions compatibles de `@zxing/browser` / `@zxing/library` avant toute installation.
- `ngx-clipboard@16.0.0`, `worker-loader@3.0.8`, `@ngneat/transloco@3.1.1`, `@types/node@12.x`, `ts-node@3.2.0` : revue de compatibilité ciblée requise ; ne pas déduire leur dépréciation du seul âge de version.
- Builder Webpack historique : `@angular-devkit/build-angular:browser` dans `angular.json` ; Angular 22 déprécie la voie Webpack au profit des builders esbuild/Vite de `@angular/build`. Une migration de builder est distincte de `ng update` et doit préserver Web, PWA, Electron et la gestion des polyfills Node.
- Le journal de l'inventaire montre aussi `DEP0169` (usage de `url.parse()`), **avertissement d'exécution Node** et non l'un des 19 `npm warn deprecated`. Identifier la bibliothèque responsable avant modification.

## 4. Exigences Angular 22 — blocages préalables

| Composant | Base actuelle vérifiée | Cible Angular 22 |
| --- | --- | --- |
| Angular | `21.2.25` pour le framework ; CLI/build `21.2.27` | Angular/CLI/build **22.x cohérents** |
| Node.js CI | `22.14.0` dans la validation Angular 21 | **`^22.22.3` ou `^24.15.0` ou `^26.0.0`** |
| TypeScript | `~5.9.3` | **`>=6.0.0 <6.1.0`** |
| RxJS | `^6.5.5` | `^6.5.3` **ou** `^7.4.0` |
| `@angular-eslint/*` | `21.4.0` | **22.x**, avec config ESLint plate adaptée |
| Bibliothèques Angular | ng-bootstrap 11, scanner 3.4 | Versions validées pour Angular 22, **sans `--force` systématique** |

Sources officielles : [matrice Angular](https://angular.dev/reference/versions), [Angular Update Guide](https://angular.dev/update-guide), [ng update](https://angular.dev/cli/update). Le minimum Node utilisé aujourd'hui est insuffisant pour Angular 22, même s'il passe les tests Angular 21.

À vérifier précisément : [ng-bootstrap 21.0.0](https://github.com/ng-bootstrap/ng-bootstrap/releases/tag/21.0.0), [ngx-scanner 22.x](https://www.npmjs.com/package/@zxing/ngx-scanner). La série `@zxing/ngx-scanner@22.0.0` a eu un conflit de *peer dependency* TypeScript ; ne pas fixer une version sans contrôle du manifeste publié : [issue #611](https://github.com/zxing-js/ngx-scanner/issues/611), [issue #613](https://github.com/zxing-js/ngx-scanner/issues/613).

## 5. Plan de remédiation recommandé (PR distinctes)

**Lot A — baseline et traçabilité (sans changement fonctionnel).**
1. Archiver les journaux `npm ci`, l'inventaire et les versions effectivement résolues.
2. Ajouter dans la procédure de revue `npm explain`, `npm ls`, `npm outdated` et `npm audit --json` (en gardant l'audit CVE indépendant).
3. Stabiliser les contrôles des endpoints RPC, de la PWA et des transports Ledger comme *merge gates*.

**Lot B — dépréciations à faible couplage.**
1. Réduire l'usage des vieux Babel polyfills après vérification des imports ; corriger le `core-js@2` transitif.
2. Auditer `url`/`querystring` et `rxjs-compat` ; supprimer si les usages réels le permettent.
3. Moderniser ESLint et passer à une config plate, avec adaptation mesurée des règles de linting.
4. Expliquer et traiter les transitives restantes par mise à jour de leurs parents (native/Electron et CLI séparées).

**Lot C — dépendances liées à Angular.**
1. Adapter `@ng-bootstrap/ng-bootstrap`, `@zxing/ngx-scanner` et les autres composants Angular.
2. Remplacer `platformBrowserDynamic` sans conversion forcée de toute l'app en standalone.
3. Migrer les animations legacy vers CSS/`animate.enter`/`animate.leave` dans une PR isolée si un composant tiers impose encore `@angular/animations`.

**Lot D — migration Angular 22.**
1. Créer une branche **nouvelle** depuis la branche nettoyée ; garder `master` et la release `v1.18.3` intacts.
2. Mettre à jour les runners et environnements locaux vers une version Node 22/24 compatible ; reconstruire les modules natifs si nécessaire.
3. Exécuter `npx ng update @angular/cli@^22 @angular/core@^22` depuis un arbre propre (committer avant la migration), puis aligner TypeScript 6 et les bibliothèques.
4. Mettre à jour le lockfile proprement, avec `npm install` et `npm ci`, sans `npm audit fix --force` ni `--legacy-peer-deps` comme mécanisme permanent de dissimulation des incompatibilités.
5. Tester l'ancien builder puis expérimenter esbuild/Vite dans un lot séparé. Le builder `application` exige des conversions (`main → browser`, tableaux `polyfills`, retrait de `vendorChunk`/`buildOptimizer`, `ngswConfigPath → serviceWorker`) : [documentation Angular](https://angular.dev/tools/cli/build-system-migration).
6. Traiter les E2E Protractor et la couverture Karma dans des PR dédiées, après stabilisation.

## 6. Plan de validation et critères d'acceptation

| Domaine | Minimum attendu | Risque surveillé |
| --- | --- | --- |
| Installation reproductible | `npm ci` sur Ubuntu CI et Chromebook ; lockfile commité ; inventaire des avertissements comparé à baseline | Résolution npm et modules natifs |
| Web / Vercel | Build production, accès routes, PWA, manifest `ngsw.json`, offline, absence d'erreurs CORS/SW | Régression builder ou service worker |
| Electron Linux / Windows | TypeScript `desktop:compile`, build desktop, lancement, reconnexion | ABI modules HID/USB et Electron |
| Ledger Nano S Plus | USB WebHID/WebUSB, autorisation, lecture d'adresse, déconnexion/reconnexion, signature manuelle | Régression protocole matériel |
| Ledger Nano X | Web Bluetooth, adresse, signature, reconnexion après GATT loss, priorité USB/BLE explicite | Perte de session/sécurité |
| Nano / RsNano | RPC `process` JSON, `accounts_pending`, `accounts_balances`, websocket confirmations | Solde, envoi, réception, confirmations |
| Angular | **Au moins 97/97** tests unitaires existants + tests nouveaux, 30 tests RPC ciblés, 29 tests Ledger BLE automatisés | Tests contournés ou supprimés |
| Sécurité | CodeQL Advanced v4 et audit de vulnérabilités ; pas d'augmentation des risques critiques non documentés | Dépendances de sécurité |
| Intégration | PR ciblées, CI verte, aucun changement involontaire de RPC/IPC, revue du diff | Couplages imprévus |

**Vérification manuelle obligatoire :** signer des transactions de test sur les environnements autorisés et vérifier sur Ledger **l'adresse, le montant, la destination et l'état final** ; ne pas utiliser de fonds significatifs pendant la validation d'une migration.

## 7. Commandes de vérification à conserver

```bash
# À exécuter sur la branche et le commit étudiés
node --version && npm --version
npm ci --legacy-peer-deps --no-audit --no-fund 2>&1 | tee npm-ci-audit.log
grep -Ei 'npm (warn|WARN) deprecated ' npm-ci-audit.log | sort -u

# Identifier le parent réel avant de modifier le lockfile
npm explain core-js
npm explain request
npm explain glob
npm explain @humanwhocodes/config-array
npm explain @ledgerhq/hw-transport-u2f
npm explain debug
npm ls --all --depth=2
npm outdated || true

# Audits distincts (ne pas confondre deprecated et CVE)
npm audit --json > npm-audit.json || true

# Reproduire les contrôles déjà intégrés dans Angular 21
npm run wallet:build
npm run desktop:build
npm run lint
node scripts/test-ledger-bluetooth.js
npm test -- --watch=false --browsers=ChromeHeadlessCI --progress=false
```

**Éviter :** `npm update` global sans revue, `npm audit fix --force`, `overrides` majeurs non testés, suppression immédiate de `@angular/animations`, retrait d'U2F sans chercher ses usages, mise à niveau Angular + Electron + RPC dans un seul commit.

## 8. Décisions et éléments restant à confirmer

- **Confirmé par audit :** 19 avertissements uniques `npm warn deprecated`, quatre dépendances directes correspondantes, CI Angular 21 verte, 97/97 + 30/30 + 29 tests réussis.
- **Confirmé par le lockfile :** présence de `core-js@2.6.11` sous `babel-polyfill` et `babel-runtime`, `querystring` sous `url`, `glob@7.2.3` via Transloco/replace-in-file ; outillage natif ancien cohabitant avec Electron 44.
- **À vérifier avant correctif :** usages exacts d'U2F, animations, RxJS compat et différents polyfills ; parents de toutes les copies transitives ; contraintes peer de chaque version cible ; compatibilité des modules HID/USB/BLE avec Node et Electron.
- **Non encore exécuté dans ce document :** remplacement de packages, nouvelle installation après changement de dépendance, migration Angular 22, validations matérielles sur Ledger et essais Android/APK.

## 9. Annexes — liste brute dédupliquée des avertissements npm

```text
@angular/animations@21.2.25
@angular/platform-browser-dynamic@21.2.25
@humanwhocodes/config-array@0.13.0
@humanwhocodes/object-schema@2.0.3
@ledgerhq/hw-transport-u2f@5.34.0
@npmcli/move-file@2.0.1
are-we-there-yet@3.0.1
core-js@2.6.11
debug@3.2.6
eslint@8.57.1
gauge@4.0.4
glob@7.2.3
glob@8.1.0
har-validator@5.1.3
npmlog@6.0.2
querystring@0.2.0
request@2.88.2
uuid@3.4.0
uuid@8.3.2
```

**Maintenance du document :** après chaque PR, indiquer son lien/commit, re-jouer l'inventaire, noter les dépréciations supprimées/apparues et réévaluer les risques avant de démarrer Angular 22.
