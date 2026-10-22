# Nault — Audit des dépendances dépréciées et préparation Angular 22

**Document de référence — 21 octobre 2026**  
**Dépôt :** [twister65/Nault](https://github.com/twister65/Nault)  
**Branche observée :** [fix/angular-21-deprecated-dependencies](https://github.com/twister65/Nault/tree/fix/angular-21-deprecated-dependencies)  
**Commit validé :** [b016183b91e0](https://github.com/twister65/Nault/commit/b016183b91e0bd336e86064ab1bdd77464812274)  
**Statut :** diagnostic et plan de correction ; **les remplacements proposés ne sont pas encore appliqués**.

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

**Validation :** [GitHub Actions Angular 21](https://github.com/twister65/Nault/actions/runs/39772956885) / autres jobs du commit `42b9a396` : vérifier leur conclusion avant de déclarer le lot validé. **Le correctif cible une course USB/HID → GATT ; son efficacité réelle sur la Nano X n'est pas confirmée tant que l'utilisateur n'a pas retesté son matériel.**

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
