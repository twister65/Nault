### Reconnexion : capacités physiques Nano S Plus vs Nano X, annulation BLE (27 octobre 2026)

**Retours matériels PWA ChromeOS** (capture 27 octobre, 08 h 01, version déployée `5e26e0d`) : la **Nano X configurée initialement par USB se reconnecte bien en Web Bluetooth**, sans réimportation. Cependant, si le portefeuille est configuré sur une **Nano S Plus USB**, l'interface propose également « Reconnecter en Bluetooth » parce qu'elle ne vérifie que `TransportBLE.isSupported()` côté **navigateur**, alors que **la Nano S Plus n'a pas de radio BLE**. Le clic sur « Reconnecter en Bluetooth » puis « Annuler » affiche l'avertissement **« Bluetooth selection cancelled »** en anglais ; une annulation volontaire du navigateur ne doit pas être traitée comme une erreur de connexion.

**Références matérielles Ledger :** identifiant fabricant USB `0x2c97` ; modèle Nano S Plus `0x50` ou variante `0x50xx`, Nano X `0x40` ou `0x40xx` selon l'interface USB ; `TransportWebUSB.deviceModel.id` permet également d'identifier `nanoSP` / `nanoX`. Documentation officielle : https://developers.ledger.com/docs/device-interaction/dmk-ts/references/identifiers.

**Correction (branche PR #27 uniquement, sans redéploiement ni fusion) :**

- `identifyLedgerUsbModel()` dans `ledger.service.ts` déduit le modèle à partir du `deviceModel.id` retourné par LedgerJS ou, à défaut, de l'identifiant USB fourni par le périphérique après autorisation du navigateur. Aucune supposition en cas de donnée absente, inconnue ou de bootloader non classé. `connectedDeviceModel` expose ce résultat sur le transport connecté ; en Bluetooth le modèle pris en charge pour le cas Nano X est reconnu.
- `WalletService` enregistre ce **simple indice non secret** `ledgerDeviceModel` (`nanoSPlus`, `nanoX`, `nanoS`, ou `null`) **avec le portefeuille enregistré**, lors de la configuration explicite de la Ledger. Relecture au démarrage, validation stricte des valeurs et suppression lors de `resetWallet()`. Ce champ sert uniquement à masquer un transport impossible ; il ne prouve pas l'identité cryptographique du portefeuille, dont la vérification reste liée aux adresses dérivées de la clé connectée.
- `WalletWidgetComponent.canReconnectBluetooth` ne propose plus la reconnexion BLE lorsque le portefeuille porte l'indication **Nano S Plus** ou **Nano S**. Il la conserve pour les **Nano X** et pour les anciens portefeuilles à modèle inconnu (compatibilité rétroactive). Les possibilités du navigateur ne suffisent donc plus seules.
- `loadWebBluetooth()` ignore silencieusement `TransportOpenUserCancelled` lorsqu'il s'agit du refus normal du sélecteur et renseigne `lastBluetoothSelectionCancelled`. La reconnexion **et la configuration explicite d'un nouveau portefeuille** ne produisent plus de toast trompeur après une annulation. Bluetooth indisponible et les erreurs réelles d'authentification/appairage demeurent signalés.
- Tests Jasmine pour détection USB, valeur inconnue, persistance/restauration du modèle, garde UI Nano S Plus, validation inter-modèles même seed, annulation silencieuse pendant le nouvel import et tests Node pour les descripteurs USB et la reconnexion annulée.

**Cas même seed / autre modèle :** `LedgerService.onVerifiedDeviceModel` notifie désormais `WalletService` **après une vérification d'adresse réussie**. Ainsi, si une Nano X USB partage la même seed que la Nano S Plus enregistrée, la reconnexion USB peut mettre à jour l'indication persistée vers `nanoX`, et une reconnexion Bluetooth sera alors proposée. Une clé avec d'autres adresses est refusée **avant** toute modification du modèle ; des tests Jasmine ciblés couvrent ces deux branches. Il n'est pas possible d'identifier à l'avance le modèle d'une Nano X non autorisée en USB ni de conclure que deux clés partagent la même seed sur leur seule référence commerciale.

**Distinction importante :** sur l'écran **« Configurer un nouveau portefeuille »**, Nault doit continuer à proposer une sélection Bluetooth si le **navigateur** la prend en charge, même si le portefeuille actuellement sauvegardé a été importé d'une Nano S Plus. Cette sélection peut servir à **importer une autre Ledger Nano X** ; l'ancien modèle ne permet pas de prédire celui d'une clé encore non sélectionnée. Masquer Bluetooth dans ce contexte ferait régresser le scénario précédemment corrigé Nano S Plus READY → importer Nano X. En revanche, en **reconnexion du portefeuille enregistré**, le dernier modèle effectivement importé peut guider l'affichage. Pour un ancien portefeuille sans métadonnées, l'app conserve les choix antérieurs afin de ne pas le rendre inaccessible. Pour passer d'une Nano S Plus enregistrée à une Nano X de même seed, effectuer d'abord une **reconnexion USB vérifiée** avec la Nano X : l'indication de modèle suivra la dernière clé dont les adresses ont été authentifiées. La reconnexion Bluetooth directe depuis une Nano S Plus sauvegardée reste masquée tant que la Nano X n'a pas été authentifiée.

**Tests attendus après validation CI et déploiement autorisé :** (1) nouveau portefeuille **Nano S Plus USB** → seul lien **Reconnexion USB** ; après fermeture/réouverture de la PWA même résultat ; (2) **Nano X USB** → deux liens USB et Bluetooth ; BT reconnecte la même adresse et le même solde ; (3) dans « Nouveau portefeuille », changement S Plus → Nano X BT toujours accessible et soumis à confirmation de remplacement ; (4) ouvrir le sélecteur BLE puis cliquer **Annuler** → aucun toast de faux échec ; (5) simuler adaptateur Bluetooth indisponible → vrai message d'erreur conservé. Aucune validation matérielle de ces *nouveaux* changements à ce stade.

### Correctif : reconnexion Nano X USB → Bluetooth sur PWA ChromeOS (27 octobre 2026)

**Régression reproduite visuellement par l'utilisateur** (capture PWA ChromeOS, 27 octobre à 06 h 57) : un nouveau portefeuille a été configuré depuis la **Ledger Nano X en USB**, avec des comptes et un solde corrects, puis la Ledger a été débranchée. La barre latérale « Ledger déconnectée » propose uniquement **« Reconnecter en USB »**, même lorsque le Chromebook est compatible Web Bluetooth. **L'utilisateur doit pouvoir reconnecter la même Nano X en Bluetooth sans importer ni remplacer le portefeuille.** La capture correspond au déploiement PWA `nault-android-test.vercel.app` précédent : le code de cette correction n'est pas encore déployé.

**Cause confirmée dans le code :** `wallet-widget.component.html` conditionnait explicitement l'affichage du choix Bluetooth supplémentaire à `ledgerService.isDesktop`. Dans `wallet-widget.component.ts`, `reconnectBluetooth()` et `reconnectUsb()` quittaient immédiatement lorsque `isDesktop === false`. Un précédent correctif du libellé de reconnexion ChromeOS PWA ne traitait que le **transport déjà sélectionné**, sans donner le choix de changer de transport pour le même portefeuille.

**Correctif isolé dans la PR #27 (toujours Draft) :**

- `WalletWidgetComponent` expose `canReconnectUsb` (`supportsUSB && !isAndroidWeb`) et `canReconnectBluetooth` (`supportsBluetooth`), indépendamment d'Electron. Les mêmes règles déterminent les liens visibles en état `NOT_CONNECTED` et `LOCKED`.
- `reconnectUsb()` et `reconnectBluetooth()` autorisent les PWAs compatibles ; conservent les comptes enregistrés et appellent `enableBluetoothMode(...)` puis `reloadLedger()`, **sans passer par `ConfigureWalletComponent`**. Les appels vers `TransportBLE.create` restent déclenchés par le geste de clic (pas de `await` supplémentaire en amont de la demande Bluetooth).
- Le service `LedgerService.verifyConnectedWallet()` continue de comparer la clé connectée avec l'adresse attendue à l'index enregistré. **Même seed : connexion autorisée ; seed différente : erreur de non-correspondance et refus de signature.** Ne pas contourner le contrôle d'identité pour faire réussir ce test.
- Sur Android Web, **USB reste interdit** ; le lien USB n'est pas exposé même si une capacité USB est signalée, tandis que Bluetooth reste disponible si pris en charge.
- Tests Jasmine ajoutés dans `wallet-widget.component.spec.ts` : disponibilité des deux modes sur ChromeOS, reconnexion du portefeuille USB en Bluetooth sans remplacement, retour Bluetooth en USB, restriction Android et garde contre un Bluetooth indisponible.

**Étapes de validation utilisateur après nouveau déploiement autorisé et READY :** sur Chromebook, configurer **Nano X en USB**, débrancher ; constater les liens **« Reconnecter en USB » ou « Reconnecter en Bluetooth »** ; activer Bluetooth sur la Nano X, cliquer Bluetooth, sélectionner la même clé et vérifier **« Ledger prête »**, mêmes comptes, mêmes adresses et soldes ; déconnecter, repasser en USB et revérifier les comptes. Si un appareil avec seed différente est choisi, la reconnexion doit être refusée. Tester également un portefeuille Nano S Plus configuré en USB (n'a pas de Bluetooth matériel) : une tentative de sélectionner une autre Nano X Bluetooth avec une autre seed doit toujours être rejetée. **Le test matériel de ce correctif n'est pas encore effectué** ; attendre réussite CI, autorisation et redéploiement du build de test. Aucune fusion vers `upgrade/angular-22` ni `master` sans accord explicite.

### Correctifs de traduction : dialogue Ledger et erreur de signature (26 octobre 2026, soir)

**Demande utilisateur :** corriger les traductions manquantes pendant la préparation des tests Electron (Linux/Windows prévus le 27 octobre ; Mac Intel prévu le 28 octobre si le package est réparable). Les modifications sont exclusivement sur `fix/ledger-pwa-usb-reconnect-label` (PR #27 Draft), sans fusion vers `upgrade/angular-22`/`master` ni déploiement Vercel.

**Cause et correction du bouton « CANCEL » :** `ConfigureWalletComponent.confirmWalletOverwrite()` passait `{ i18n: { ok, cancel } }` à `UIkit.modal.confirm`, alors que UIkit attend l'option `{ labels: { ok, cancel } }` (déjà utilisée ailleurs dans Nault pour les dialogues). Les clés `ui-wallet-setup.confirm-overwrite` et `general.cancel` restent déterminées par Transloco ; le test Jasmine `ledger-transport-switch.spec.ts` attend maintenant explicitement `Confirmer le remplacement` et `Annuler`. La fonctionnalité d'annulation avait déjà été validée sur matériel ; le *rendu des libellés traduits* doit être revérifié avec le nouveau build.

**Message « Ledger is not ready » en anglais :** le message brut provient de `LedgerNotReadyError` après une signature impossible. `localizeNotificationMessage()` (`src/app/services/notification-message.ts`) reconnaît maintenant cette variante, l'autre variante provenant de `handleUnavailableReceive()` et la variante « Ledger unavailable » ; elles sont traduites par la nouvelle clé `ui-notifications.ledger-not-ready` dans `en.json`, `fr.json`, `es.json`. Test Jasmine dédié à ces trois variantes dans `notification-message.spec.ts`, en conservant la traduction propre à l'erreur « mauvaise Ledger ». **Le traitement de l'erreur et la protection de signature ne sont pas modifiés.** Un second avertissement générique peut toujours suivre une erreur d'identité : éviter les doublons est un sujet d'UX distinct, non traité par ce correctif de traduction.

**Validation :** structure JSON des trois fichiers de langue contrôlée lors de l'édition ; tests automatisés et compilation à confirmer par la CI GitHub du dernier commit. Vérifier après redéploiement volontaire du build de test les textes français du dialogue et de l'avertissement sans régresser EN/ES. Les tests de sécurité et signatures déjà validés ont été réalisés sur le précédent déploiement applicatif `3701116` ; ils ne constituent pas encore une validation de ces derniers libellés.

### Validation matérielle — mauvaise Ledger bloquée avant la signature d'envoi (26 octobre 2026)

**Résultat utilisateur : OK pour les cinq étapes du test de sécurité, capture datée du 26 octobre 2026 à 21 h 59, réalisée dans la PWA ChromeOS de test** (version applicative déployée : `3701116`; les commits suivants sur PR #27 ne modifient que la documentation). Scénario : portefeuille **Nano S Plus** enregistré, débrancher la Nano S Plus puis brancher **Nano X en USB** et tenter une reconnexion sans importer ni configurer un nouveau portefeuille. Le testeur confirme **« 1,2,3,4,5 : OK. Il n'y a pas de demande de signature sur la clé »**.

**Constats sur la capture** : rubrique « Envoyer des Nano », compte source du portefeuille conservé, état de la barre latérale **« Ledger déconnectée »** ; avertissement principal **« La Ledger connectée ne correspond pas au portefeuille configuré. Pour utiliser cette clé, sélectionnez « Configurer un nouveau portefeuille » → « Utiliser Ledger ». »**. Le clic sur la confirmation d'un envoi n'a entraîné aucune invite de signature sur la Nano X, et l'utilisateur confirme qu'aucun envoi non autorisé n'a été réalisé. **Le contrôle d'identité fonctionne à l'étape de reconnexion et empêche la signature sur une clé différente dans ce test réel.** Aucun hash de transaction diffusée n'a été fourni, et la preuve centrale reste le compte-rendu matériel avec absence d'invite sur la mauvaise clé.

**Deux imperfections UX distinctes repérées sur la capture (à traiter sans toucher au garde-fou validé)** :

1. Un second avertissement générique est affiché en anglais : **« Ledger is not ready. Unlock your Ledger, open the Nano app, then click Reconnect. »** Ce message est trompeur quand la cause réelle du refus est une **mauvaise Ledger**, non une application Nano fermée ; la première alerte française doit rester prioritaire. Dans `src/app/services/ledger.service.ts`, `LedgerNotReadyError` contient ce texte littéral en anglais ; `requireReadyForSigning()` lève cette erreur si la tentative de connexion ne passe pas à `READY`. Prévoir traduction et non-redondance contextuelle, avec tests EN/FR/ES.
2. Le bouton **« CONFIRMER ET ENVOYER »** reste visuellement actif alors que la barre latérale affiche **« Ledger déconnectée »**. Dans `src/app/components/send/send.component.html`, la désactivation est liée à `confirmingTransaction` mais pas à `walletService.isLedgerWallet() && ledgerService.ledger.status !== READY`. La sécurité a bien bloqué la signature en aval ; envisager de bloquer ou désactiver l'action en amont et de guider vers la reconnexion correcte. Vérifier l'accessibilité et conserver une vérification défensive au niveau du service, quelle que soit l'UI.

**Statut de validation** : sécurité du refus de signature sur mauvaise Ledger **PASS** en USB ; imperfections de messages/UI non corrigées, à arbitrer avant fusion. La réception Nano X Bluetooth, les redémarrages/réassociations et les packages Electron restent des scénarios distincts non couverts par cette capture. PR #27 maintenue Draft ; aucun déploiement ni fusion autorisé par ce retour.

### Validation matérielle — Nano X Bluetooth : import, refus de signature et envoi confirmé (26 octobre 2026)

**Résultat utilisateur : OK pour le parcours Nano X via Bluetooth sur la PWA de test** (`nault-android-test.vercel.app`, dernière version applicative confirmée comme déployée : `3701116`).

- **Configuration et importation du portefeuille Nano X en Bluetooth : OK dès la première tentative**, message « Ledger Nano X chargée avec succès ».
- **Refus d'une transaction sur la Nano X : OK, sans déconnexion de la session Bluetooth.**
- **Nouvelle transaction confirmée sur la Nano X : OK**, avec réception effective sur l'autre compte contrôlé par l'utilisateur. Le test suit directement le refus, sans déconnexion signalée.

**Portée de la validation :** configuration initiale Bluetooth, refus de signature, maintien de la connexion et envoi signé effectivement reçu. Ce retour est une validation matérielle utilisateur, sans hash de transaction ni logs fournis ; ne pas extrapoler à un test de reconnexion Bluetooth après extinction, à un bloc de réception signé sur la Nano X, ni à une signature avec appareil différent. La Nano S Plus USB a été validée séparément pour envoi confirmé et réception. L'anomalie de traduction « CANCEL » reste ouverte ; tests d'identité à l'étape de signature et packaging Electron restent distincts. **PR #27 toujours Draft, pas de fusion ni de nouveau déploiement.**

### Validation matérielle — envoi confirmé et réception Nano S Plus USB (26 octobre 2026)

**Résultat utilisateur : tests 1 et 2 du dernier programme de validation = OK**, sur le portefeuille **Nano S Plus en USB** de la PWA `nault-android-test.vercel.app`, version applicative déployée `3701116` :

- **Envoi confirmé — OK :** l'utilisateur valide le scénario proposé comprenant le contrôle du montant et du destinataire sur l'écran de la Ledger, la confirmation matérielle et la diffusion de la transaction.
- **Réception — OK :** l'utilisateur valide le scénario proposé comprenant la signature du bloc de réception par la Ledger et l'actualisation du solde.

Le test de refus de signature et la reprise **sans déconnexion USB** avaient déjà été validés séparément. Il s'agit ici d'un retour de test utilisateur sur le parcours global, sans logs ni hash de transaction communiqués ; ne pas lui attribuer de vérifications supplémentaires non mentionnées.

**Les signatures de refus et d'acceptation sur Nano X Bluetooth ont depuis été validées (voir la section ci-dessus). Restent distincts et à valider :** signature impossible lorsqu'une autre clé est branchée, tests complets des packages Electron ; anomalie de traduction UIkit « CANCEL » non résolue. La PR #27 demeure Draft, sans autorisation de fusion ni nouvelle demande de déploiement.

### Validation matérielle — refus de signature et nouvelle tentative en USB (26 octobre 2026)

**Retour utilisateur : tests n° 1 et n° 4 de la grille de tests de signature du chat RÉUSSIS.** Dans le parcours de test **Nano S Plus connectée en USB**, l'utilisateur a testé le **refus d'une signature d'envoi sur l'appareil**, puis **une nouvelle tentative de signature sans reconnecter la Ledger**, et confirme explicitement : **« Pas de déconnexion de la clé »**. Le point de régression historique `0x6985` provoquant une déconnexion après refus ne s'est donc **pas reproduit durant ces essais**. Cette validation concerne le refus et la continuité de session USB ; elle ne démontre pas à elle seule la diffusion d'une transaction confirmée, la vérification du montant/destinataire sur l'écran de la Ledger, ni la réception signée.

**Attention à la numérotation :** « test 4 » désigne ici l'étape du tableau de la conversation **« Après un refus, refaire un envoi sans reconnecter la clé »** et **non** le point 4 de la liste documentaire ci-dessous (tests Nano X Bluetooth). Aucune validation de refus/signature Bluetooth Nano X n'est déduite de ce message.

**Toujours à valider explicitement :** envoi confirmé avec contrôle des détails sur l'appareil et de sa diffusion, bloc de réception signé et solde actualisé, refus/acceptation sur Nano X Bluetooth, et impossibilité de signer avec une Ledger différente. Le bouton UIkit « CANCEL » reste une anomalie de localisation EN/FR/ES en attente. PR #27 conservée Draft, pas de fusion ni redéploiement demandé.

### Validation matérielle — annulation du remplacement et programme de signatures (26 octobre 2026)

**Retour matériel utilisateur — annulation : OK.** Sur la PWA de test avec les Ledger Nano S Plus / Nano X, l'utilisateur confirme que **l'annulation du remplacement du portefeuille fonctionne** : l'ancien portefeuille est conservé. **Anomalie d'interface toujours visible** : le bouton de cette boîte de dialogue affiche encore « CANCEL » en anglais, même si `confirmWalletOverwrite()` fournit déjà à UIkit `i18n.cancel = translocoService.translate('general.cancel')`. Ne pas considérer la traduction validée ; analyser la version/API UIkit réellement utilisée à l'occasion d'un correctif ciblé. Ne pas mélanger ce problème mineur de libellé avec la réussite de l'annulation fonctionnelle.

**Tests matériels de signature à venir — non encore validés :**

1. Avec Nano S Plus USB, lancer un petit envoi vers un compte contrôlé et **refuser** la transaction sur la Ledger ; vérifier transaction non envoyée, message compréhensible, code Ledger `0x6985` éventuellement traité sans erreur technique visible, session USB toujours connectée.
2. Sans reconnecter la clé après le refus, refaire un petit envoi et cette fois **confirmer** ; contrôler sur l'écran matériel l'adresse de destination et le montant avant signature, puis la diffusion et le solde.
3. Recevoir sur ce portefeuille un très petit montant depuis un autre compte contrôlé ; contrôler la signature du bloc de réception et la mise à jour du solde.
4. Répéter le refus et la confirmation d'envoi avec Nano X **en Bluetooth** quand ce portefeuille est configuré et connecté par Bluetooth ; surveiller la persistance de session.
5. Vérifier que la signature est impossible si la Ledger physique connectée ne correspond pas aux comptes du portefeuille (contrôle d'identité déjà validé en reconnexion USB, mais pas encore en situation de signature).

Les essais doivent utiliser exclusivement de petites quantités de XNO, des adresses contrôlées par l'utilisateur et aucune seed ou clé privée divulguée. Les résultats de réception et d'envoi ne sont **pas** déduits des validations de configuration et de reconnexion précédentes. PR #27 maintenue Draft ; aucune fusion sans accord explicite.

### Validation matérielle — reconnexion USB avec contrôle d'identité Ledger (26 octobre 2026)

**Résultat utilisateur : OK.** Après configuration d'un portefeuille **Nano S Plus** dans la PWA, l'utilisateur a testé la **reconnexion via USB avec les deux clés physiques**, Nano S Plus et Nano X. La tentative avec une clé qui ne correspond pas au portefeuille enregistré a produit le message attendu : **« La Ledger connectée ne correspond pas au portefeuille connecté »**. La vérification d'identité avant de déclarer la session prête empêche ainsi une reconnexion sur une autre clé. **Il s'agit bien d'un test de reconnexion, sans remplacement du portefeuille ni importation de nouveaux comptes.**

**Précision importante :** l'option de **reconnexion Bluetooth** n'était plus proposée après la configuration du portefeuille Nano S Plus ; l'utilisateur confirme qu'il s'agit du comportement attendu dans ce scénario. Les deux appareils ont donc été testés **en USB**, y compris la Nano X, qui prend également en charge ce transport. Ne pas confondre cette vérification avec un test de reconnexion Bluetooth du portefeuille Nano X : ce dernier reste un parcours distinct.

**Environnement testé :** PWA `nault-android-test.vercel.app`, code applicatif déployé au commit `3701116` ; branche de travail `fix/ledger-pwa-usb-reconnect-label`, PR #27. **Validé :** rejet de la clé non correspondante sur reconnexion USB et cohérence de la disponibilité du choix de reconnexion. **Non établi par ce retour seul :** annulation d'un remplacement, absence de mutation en stockage inspectée directement, reconnexion du portefeuille Nano X en Bluetooth, réception/envoi/signature. La PR demeure Draft et ne doit pas être fusionnée sans validation et accord explicite.

### Validation matérielle — configuration Ledger USB → Bluetooth → USB (26 octobre 2026, 21 h 23)

**Résultat utilisateur : OK** sur la PWA `https://nault-android-test.vercel.app/`, commit déployé `3701116`, pour le parcours de **configuration d'un nouveau portefeuille** dans cet ordre : **Nano S Plus en USB → Nano X en Bluetooth → Nano S Plus en USB**. Cette validation confirme que la sélection d'un autre transport et l'importation d'un portefeuille ne sont plus bloquées par l'état `Ledger READY` d'une autre clé. La PR #27 contient le correctif qui garde les boutons USB/Bluetooth visibles pendant ce parcours. **Ce retour valide le scénario global déclaré par l'utilisateur ; il ne vaut pas confirmation séparée des adresses dérivées, de l'annulation du remplacement, des contrôles d'identité lors des reconnexions (validés séparément ci-dessus), de la réception ni de la signature d'envoi.** Ces vérifications restent à effectuer avant fusion.

**Statut :** validation fonctionnelle matérielle acquise pour le changement de portefeuille USB → Bluetooth → USB ; PR #27 toujours Draft, aucune fusion autorisée. Le déploiement de test demeure isolé de `master` et `upgrade/angular-22`.

### Bruit des notifications GitHub — workflow macOS sur PR #27 Draft (26 octobre 2026)

L'utilisateur reçoit plusieurs emails « Run failed: macOS Web Bluetooth test build - fix/ledger-pwa-usb-reconnect-label ». Diagnostic GitHub Actions : les anciennes exécutions macOS x64/arm64 (par exemple `40381628806`) échouaient sur le test logiciel `scripts/test-ledger-bluetooth.js`, qui assignait l'ancien champ `ledgerStatus` devenu un getter en lecture seule ; ce test a été réparé et les exécutions `40384092613` et `40386226820` ont ensuite réussi sur les deux architectures. La configuration `pull_request.paths` relançait quand même le workflow à chaque synchronisation, y compris après des modifications de documentation, puisque la PR contient déjà des fichiers Ledger correspondant aux filtres.

**Atténuation isolée dans la PR #27 :** `.github/workflows/macos-bluetooth.yml` conserve `workflow_dispatch` mais évite les compilations macOS automatiques lorsque `github.event.pull_request.draft` est vrai ; ajout du déclenchement `ready_for_review` pour réactiver les builds de validation quand la PR sera prête, et `concurrency.cancel-in-progress` pour remplacer les anciens runs par le dernier. Vérification : l'exécution `40391247041` du nouveau commit a conclu `skipped`, et non `failure`. Les vérifications Merge gate, lint et CodeQL ne sont pas désactivées. Les anciennes exécutions déjà en file d'attente ne sont pas forcément annulées par cette modification, puisqu'elles ont été créées avec la configuration antérieure. Revalider macOS x64/arm64 avant toute fusion.

### Cas d'usage Nano S Plus USB déjà prête → importer Nano X Bluetooth (26 octobre 2026, 20 h 40)

**Test réel utilisateur sur la PWA de test `nault-android-test`, commit `2640ca2` :** après connexion et configuration d'une Nano S Plus par USB, l'écran « Configurer un nouveau portefeuille → Utiliser Ledger » affiche correctement « Ledger connectée », mais **ne propose plus la sélection Bluetooth de la Nano X** ; seul le bouton « Actualiser l'état de la Ledger » reste visible. L'utilisateur ne peut donc pas importer une autre Ledger sans manipulations supplémentaires. Il s'agit d'un défaut d'interface indépendant d'Angular/Electron.

**Cause exacte :** `configure-wallet.component.html` n'affichait les actions `connectLedgerByUsb()` et `connectLedgerByBluetooth()` que sous la condition `ledger.status === NOT_CONNECTED` ; l'action `refreshLedgerStatus()` les remplaçait dès que le service retournait `READY`. Un appareil connecté n'est pas synonyme d'interdiction de configurer un nouveau portefeuille ; les fonctions de configuration et de reconnexion doivent rester distinctes.

**Correctif PR #27, à tester sur matériel :** sur l'écran de configuration uniquement, garder les boutons **Connecter en USB** et **Connecter en Bluetooth** visibles quel que soit l'état du périphérique (sous réserve du support navigateur/OS ; Android web continue à désactiver USB). Garder « Actualiser l'état de la Ledger » comme action secondaire lorsqu'une clé est prête. Ajouter une explication EN/FR/ES indiquant que le portefeuille précédent ne sera remplacé qu'après confirmation. Bloquer les boutons de sélection pendant une importation et empêcher les imports concurrents, afin qu'un deuxième clic ne ferme pas la session pendant la lecture des comptes.

La confirmation préalable à tout remplacement configuré et le contrôle d'identité des simples reconnexions restent obligatoires. Tests de non-régression : vérification de la disponibilité des deux actions à l'état READY, vérification de la protection contre une double importation et contre le changement de transport pendant le scan, traduction du message d'aide. **Ne pas fusionner ni redéployer sans nouvelle demande explicite ; PR toujours Draft.** Valider physiquement les séquences Nano S Plus (USB) → Nano X (Bluetooth) → Nano S Plus (USB), l'annulation et la correspondance d'adresse.

### Test ChromeOS PWA — premier import échoué, second réussi après changement de transport (26 octobre 2026, 20 h 15)

**Retour utilisateur :** après avoir alterné les transports **Bluetooth et USB** pour importer une Ledger dans « Configurer un nouveau portefeuille », le premier essai affiche « Impossible de changer de portefeuille Ledger. Le portefeuille précédent a été conservé. » ; l'écran affiche également un message anglais « Nano app is not open... », puis l'essai suivant aboutit (« Ledger chargée avec succès ! »). Ce test illustre un **échec intermittent**, pas un refus systématique du portefeuille ni la preuve que la Nano app était fermée.

**Défauts de code confirmés :**
- L'écran de configuration affichait directement le champ `bluetoothErrorMessage` même lorsque `transportMode` était repassé à USB. Cette information pouvait dater d'une précédente tentative Bluetooth et restait en anglais malgré les traductions Transloco des toasts. Le champ est désormais effacé lors de la sélection explicite d'un transport ; le message Bluetooth ne s'affiche que si ce transport est actif et passe par `localizeNotificationMessage()` pour les messages connus.
- Dans `LedgerService.loadLedger()`, si `getAppConfiguration()` réussissait mais que `getLedgerAccount(0)` échouait, la méthode pouvait tout de même **résoudre `true`**. Elle renvoie désormais `false` en cas d'impossibilité de lecture de l'adresse, diffuse le statut réel et conserve la distinction « Nano app absente / Ledger verrouillée / erreur de lecture ». Aucune tentative de signature ni remplacement de portefeuille ne doit découler de cet échec.
- Le parcours d'importation USB appelait `resetLedger()` une seconde fois juste après `enableBluetoothMode(false)` lors d'un passage Bluetooth → USB, alors que le changement de mode effectue déjà le reset. Ce deuxième reset superflu a été supprimé, sans modifier la réouverture explicite si l'utilisateur était déjà en USB. Le nettoyage des transports étant asynchrone, **la cause exacte de l'échec intermittent reste à confirmer par des logs matériels** avant de toucher au protocole BLE ou aux délais de sélection natifs.

En cas d'exception pendant le scan, le toast privilégie désormais le message localisé spécifique à l'application Nano indisponible ou à la clé verrouillée quand le code d'erreur permet de le déterminer ; les autres erreurs gardent l'avertissement général. Tests Jasmine supplémentaires pour la lecture USB infructueuse, l'ancien avertissement BLE, le reset de transport unique et l'état de connexion. **Aucun déploiement Vercel, aucune fusion GitHub** sans une nouvelle autorisation. La PR #27 reste Draft.

### Confirmation de l'origine du bouton « CANCEL » et réparation CI (26 octobre 2026)

L’utilisateur confirme que « CANCEL » provenait **du dialogue de confirmation du remplacement du portefeuille** de Nault/UIkit, et non du sélecteur natif USB de ChromeOS. La correction des options UIkit `i18n.ok`/`i18n.cancel` est donc directement applicable : « Confirmer le remplacement » et « Annuler » en français, avec équivalents EN/ES. Le correctif de la sélection USB annulée demeure indépendant.

La première CI du correctif (Merge gate `40381628731`) a échoué dans `scripts/test-ledger-bluetooth.js` : le harnais de tests affectait `walletWidget.ledgerStatus` alors que le correctif précédent de synchronisation du statut en avait fait un getter en lecture seule. Le harnais a été mis à jour pour simuler l'état partagé `ledgerService.ledger.status` et la dernière notification `lastReportedLedgerStatus` ; il conserve les scénarios de reconnexion native USB/Bluetooth et de reset manuel MTU. Nouvelle CI à vérifier. Pas de déploiement ni de fusion sans nouvelle autorisation.

### Annulation de la sélection USB et traduction « CANCEL » (26 octobre 2026)

**Retour utilisateur :** après « Connecter en USB », l’utilisateur a choisi « CANCEL » (encore en anglais). Deux interfaces peuvent apparaître successivement : (1) le sélecteur matériel WebUSB/WebHID de ChromeOS, dont le libellé appartient au navigateur et ne peut pas être traduit par Nault ; (2) le dialogue UIkit de Nault demandant confirmation avant de remplacer un portefeuille enregistré, dont les libellés « OK / CANCEL » étaient jusqu’ici en anglais.

**Corrections candidates PR #27 :** `confirmWalletOverwrite()` fournit à `UIkit.modal.confirm` les options `i18n.ok` et `i18n.cancel` issues de Transloco (nouvelle clé `ui-wallet-setup.confirm-overwrite`, clé existante `general.cancel`), ajoutées en EN/FR/ES. Une annulation volontaire du sélecteur WebUSB/WebHID (`TransportOpenUserCancelled`) est désormais distinguée d’un véritable échec du transport : elle laisse la configuration enregistrée intacte et n’émet pas le toast générique « connexion échouée ». Les erreurs de connexion réelles continuent de générer un avertissement. Tests Jasmine couvrant les libellés, l'annulation et les erreurs réelles.

**Limite importante :** Nault ne contrôle pas la langue des boutons natifs du navigateur ; si « CANCEL » est dans la fenêtre de sélection USB ChromeOS, sa traduction dépend de ChromeOS/Chrome. Vérifier sur matériel quelle interface a été présentée. Ce correctif n'est pas déployé ; ne fusionner ni déployer sans confirmation.

### Statuts Ledger contradictoires dans la PWA ChromeOS (26 octobre 2026, 19 h 41)

**Capture utilisateur sur `nault-android-test.vercel.app` (commit `c9c855f`) :** la barre latérale indiquait en vert « Ledger prête » alors que l'écran « Configurer le portefeuille → Utiliser Ledger » affichait en orange « Ledger non connectée », avec l'ancien solde de 19 XNO encore visible. **Cause identifiée dans le code :** le composant de configuration lit `ledgerService.ledger.status` directement, tandis que `WalletWidgetComponent` utilisait sa copie du dernier événement `ledgerStatus$`. Certains chemins (notamment `connectLedgerByUsb` et l'abandon d'une configuration) changent l'état partagé vers `NOT_CONNECTED` sans émettre cet événement, laissant la barre latérale afficher une valeur READY obsolète.

**Correctif isolé dans la PR #27, non encore déployé :** la barre latérale déduit son statut de la propriété vivante `ledgerService.ledger.status`, et n'affiche la description de l'événement que lorsqu'elle correspond encore à cet état. Les transitions USB de configuration et l'échec/l'annulation de l'import émettent désormais explicitement `ledgerStatus$` avec l'état non connecté. Tests Jasmine pour les événements obsolètes dans les deux sens, le reset USB et l'annulation. Ces changements ne modifient pas les routines de signature, ne configurent pas automatiquement un autre portefeuille et ne prouvent pas la disponibilité d'une Ledger physique. Contrôler la CI et tester la Nano S Plus sur Chromebook avant toute fusion. Préserver le domaine Vercel existant jusqu'à demande explicite de nouveau déploiement.

# Nault — Audit des dépendances dépréciées et préparation Angular 22

**Document de référence initial :** 21 octobre 2026 — **dernière mise à jour : 26 octobre 2026**
**Dépôt :** [twister65/Nault](https://github.com/twister65/Nault)  
**Branche de travail actuelle :** [`upgrade/angular-22`](https://github.com/twister65/Nault/tree/upgrade/angular-22)  
**Base de cette reprise :** [`eb9c778`](https://github.com/twister65/Nault/commit/eb9c778cf881f88b04a8af035a9c5e3696c0b2e1). Les corrections sont maintenant **publiées** dans [`ac374aa`](https://github.com/twister65/Nault/commit/ac374aa6821ab14b7d56be5ca1154b847b3678d3), après autorisation explicite de l’utilisateur le 23 octobre. Les résultats locaux ci-dessous restent distincts des résultats CI.
**Statut actuel (24 octobre 2026, après nettoyage et décision sur les tests) :** Angular 22 / TypeScript 6 / ESLint 10 avec Web/PWA et Electron compilables, **builder Angular esbuild/Vite**, Playwright à la place de Protractor, Electron Builder 26.18.0, tests automatisés Ledger et RPC, et **117/117 tests unitaires Angular réussis avec Karma + Jasmine au dernier code applicatif validé (solution conservée pour Angular 22 ; migration Vitest abandonnée pour cette version)**. Le contrôle CI bloque la réintroduction des dépendances dépréciées éliminées. **Deux warnings npm upstream subsistent** : `glob@7.2.3` et `boolean@3.2.0`, confinés à l'outillage de tests/packaging. La CI applicative a conclu **success** sur [#40083947910](https://github.com/twister65/Nault/actions/runs/40083947910), commit `583ca06`; CodeQL, Linting, synchronisation du lockfile aussi en succès. **Validations manuelles acquises sur ChromeOS** : PoW CPU et GPU WebGL, installation PWA, redémarrage hors ligne, reconnexion RPC/WebSocket. **Restent à valider** : mise à jour PWA inter-version, **signature d'envoi Ledger**, parcours Sweeper et sécurité S-01 (reportés séparément), Electron Windows réel (**VALIDÉ par l'utilisateur le 25 octobre 2026, voir état prioritaire ci-dessous**) et `Merge gate` de PR. **Ubuntu Electron, PoW, PWA hors ligne, Ledger Bluetooth, réception XNO déconnectée et génération/reset multisig sont validés manuellement** ; ne pas fusionner dans `master` avant le dernier gate et l'accord de l'utilisateur.

### Alerte avant remplacement d’un portefeuille déjà configuré (26 octobre 2026)

**Validation demandée par l’utilisateur :** lorsqu’on choisit « Configurer un nouveau portefeuille → Utiliser Ledger » et qu’un portefeuille est déjà configuré, une confirmation explicite doit être affichée **avant de remplacer les comptes existants**, que le portefeuille précédent soit logiciel **ou Ledger**. La configuration initiale sur une installation vierge ne doit pas afficher cette alerte.

**Correctif isolé dans la PR #27 :** suppression de l’exception `oldWalletIsLedger` dans `ConfigureWalletComponent.importLedgerWallet()`, avec réutilisation de `confirmWalletOverwrite()` pour tout portefeuille préexistant. Le dialogue Ledger est clarifié dans les dictionnaires EN/FR/ES : les comptes enregistrés seront remplacés par ceux de la clé actuellement connectée, **sans modifier les fonds ni les clés physiques**, et l’utilisateur peut annuler. La sélection du transport Bluetooth est conservée avant le dialogue, pour respecter le geste utilisateur du navigateur ; aucun compte n’est scanné ni sauvegardé en cas d’annulation. Les tests Jasmine couvrent le remplacement Ledger→Ledger confirmé, son annulation sans changement de données, l’absence de dialogue sur un portefeuille vierge et le contenu de l’avertissement.

**État :** CI et tests physiques à vérifier ; PR toujours Draft. Aucune fusion ni déploiement déclenché.

### Décision de comportement Ledger — configuration vs reconnexion (26 octobre 2026, état prioritaire)

**Consigne utilisateur confirmée :**
- **Configurer un nouveau portefeuille → Utiliser Ledger** : importer et afficher les comptes de la clé actuellement connectée. L'opération ne doit pas reprendre automatiquement les comptes de la Nano X enregistrée simplement parce que `wallet.type === 'ledger'`. Ne pas ajouter un deuxième bouton « Remplacer le portefeuille Ledger » ni un dialogue supplémentaire lorsqu'on remplace un portefeuille matériel par un autre.
- **Reconnecter** (volet latéral, USB/Bluetooth, Electron, sondage d'état) : lire une adresse au même index que l'un des comptes mémorisés et **refuser une clé différente**, en affichant « La Ledger connectée ne correspond pas au portefeuille configuré. » (Transloco EN/FR/ES). Ne jamais substituer silencieusement ses comptes au portefeuille enregistré.

**Implémentation candidate de la PR #27 :** `connectLedgerByUsb()` et `connectLedgerByBluetooth()` appellent désormais directement `importLedgerWallet()` en mode configuration sans `refreshOnly`. Ce parcours prépare les comptes de la Ledger avant l'activation, conserve le précédent portefeuille si la connexion ou l'importation échoue, exige un avertissement de sauvegarde seulement lorsqu'on remplace un *portefeuille logiciel* et ne laisse pas une session invalide marquée READY après erreur. Sur WebUSB/WebHID, la configuration explicite rouvre le transport ; en Bluetooth la sélection de la clé est relancée. Sans RPC disponible, l'adresse du compte 0 issue du matériel peut être importée mais la recherche des autres index déjà utilisés et les soldes devront attendre le retour du réseau.

Une vérification centralisée dans `LedgerService.verifyConnectedWallet()` utilise un fournisseur en lecture seule enregistré par `WalletService`, sans dépendance circulaire : elle est appliquée aux reconnexions USB et Web Bluetooth, aux statuts USB Electron et au polling. Le mode explicite `configuringWallet` est temporairement distinct, empêche la signature pendant le scan et ne doit pas déclencher de réception automatique à partir de l'ancien portefeuille. Les traductions et tests Jasmine correspondants sont ajoutés. Le code n'est **pas encore validé sur Nano S Plus ni redéployé**. La PR #27 reste Draft ; aucune fusion autorisée sans validation.

**Vérification Android indépendante :** `isAndroidWeb` détecte Android hors Electron ; `supportsUSB = !isAndroidWeb && (...WebUSB ou WebHID...)`, `enableBluetoothMode(false)` est bloqué sur Android, et `loadLedger()` refuse explicitement les transports non Bluetooth. **La restriction concerne Android, pas ChromeOS**. Le cas Android USB est couvert par un test Jasmine.

### Clarification du parcours « Configurer un nouveau portefeuille → Utiliser Ledger » (26 octobre 2026)

**Retour utilisateur corrigé :** l'utilisateur avait explicitement choisi « Configurer un nouveau portefeuille → Utiliser Ledger » sur la Nano S Plus, et non simplement cliqué sur « Reconnecter ». L'ancienne adresse Nano X persistait malgré cette démarche ; le défaut est donc **fonctionnel et confirmé dans le code**, et pas uniquement une explication insuffisante de l'interface.

**Cause exacte :** dans `configure-wallet.component.ts`, `connectLedgerByUsb()` et `connectLedgerByBluetooth()` transmettaient `walletService.isLedgerWallet()` directement comme argument `refreshOnly` à `importLedgerWallet()`. Pour un portefeuille Ledger préexistant, `refreshOnly=true` entraîne un `return` **avant la création/importation des comptes** ; les comptes enregistrés de la Nano X restent affichés même lors d'une nouvelle configuration avec Nano S Plus.

**Correction supplémentaire de la PR #27 :** après la connexion dans l'écran « Utiliser Ledger », si un portefeuille Ledger existe déjà, vérifier l'adresse réellement dérivée par le matériel, **au même index que l'une des adresses enregistrées**. Si elle correspond, conserver le portefeuille (cas d'un simple changement de transport sur la même graine). Si elle diffère, afficher le dialogue de remplacement explicite, puis préparer et vérifier les comptes de la nouvelle clé avant activation. Si la vérification échoue, que l'utilisateur annule ou que l'importation échoue, garder le portefeuille enregistré et **déconnecter la nouvelle session Ledger** pour ne pas laisser une clé différente considérée prête à signer pour les comptes précédents. Le bouton « Remplacer le portefeuille Ledger » reste disponible comme voie explicite. Tests Jasmine ajoutés pour clé identique, clé différente, refus et lecture d'adresse impossible.

**Validation attendue sur matériel :** départ Nano X enregistrée ; ouvrir configuration Ledger ; brancher Nano S Plus, lancer l'app Nano et choisir USB ; attendre la confirmation de remplacement après détection de la différence d'adresse ; confirmer ; contrôler les comptes/adresses dérivés de la Nano S Plus et les soldes RPC après connexion au réseau. Retester la même clé en USB/Bluetooth sans changement de comptes, puis un refus de remplacement. Le code et les tests de cette reprise n'ont pas encore été déployés sur Vercel ; **ne pas fusionner dans `master` ou `upgrade/angular-22` sans validation**.

### Test Nano S Plus — toast de disponibilité et changement de clé (26 octobre 2026)

**Retour utilisateur ChromeOS :** après déploiement du correctif de libellé USB sur `nault-android-test` (commit `904f85f`), l’utilisateur confirme que « Reconnecter en USB » est correctement affiché. Il découvre en revanche le toast anglais « Nano app is not open on your Ledger. Open the Nano app, then click Reconnect. » lors de la configuration de la Nano S Plus, et constate que le solde précédent de **19 XNO** (Nano X) reste affiché. **Diagnostic :** `connectLedgerByUsb()` / `connectLedgerByBluetooth()` déclenchent intentionnellement `importLedgerWallet(true)` lorsqu’un portefeuille Ledger existe déjà : changer de transport n’implique pas de changement de clé. Le menu « Configurer un portefeuille » ne comportait donc pas d’action explicite pour remplacer les comptes d’une Ledger différente. Le maintien des 19 XNO désigne l’ancienne configuration, **pas le solde vérifié de la Nano S Plus**.

**Correctifs candidats, non encore validés sur matériel :** traduction du toast de Nano app non ouverte et du message Ledger verrouillée via `localizeNotificationMessage()` et les dictionnaires EN/FR/ES ; note explicite dans l’écran de configuration indiquant que le solde correspond à l’ancienne clé ; nouvelle action distincte « Remplacer le portefeuille Ledger », uniquement lorsque la clé est prête, avec confirmation et scan des comptes préparé **avant** la modification du portefeuille. Le scan RPC doit réussir ; toute annulation, déconnexion, panne RPC ou changement de Ledger en cours de scan doit conserver le portefeuille précédent. En cas d’échec exceptionnel lors de la sauvegarde finale, restaurer les comptes persistés. Tests Jasmine ajoutés pour les annulations, pannes RPC et contrôle d’identité. Ne jamais remplacer automatiquement les comptes en cliquant simplement sur « Connecter en USB ».

**Reste à faire :** valider CI/merge gate, tester le toast en FR sur Chromebook et l’import explicite d’une Nano S Plus avec l’application Nano ouverte, vérifier l’adresse importée et son solde avant toute transaction ; tester également la reconnexion de la Nano X et la conservation des comptes si l’application Nano est fermée. **Aucun nouveau déploiement Vercel ni fusion vers `upgrade/angular-22` ou `master` n’est autorisé par ce retour.**

### Correctif en cours — PWA ChromeOS, Ledger Nano S Plus en USB (26 octobre 2026)

**Observation utilisateur, non encore revalidée :** démarrage de la PWA Nault sur Chromebook sans Wi-Fi, avec un portefeuille Ledger Nano S Plus préconfiguré en USB. Le volet latéral affiche à tort « Ledger déconnectée — Reconnecter en Bluetooth » au lieu de proposer l'USB. La Nano S Plus ne dispose pas de Bluetooth. Les alertes RPC et de prix visibles simultanément sont attendues en l'absence de réseau et ne prouvent pas une défaillance USB.

**Cause confirmée dans le code :** `wallet-widget.component.html` choisit le libellé de reconnexion avec `isDesktop`, ce qui classe indûment toutes les PWA en Bluetooth. Le clic `reloadLedger()` respecte déjà `ledgerService.transportMode` (USB, HID ou Bluetooth) ; le texte et l'action ne correspondaient pas. Le même défaut touche l'état « Ledger verrouillée ».

**Correctif isolé :** branche [`fix/ledger-pwa-usb-reconnect-label`](https://github.com/twister65/Nault/tree/fix/ledger-pwa-usb-reconnect-label), issue de `upgrade/angular-22` (base `3001789`). Le libellé suit désormais le transport actif ; USB et WebHID affichent « Reconnecter en USB », Bluetooth affiche « Reconnecter en Bluetooth ». Le texte « ou » passe par Transloco pour le français, l'espagnol et l'anglais. Aucun changement au RPC, au portefeuille, à la signature Ledger ou à la logique de reconnexion réseau. Des tests Jasmine couvrent la PWA USB, WebHID, Bluetooth et la conservation du transport au clic. **CI et validation physique Chromebook en attente** ; aucune fusion ni aucun déploiement effectué.

**Traduction du toast de prix hors connexion (26 octobre 2026) :** la capture ChromeOS montrait également l'avertissement persistant en anglais « There was an issue retrieving latest nano price. Ensure your AdBlocker is disabled… ». Son origine est le `catch` de `app.component.ts` lors de l'échec de récupération du cours Nano (p. ex. au démarrage hors Wi-Fi). La traduction passe désormais par `localizeNotificationMessage()` et la clé `ui-notifications.nano-price-unavailable` des dictionnaires `en.json`, `fr.json` et `es.json`, plutôt que par du français codé en dur. Le français mentionne à juste titre le réseau ou un éventuel bloqueur de publicités. L'identifiant `price-adblock` et la durée persistante sont conservés ; le chargement asynchrone du dictionnaire retraduit le toast déjà affiché, couvert par Jasmine. **Le correctif n'améliore pas encore la relance automatique de la récupération du prix après le retour du Wi-Fi**, qui reste distincte de la reprise RPC/soldes. Tester l'affichage FR hors ligne et EN/ES, ainsi que la persistance de l'alerte.

**Vérification matérielle demandée :** redémarrer la PWA hors Wi-Fi avec la Nano S Plus configurée en USB ; contrôler l'affichage « Reconnecter en USB » ; déverrouiller la clé, ouvrir l'application Nano et cliquer pour reconnecter même sans Wi-Fi ; réactiver ensuite le Wi-Fi et vérifier séparément la reprise RPC et les soldes. Contrôler également le comportement de la Nano X en Bluetooth pour prévenir toute régression.

### Validation matérielle PWA Android — démarrage hors ligne, reprise Wi-Fi et notifications FR (26 octobre 2026)

**Statut : VALIDÉ MANUELLEMENT SUR TABLETTE ANDROID par l’utilisateur le 26 octobre 2026, après déploiement de la branche `upgrade/angular-22` au commit [`ef087bc`](https://github.com/twister65/Nault/commit/ef087bc8097c35fa81fcd00a6ef2d7a0471e0531).** Scénario : démarrer la PWA Nault avec le **mode avion activé**, observer les alertes sans RPC disponible, puis **désactiver le mode avion et rétablir le Wi-Fi sans fermer la PWA**. Résultat rapporté : les deux alertes disparaissent à la reconnexion et **le solde du compte s'actualise automatiquement** ; le défaut initial de rafraîchissement après démarrage hors ligne est corrigé pour ce matériel et ce scénario. La capture de 03 h 11 montre à l'état hors ligne les deux notifications correctement traduites en français : « Impossible de se connecter au nœud Nano. Les soldes affichés peuvent être inexacts ! » (rouge) et « Impossible d’actualiser les soldes. Vérifiez votre connexion. » (orange). Le solde provisoire `0 XNO` pendant la déconnexion **n'est pas une lecture RPC validée**. Le test ne démontre pas à lui seul la réception d'une transaction pendant la coupure ni la couverture de tous les appareils et langues.

**Correctifs intégrés dans cette séquence :** reprise des rafraîchissements RPC simultanés dans `wallet.service.ts` (promesse partagée, actualisation supplémentaire regroupée, prévention d'un blocage lié à la réception) ; remise à zéro des états de chargement et nouvel essai de l'historique du compte dans `account-details.component.ts` ; vérification de reprise avec l'action de lecture `accounts_balances` plutôt que `block_count` (ce dernier peut être interdit par une whitelist RPC) ; conservation et re-traduction des notifications existantes une fois le dictionnaire Transloco chargé de façon asynchrone. **Les textes de production proviennent de `src/assets/i18n/en.json`, `fr.json` et `es.json`**, via `ui-notifications.node-offline` et `ui-notifications.refresh-balance-failed` ; les chaînes françaises inscrites dans le test Jasmine `notifications.component.spec.ts` sont uniquement des **valeurs attendues du simulateur**, pas des traductions en dur dans le code de production. Le dictionnaire espagnol existe mais **aucune validation matérielle en espagnol n'a été rapportée**. Les doublons introduits par des éditions concurrentes autour de [`5e7a194`](https://github.com/twister65/Nault/commit/5e7a194bdaa787d52d11d44b26a01eefd8565eb6) ont été retirés par [`e73942b`](https://github.com/twister65/Nault/commit/e73942b6a0c1134c4bdb7dae9a948f9e35c0f0a5). Ne pas réintroduire un second `balanceRefreshSub`.

**CI du commit applicatif `ef087bc` :** [Validate Angular 22 #40256700581](https://github.com/twister65/Nault/actions/runs/40256700581) **SUCCESS** ; [Merge gate #40256700657](https://github.com/twister65/Nault/actions/runs/40256700657) **SUCCESS** ; Docker Hub, Linting, Electron App Release et macOS Web Bluetooth test build également **SUCCESS**. Ces résultats concernent précisément le commit applicatif cité et précèdent le présent commit de documentation. Les précédents échecs de CI (erreur TypeScript `TS2300`, tests Jasmine sur `reloadBalances` et simulations anciennes `blockCount`) sont corrigés. **Aucun changement Apache/ModSecurity ni nouveau diagnostic CORS requis** : le test concerne la PWA, et la configuration RsNano avait déjà été corrigée séparément.

**Suites et limites :** conserver `master` et Vercel inchangés ; **aucune fusion de la PR #25 sans accord explicite**. Les essais MacBook Air Intel, les questions de sécurité S-01, Sweeper et signature multisig complète restent des sujets distincts. **Les paragraphes du 25 octobre sur la reprise PWA « à valider » et sur `block_count` décrivent des états historiques désormais remplacés par cette validation du 26 octobre.**

### Validation Android Angular 22 — réception, envoi et traductions (25 octobre 2026)

**Retour matériel sur tablette Android, build `773d87c` :** mise à jour de la PWA avec service worker sans réinstallation et reprise automatique du RPC RsNano après passage en mode avion **validées**. Affichage portrait/paysage, disparition de la barre verticale, chargement en français hors ligne **validés**. Calcul PoW local CPU et GPU WebGL sans erreur visible, GPU pouvant provoquer des saccades temporaires puis retrouver sa fluidité ; **preuve de travail effective non vérifiée dans les journaux**. PoW serveur RsNano sans erreur visible. Notifications entrantes et pastille « NOUVEAU » observées avec Ledger Nano X déconnectée, puis **réception signée de 1 XNO** après reconnexion Bluetooth (solde de 19 à 20 XNO). Deux cycles de désactivation/réactivation Bluetooth sur la Ledger ont réussi sans « Clear session ». **Envoi signé de 1 XNO** validé, solde revenu à 19 XNO, notification « 1 XNO envoyés avec succès ! ». Le message de suivi « Tracked address Natrium can now receive 1 XNO » confirme une notification reçue pour une adresse suivie (lien de compte cliquable).

**Petite correction i18n proposée suite aux captures :** traduire le toast « Incoming XNO is waiting. Unlock your Ledger ... » et les messages dynamiques d'adresses suivies (en attente, envoyé, reçu, changement de représentant) en français et en espagnol, tout en gardant les liens HTML et les quantités via `localizeNotificationMessage()`. Ajouter des tests Jasmine de ces messages, sans modification de la signature, du RPC ni des WebSockets. À revalider sur PWA mise à jour avant fusion. **Observation distincte :** « Représentant inconnu — 0,00 % » reste à analyser ; ne bloque pas les transactions.

**Statut CI du build `773d87c` :** [Validate Angular 22 #40209023840](https://github.com/twister65/Nault/actions/runs/40209023840) et [Merge gate #40209024020](https://github.com/twister65/Nault/actions/runs/40209024020) en **success** (128 tests Jasmine). Ces contrôles précèdent la correction i18n de ce paragraphe, qui requiert sa propre CI.

### RC PWA Android — reprise réseau après mode avion (25 octobre 2026)

**Retour matériel tablette :** Nault Angular 22 est déployé sur le VirtualHost Apache HTTPS `twister32.changeip.org`. L'installation de la PWA, la sélection automatique du français, le chargement hors ligne, la suppression de la barre verticale CSS et les statistiques RsNano après correction CORS sont **validés manuellement**. **Défaut découvert :** après désactivation du mode avion, la notification rouge « Unable to connect to the nano node, your balances may be inaccurate! » reste affichée tant qu'aucune lecture RPC n'est provoquée manuellement (actualisation des statistiques).

**Correctif candidat :** l'application écoute `window:online` et le retour visible de la PWA, effectue une lecture RPC en lecture seule (actualisation des soldes si portefeuille configuré ; `block_count` sinon), rétablit WebSocket avec `forceReconnect()` après réussite du RPC et retente au plus cinq fois avec délai progressif en cas d'échec. L'alerte n'est effacée que par la réussite réelle d'un RPC via `NodeService.setOnline()`; aucune transaction n'est réémise automatiquement par le mécanisme de reprise. Ajout de la traduction EN/FR/ES du toast persistant et de tests Jasmine du retour réseau, de la temporisation et du mode hors ligne explicite.

**À valider après CI :** reconstruire le web sur Ubuntu-Salon, publier le nouveau `dist/` dans un répertoire de release Apache, puis sur tablette PWA : mode avion → Wi-Fi réactivé → disparition de l'alerte et reconnexion RPC **sans actualisation manuelle**, rétablissement WebSocket/notifications et absence de boucles de requêtes. Contrôler aussi les comptes vides et le mode « Offline Mode » explicite. Pas de fusion `master` ni de déploiement Vercel.

### Pré-fusion RC — tests Ledger confirmés et builds macOS x64/arm64 (25 octobre 2026)

**Validation matérielle transmise par l'utilisateur :** le correctif [`9fb842d`](https://github.com/twister65/Nault/commit/9fb842d5397113f531da19c43a17d6b2d1f415ee) a été testé sur une vraie Ledger USB lors d'un refus de signature `0x6985`. Résultat rapporté : **fonctionnement parfait, plus de déconnexion USB**. Ce retour confirme le comportement essentiel recherché ; une signature ultérieure approuvée sur la même session n'a pas été détaillée explicitement. Le test automatique simule cette succession. La tête [`5527405`](https://github.com/twister65/Nault/commit/5527405c5ea52d0694ae501a7ec043ab43ce74eb) n'ajoute que ce document après `9fb842d`, sans nouvelle modification du code applicatif.

**CI au SHA `5527405` :** [Angular 22 validation #40185641871](https://github.com/twister65/Nault/actions/runs/40185641871) et [Merge gate #40185641885](https://github.com/twister65/Nault/actions/runs/40185641885) **SUCCESS**. L'audit npm du gate rapporte **14 vulnérabilités : 0 critique, 12 élevées, 1 moyenne, 1 faible**. Ce résultat n'est pas identique au nombre d'alertes Dependabot sur la branche par défaut `master` (dernier export connu : 82 alertes). Les deux alertes critiques liées à CryptoJS sont corrigées dans le lockfile Angular 22 ; des vulnérabilités non critiques, notamment l'ancien `electron-updater@4.3.5`, restent à examiner. Dependabot devra être réévalué après intégration sur `master`, sans présumer que toutes les alertes disparaîtront.

**Packages macOS candidats disponibles, sans signature ni notarisation :** [macOS Web Bluetooth test build #40185641865](https://github.com/twister65/Nault/actions/runs/40185641865) **SUCCESS** sur Intel `x64` (`Nault-WebBluetooth-macOS-x64`) et Apple Silicon `arm64` (`Nault-WebBluetooth-macOS-arm64`), avec tests de dépendances natives et régression BLE sans matériel. Artifacts de test conservés jusqu'au **8 novembre 2026**. Ces ZIP sont distincts des DMG de la Release ; le workflow `Electron App Release` ne package encore que macOS Intel.

**Dernières conditions d'acceptation :** essais manuels sur MacBook Air Intel après réparation, retour sur les points UI/PWA/tablette de la checklist PR #25, revue explicite des risques résiduels dont **S-01** et dépendances élevées, puis accord formel de fusion. Le Sweeper, la signature multisig complète, l'extension de signature et les traductions Options avancées restent des chantiers séparés ; ne pas les présenter comme testés. **Aucune fusion dans `master`, aucune publication de release ni aucun déploiement Vercel sans instruction explicite.**

### Localisation des notifications Ledger/Bluetooth/réception — 25 octobre 2026

L'utilisateur confirme « Ledger chargé avec succès ! », la correction CSS de la carte « Nouveau portefeuille », le test de générateur de clés, ainsi que l'import BIP39 public avec et sans passphrase. Quatre messages internes restaient en anglais malgré les 727 traductions FR/ES : « Bluetooth unavailable. Check Bluetooth on your computer and Ledger, or choose Reconnect via USB. », « Waiting for confirmation on Ledger Device... », « Error signing block: Ledger HID read timed out », « Successfully received 1 XNO! ». Les sources sont `ledger.service.ts` (gestion Bluetooth et erreurs HID), `nano-block.service.ts` (attente de confirmation) et `wallet.service.ts` (réception automatique).

Commit [`c89aa28`](https://github.com/twister65/Nault/commit/c89aa28b44fa5a495c9d5a294bd9a552b7d5c4a2) : six clés dans `ui-notifications` EN/FR/ES (soit **733** par langue) ; la fonction pure `localizeNotificationMessage` et sa suite Jasmine traduisent ces messages au point d'affichage dans `NotificationsComponent`. Les montants XNO conservent leurs chiffres, et les autres erreurs techniques inconnues restent visibles ; le statut Ledger interne, les notifications identifiées, le protocole de signature, les RPC et la logique de réception ne sont pas modifiés. **Ne pas traduire la couche transport en masquant les codes d'erreur.** La localisation concerne ici les *notifications* : les autres libellés de statut ou de services éventuellement encore en anglais devront être recensés séparément.

Contrôles CI de ce correctif : [Angular 22 #40182895763](https://github.com/twister65/Nault/actions/runs/40182895763), [Merge gate #40182895745](https://github.com/twister65/Nault/actions/runs/40182895745). **Exécutions à valider** au moment de la mise à jour du document. Conserver la validation manuelle de ces quatre messages à effectuer sur Linux/Windows avec le nouveau binaire. Options avancées toujours hors périmètre de traduction de la RC.

La surveillance des versions officielles d'Electron a été reprogrammée **tous les jours à 9 h, heure de Paris** à la demande de l'utilisateur ; à ce stade elle n'avait encore jamais tourné et les notifications des tâches étaient désactivées : l'utilisateur doit activer ce réglage pour recevoir les alertes.

**Aucune fusion dans `master` et aucun déploiement Vercel.** `vercel.json` maintient `git.deploymentEnabled["upgrade/angular-22"] = false`.

### Correctif USB Ledger — refus de transaction 0x6985 (25 octobre 2026)

**Validation matérielle confirmée ultérieurement pour le maintien de la connexion (voir état de pré-fusion ci-dessus).** L'utilisateur avait testé [Electron App Release #40183079742](https://github.com/twister65/Nault/actions/runs/40183079742), SHA `ce20fa6`, sur Ledger USB : « Confirmer et envoyer » puis refuser la transaction sur la clé provoquait le toast « Erreur lors de la signature du bloc : Ledger device: Condition of use not satisfied (denied by the user?) (0x6985) » et une déconnexion USB involontaire.

**Cause racine dans `desktop-app/src/lib/ledger.ts` :** `signBlock()` effectuait `resetLedger()` dans tous les cas d'échec, fermant le worker HID et déclarant `NOT_CONNECTED` même pour le code APDU **`0x6985` (refus de l'utilisateur)**. `getLedgerAccount()` distinguait déjà ce cas, mais `signBlock()` et `cacheBlock()` non. La version [`9fb842d`](https://github.com/twister65/Nault/commit/9fb842d5397113f531da19c43a17d6b2d1f415ee) unifie la détection du code (`statusCode` numérique ou `0x6985` dans le message), émet la réponse d'échec IPC sans déconnexion lors d'un refus, et conserve la remise à zéro en cas de **véritable erreur HID**, dont un timeout. Aucune transaction n'est automatiquement renvoyée à la Ledger après un refus.

**Traductions :** la fonction `localizeNotificationMessage()` reconnaît désormais les refus de signature ou de mise en cache `0x6985` et les messages directs « Transaction denied on Ledger device » ; toast français dédié **« Transaction refusée sur la Ledger (0x6985). »** ; clés EN/FR/ES alignées. Les erreurs techniques inconnues restent affichées sans masquer leur diagnostic.

**Régressions automatisées :** test de transport USB simulé dans `scripts/test-ledger-bluetooth.js` vérifiant que (1) le refus d'une signature est renvoyé au renderer, (2) le transport HID reste ouvert et `READY`, (3) un refus lors de `cacheBlock()` garde aussi la connexion, (4) une signature suivante réussit sur le **même** transport, (5) un vrai timeout HID provoque toujours une fermeture. Des tests Jasmine contrôlent les variantes de traduction. [Angular 22 #40185453383](https://github.com/twister65/Nault/actions/runs/40185453383) passe le build, les tests Ledger et le reste de la chaîne au dernier contrôle, avec fin de workflow en cours ; [Merge gate #40185453367](https://github.com/twister65/Nault/actions/runs/40185453367) : **réussi** (tests, npm audit, CodeQL).

**À faire par l'utilisateur :** tester un nouveau build Electron Linux/Windows avec Ledger Nano S Plus ou Nano X en USB. Refuser une transaction de test, vérifier le toast FR et le statut de connexion, puis refaire une signature de test en l'approuvant **sans cliquer sur Reconnect**. Ne jamais utiliser des fonds réels dans un test évitable. Aucune fusion `master` ni aucun déploiement Vercel sans accord explicite ; `git.deploymentEnabled["upgrade/angular-22"] = false` reste actif.

### RC sécurité — Electron/Vite/undici/fast-uri (25 octobre 2026)

Suite à la demande explicite de l'utilisateur, `package.json` épingle Electron **44.9.3** (correctifs 44.9.1 et 44.9.3 cumulés), et utilise des overrides npm ciblés : `@angular/build → vite@8.3.3` car Angular 22.2.4 déclare Vite 8.3.0 de manière exacte ; `@electron/get → undici@7.30.1` ; `ajv → fast-uri@3.1.9`. La sous-dépendance `node-gyp → undici@6.29.1` est conservée, car corrigée. Versions résolues et empreintes SHA512 vérifiées dans `package-lock.json` après le workflow existant de synchronisation [#40181721145](https://github.com/twister65/Nault/actions/runs/40181721145), commit [`79a9e80`](https://github.com/twister65/Nault/commit/79a9e8074973a32714e6c28abd9a71fd7cb89974). Le workflow temporaire ajouté pour la même résolution a perdu une course Git avec celui-ci ; il est retiré pour éviter les doublons.

Un contrôle explicite des quatre versions et des intégrités est ajouté à la validation Angular 22. **À recontrôler sur le dernier SHA :** `npm ci` reproductible, Web/PWA, Electron, PoW, tests RPC/Ledger, Playwright, CodeQL et Merge gate, ainsi que les packages Windows/Linux et le Bluetooth réel si besoin. La mise à niveau majeure `electron-updater@4.3.5` vers la branche sécurisée 6.x et les autres dépendances vulnérables restent des points de sécurité séparés pour la Release Candidate. La traduction « Ledger chargé avec succès ! » a été validée par l'utilisateur.

**Ne pas fusionner dans `master` sans accord explicite et ne pas réactiver les déploiements Vercel.**

### Localisation des notifications et validation fonctionnelle — 25 octobre 2026

**Retours utilisateur confirmés :** la carte « Nouveau portefeuille » ne s'étire plus ; l'import BIP39 a été testé sur Ubuntu avec un vecteur public aux indices 0, **sans** puis **avec** la passphrase `some password`, et les adresses attendues ont été obtenues ; le **générateur de paires de clés** a également été validé manuellement (génération et cohérence). Ne jamais demander l'envoi de seed ou clé privée de l'utilisateur.

**Problème découvert :** les notifications/boîtes de messages de l'application (« Successfully imported wallet! », avertissements, confirmations, copies, etc.) n'étaient pas toutes localisées bien que leurs écrans HTML le soient. Trois séries de corrections ont été publiées : [`1f718b3`](https://github.com/twister65/Nault/commit/1f718b38602443fbee0c7d5e758400e524df5ba3) (importation et création de portefeuille, mot de passe, déverrouillage, export, carnet d'adresses), [`9dc8358`](https://github.com/twister65/Nault/commit/9dc835815da60931b34167e2e289c7045e831fa4) (envoi/réception, représentants, avertissements réseau, QR) et [`939ff9c`](https://github.com/twister65/Nault/commit/939ff9c4a9a47fcddd9d840e82042f44b4cd1b7e) (adaptation du banc d'essai Ledger simulé, désormais doté d'une dépendance Transloco factice). **86 clés supplémentaires** dans `ui-notifications`, alignées FR/ES/EN, soit **727 clés traduites dans chacun des trois dictionnaires**. Les notifications des **services bas niveau** qui ne sont pas couverts par ces composants peuvent encore contenir des chaînes anglais ; les Options avancées restent volontairement hors périmètre de cette RC, comme décidé avec l'utilisateur.

**Vérification CI sur le SHA `939ff9c` :** [Validation Angular 22 #40179477010](https://github.com/twister65/Nault/actions/runs/40179477010) **SUCCESS** (installation, test i18n, Web/PWA, Electron, lint, Ledger USB/BLE simulé, RPC, Playwright et suite Angular complète) ; [Merge gate #40179477071](https://github.com/twister65/Nault/actions/runs/40179477071) **SUCCESS** (régression, audit npm, CodeQL et résultats publiés). Une précédente exécution après la première série de traductions échouait uniquement sur un mock d'exécution VM qui refusait le nouvel import `@jsverse/transloco`, corrigé par `939ff9c`. **Nouveau contrôle manuel des notifications FR après compilation conseillé**, en particulier lors d'une importation de portefeuille de test. Les anciens avertissements S-01/macOS/autres dépendances restent ouverts, aucune fusion n'est autorisée. La suspension Git Vercel `git.deploymentEnabled["upgrade/angular-22"] = false` est maintenue ; aucun déploiement Vercel n'a été demandé.

### Correctif RC — CryptoJS transitif, validation BIP39 et alignement des cartes (25 octobre 2026)

**Nouvel état prioritaire : correctif de dépendance publié, CI finale et vérification visuelle en cours.** L'utilisateur a confirmé que les traductions FR/ES sont satisfaisantes **hors Options avancées, explicitement reportées** à l'évolution future de la multisignature. Une nouvelle capture Ubuntu Electron montre que le bouton « Nouveau portefeuille » s'étirait jusqu'en bas de sa colonne après la correction précédente de hauteur adaptable. Commit [`9772079`](https://github.com/twister65/Nault/commit/977207986136399244835c1051213cb9e82eba68) : `align-items: flex-start` et `align-content: flex-start` ajoutés à `.landing-container > div`, sans remettre une hauteur fixe. **À retester visuellement** avec un nouveau build Linux.

Le correctif de sécurité [`1b55058`](https://github.com/twister65/Nault/commit/1b5505802ebd13dc6d651fcdbee7612be87c7947) met `nanocurrency-web` en `^2.0.0` et remplace ses sous-dépendances dans `package-lock.json` d'après le lockfile de la PR Dependabot #26 : `@noble/hashes@2.2.0`, `bignumber.js@11.1.3`; **`node_modules/nanocurrency-web/node_modules/crypto-js@3.1.9-1` a disparu**. Le `crypto-js` direct reste en `4.2.0`. Sont ainsi traités dans le lockfile **GHSA-rg76-677x-56q9** et **GHSA-xwcq-pm8m-c4vf** ; Dependabot continue d'évaluer `master` tant que la fusion n'est pas autorisée.

Un nouveau test `npm run test:nano-crypto-compat` (`scripts/test-nanocurrency-web-compat.test.cjs`) contrôle des vecteurs publics BIP39 (indices 0 et 14), la validation/rejet d'une signature de bloc, ainsi que l'absence de CryptoJS 3.1.9-1 dans le graphe du lockfile. **4/4 tests réussis** sur le job [Angular 22 #40175043314](https://github.com/twister65/Nault/actions/runs/40175043314). Toutefois la compilation de ce job a ensuite échoué car le paquet publié `nanocurrency-web@2.0.0` référence depuis `dist/index.d.ts` des fichiers `./lib/*.d.ts` absents. Commit [`c4170f7`](https://github.com/twister65/Nault/commit/c4170f7e0ca219ed8234721bcf1b57e355d64b3e) : `skipLibCheck: true` dans les tsconfig **application et tests seulement**, afin de contourner le défaut des déclarations du tiers tout en maintenant la vérification du TypeScript de Nault. Il faudra confirmer que la compilation et les tests complets réussissent. Ce réglage a des conséquences sur la vérification des déclarations des bibliothèques externes et ne doit pas être étendu sans nécessité.

**Garde-fous :** ne pas déclarer la RC prête à fusionner sur la seule base des 4 tests ; finir la CI au dernier SHA, vérifier l'import BIP39 réel sur un compte de test, le rendu Linux/Windows du menu, et maintenir ouvertes les réserves indépendantes S-01, macOS et autres alertes Dependabot. Ne pas traduire Options avancées pour cette RC. **Ne pas fusionner `master` sans autorisation explicite. Ne pas réactiver Vercel** (`vercel.json` conserve `git.deploymentEnabled["upgrade/angular-22"] = false`).

### ALERTE SÉCURITÉ CRITIQUE — dépendance CryptoJS transitive (25 octobre 2026)

**Résultat de vérification de la [PR Dependabot #26](https://github.com/twister65/Nault/pull/26), fermée sans fusion : correction NON entièrement présente sur `upgrade/angular-22`.** Cette PR visait `master` et actualisait `nanocurrency-web` de `1.4.3` à `2.0.0`, supprimant sa dépendance explicite `crypto-js@3.1.9-1`. Sur `upgrade/angular-22`, `package.json` indique bien `crypto-js: ^4.2.0` **en direct**, mais toujours `nanocurrency-web: ^1.4.3`. L'ancienne version amont utilise `crypto-js@3.1.9-1` (démontré par le diff du lockfile de la PR #26). On ne peut donc **pas** considérer le correctif transitif comme intégré : recontrôler le lockfile installé et l'arbre réel des dépendances avec `npm ls crypto-js nanocurrency-web --all`.

Advisories critiques concernés : [GHSA-rg76-677x-56q9 / CVE-2026-71851](https://github.com/advisories/GHSA-rg76-677x-56q9) : PRNG `CryptoJS.lib.WordArray.random()` faible en `<4.0.0` ; [GHSA-xwcq-pm8m-c4vf / CVE-2023-46233](https://github.com/advisories/GHSA-xwcq-pm8m-c4vf) : valeurs par défaut PBKDF2 faibles en `<4.2.0`. **Présence d'une dépendance vulnérable ne démontre pas l'exploitation du chemin concerné.** La création des nouvelles seeds Nault inspectée dans `src/app/services/util.service.ts` utilise `nacl.randomBytes(32)` ; `nanocurrency-web` sert, entre autres, à la dérivation BIP39 `wallet.accounts(...)` et à `tools.verifyBlock(...)`. Une vérification fonctionnelle de ces chemins et du bundle doit accompagner la remédiation.

**Divergence des contrôles :** le job `dependencies / audit` du [Merge gate #40169486773](https://github.com/twister65/Nault/actions/runs/40169486773) affiche `npm audit` avec **0 critical** et a réussi, bien que le manifeste conserve `nanocurrency-web@^1.4.3`. `npm audit` et les alertes GitHub Dependabot n'ont pas nécessairement le même périmètre ou les mêmes données d'avis ; **une CI verte ne permet pas de clore ces alertes**. L'API privée des alertes Dependabot n'a pas été accessible via le connecteur ; statut exact des deux alertes à confirmer dans GitHub Security.

**Garde-fou Release Candidate :** traiter la chaîne `nanocurrency-web`/CryptoJS avant toute proposition de fusion ; **ne pas fusionner #25 dans `master`** sans remédiation et validation explicitement documentées, notamment la compatibilité de `nanocurrency-web@2.0.0` (modification des primitives cryptographiques, suppression de certaines conversions d'unités), dérivation BIP39, signature et vérification de blocs, et exécution de la CI. Le risque historique **S-01** de stockage des seeds est une dette distincte et demeure ouvert. Aucun changement de dépendance ni déclenchement Vercel dans cette étape de vérification.

### Correctif localisation / mise en page — 25 octobre 2026 (captures Ubuntu Electron)

À la suite de sept captures d'écran du client Ubuntu Electron 1.18.3 fournies par l'utilisateur, corrections **publiées sur `upgrade/angular-22`** : traduction des textes en dur dans les écrans « Configurer le portefeuille », « Gérer le portefeuille », « Carnet des représentants », « Scanner un code QR » et « Envoyer » ; traduction des notes de sécurité Ledger, de la confirmation de changement de portefeuille et des libellés de l'export CSV. Dictionnaires `en/fr/es` alignés et enrichis. Correction CSS de `configure-wallet.component.css` : les cartes d'options passent d'une hauteur fixe à une hauteur minimale adaptable, avec titres plus petits et retour à la ligne, afin que **« Importer une phrase mnémonique »** ne déborde plus. Commits [`e2aa392`](https://github.com/twister65/Nault/commit/e2aa3928b6f5a9b6b2cb0c16af00a34dcd82ee0b), [`c69c754`](https://github.com/twister65/Nault/commit/c69c75437e270eac75126703a27c4d669dd9bef9), [`266b591`](https://github.com/twister65/Nault/commit/266b591a522c0f4e16fe1ae47ccfff77629fa071). La compilation/CI du candidat doit être revérifiée au dernier SHA. **Aucun déploiement Vercel ne doit être déclenché** avant levée explicite de la suspension. L'erreur « aucune caméra / permissions » visible sur l'Ubuntu de l'utilisateur n'est pas, à elle seule, la preuve d'une régression de scanner : les textes ont été localisés, le fonctionnement de la caméra reste à vérifier séparément sur un appareil qui en possède une. Validation visuelle du CSS en attente du retour utilisateur. **Ne pas fusionner dans `master` sans nouvel accord explicite.**

### Release Candidate Angular 22 — validation Windows et suspension Vercel (25 octobre 2026)

**NOUVEL ÉTAT, PRIORITAIRE SUR LES MENTIONS HISTORIQUES CI-DESSOUS.** L'utilisateur confirme le **25 octobre 2026** que son disque Windows est réparé et qu'il a testé Nault Angular 22 sur Windows en reproduisant **les mêmes tests fonctionnels que sur Linux**, **sans anomalie ni erreur constatée**. **La validation matérielle/fonctionnelle Windows Electron est acquise selon le compte rendu utilisateur.** Les anciens passages « Windows non validé », « problème de démarrage Windows » et les réserves associées ci-dessous décrivent l'état *avant* cette confirmation et ne sont plus des blocages d'essai Windows. Aucun log Windows ni version exacte du système n'a été fourni dans ce message ; ne pas inventer de traces, modèle Ledger ou paramètres matériels particuliers.

L'utilisateur signale également des tests supplémentaires sur smartphone Android avec le dernier déploiement disponible : **aucune anomalie observée hormis des traductions incomplètes** et **mise à jour de la PWA fonctionnelle**. La validation PWA inter-version est ainsi rapportée par l'utilisateur sur smartphone ; ne pas extrapoler à toutes les plateformes ni à tous les cas de mise en cache. Le projet `nault-tablet-css-test` a échoué sur la **limite Vercel de 100 déploiements/24 h** (`api-deployments-free-per-day`). Pour éviter de nouveaux déploiements Git depuis `upgrade/angular-22`, `vercel.json` a été modifié au commit [`4393d19`](https://github.com/twister65/Nault/commit/4393d197b8bdd541b16abd0a29e3cf07203dc033) avec `git.deploymentEnabled["upgrade/angular-22"] = false`. **Ne pas réactiver ni déclencher de déploiement Vercel sans vérifier le quota et la destination** ; cette suspension n'a **pas d'expiration automatique** et n'empêche pas les déploiements externes/manuel ou d'autres branches.

**Points encore ouverts :** macOS Electron sur MacBook Air après réparation, langues FR/ES incomplètes et vérification tablette spécifique si retenue, puis revue explicite des risques reportés **S-01 élevé**, Sweeper et signature MuSig complète, et accord explicite pour fusionner. La [PR #25](https://github.com/twister65/Nault/pull/25) est Ready for Review mais **NE DOIT PAS être fusionnée** avant décision de l'utilisateur ; conserver `master` intact. Le `Merge gate` précédemment vert ne dispense pas de contrôler les checks pertinents au dernier commit candidat.

> **Lecture obligatoire avant reprise par ChatGPT Work ou un autre intervenant :** commencer par le présent état opérationnel, puis lire les décisions techniques et l'historique archivés ci-dessous. Leurs descriptions au présent étaient exactes à leur date mais ne remplacent pas cet état actualisé. Vérifier systématiquement la tête Git, les versions installées et les derniers runs avant toute modification.

### PR #25 — suspension explicite de la fusion et tests matériels à venir (24 octobre 2026)

**Consigne explicite de l'utilisateur : NE PAS FUSIONNER DANS `master` pour l'instant, même si les contrôles CI ont réussi.** La [PR #25](https://github.com/twister65/Nault/pull/25) a été passée par l'utilisateur en **Ready for Review** (non Draft), mais cela **n'autorise pas la fusion**. `master` doit rester inchangé jusqu'à l'exécution des derniers tests Windows et Mac, puis à une autorisation explicite. La description publique de la PR est tenue **entièrement en anglais** ; les futurs titres, corps et commentaires de PR GitHub seront en anglais.

**Calendrier transmis par l'utilisateur (samedi 24 octobre 2026) :**
- **Dimanche 25 octobre** : assistance au dépannage du démarrage Windows. Problème annoncé sur le disque au démarrage ; sa cause n'est pas déterminée. Réaliser ensuite, si Windows redevient fonctionnel, les tests Nault Electron sur Windows (démarrage, comptes, Ledger USB, deux reconnexions, Bluetooth si compatible, redémarrage). Aucune validation Windows à ce stade.
- **Lundi 26 octobre ou après** : test Nault Electron sur le **MacBook Air prêté** après réparation. Le Mac refuse actuellement de démarrer ; l'utilisateur attend une **batterie neuve lundi**. Pas de test macOS effectué à ce stade.
- **Travaux possibles lors de la prochaine session, sans entreprendre de modifications hors session :** compléter les traductions manquantes (en particulier **Outils avancés**, FR/ES), contrôler la mise à jour inter-version de la PWA, puis configurer et effectuer un déploiement **strictement sur le projet Vercel tablet** (à distinguer de `nault-android-test`) pour des tests sur **tablette Android et smartphone**. Vérifier d'abord le projet, l'alias et la limite de déploiements Vercel ; éviter tout déploiement involontaire.
- **Dernier état CI :** [`Merge gate` run #40115398621](https://github.com/twister65/Nault/actions/runs/40115398621) **SUCCESS**, toutes les étapes de sécurité/régression/npm audit vertes au commit `41c1c42`. Ceci valide la chaîne automatique **mais ne clôt pas les tests de plateformes, n'efface pas S-01 et n'autorise pas une fusion**.

**Garde-fou de reprise :** ne modifier ni `master` ni la publication des releases ; conserver la PR #25 ouverte et non fusionnée. Attendre les retours matériels Windows/macOS, documenter les résultats, vérifier les CI d'éventuels changements complémentaires, puis demander **un accord explicite de fusion** après bilan.

### Pull request Angular 22 en brouillon — 24 octobre 2026

**PR créée :** [#25 — build: migrate Nault to Angular 22 (pre-merge validation)](https://github.com/twister65/Nault/pull/25), base `master`, head `upgrade/angular-22`, **Draft**, non fusionnée. Elle documente le test d'envoi Ledger confirmé par l'utilisateur et les réserves Windows, Sweeper, hot wallet S-01 et multisig. GitHub signalait `mergeable=true` (pas de conflit de fusion détecté), mais `mergeable_state=blocked` (gate requis non conclu) au moment de la première consultation.

**Déclenchement des checks :** le dernier commit documentaire `80ff05e` portait `[skip ci]` et les vérifications PR ne sont pas apparues immédiatement après l'ouverture. Ce commit de suivi volontairement **sans marqueur de saut CI** provoque une nouvelle évaluation par le système CI GitHub. Attendre le **Merge gate pour la PR #25**, puis examiner séparément `Nault regression checks`, `CodeQL Advanced / Published CodeQL results` et `Critical dependency audit` au SHA de merge candidat. Le statut Vercel sur le projet `tablet` est distinct du check `Merge gate` et n'autorise aucune publication ni modification de ce projet. **Ne pas fusionner sans autorisation explicite de l'utilisateur.**

### Dernière validation matérielle — envoi XNO Ledger (24 octobre 2026)

**VALIDÉ PAR L'UTILISATEUR.** Le 24 octobre 2026, à l'issue de la revue pré-fusion, l'utilisateur confirme explicitement : **« test d'envoi validé par mes soins »** pour le scénario d'envoi de XNO signé par Ledger sur Angular 22. Le matériel et l'interface utilisés pour cette ultime confirmation, le montant réellement envoyé, le hash, les journaux RPC et les confirmations réseau ne sont **pas fournis** dans ce message : ne pas inventer ces valeurs ni assimiler cette validation rapportée à un test automatisé d'un autre parcours.

La condition de validation matérielle de l'envoi peut être **marquée comme satisfaite selon le compte rendu utilisateur**. La dernière condition de sortie vers `master` demeure la création d'une **PR Draft** `upgrade/angular-22` → `master`, l'exécution **réussie et vérifiée** du véritable `Merge gate` sur la PR, puis un **accord explicite pour la fusion**. Maintenir les réserves : risque de sécurité logiciel **S-01 ÉLEVÉ préexistant et non corrigé**, Sweeper et signatures cryptographiques multisig non validés dans cette migration, Electron Windows non validé sur le poste (message d'erreur disque non diagnostiqué), mise à jour inter-version PWA non entièrement contrôlée, localisation avancée partielle. Les risques sont reportés **avec transparence**, pas déclarés clos. Aucun transfert ni code de cryptographie supplémentaire requis pour établir le bilan Angular 22.

### Revue finale pré-fusion Angular 22 — 24 octobre 2026

**Décision de revue : PR brouillon possible, FUSION DANS `master` NON ENCORE RECOMMANDÉE.** La revue a été demandée par l'utilisateur après son signalement : « Windows refuse de démarrer. Il me dit qu'il y a un problème avec le disque. Passons. » Le défaut Windows est **non diagnostiqué** : ne pas l'attribuer à Nault sans trace et ne pas le déclarer corrigé. La version Windows est donc **non validée sur poste réel** et doit être signalée comme telle si la migration est finalement fusionnée ; ne pas faire de nouvelle release Windows en revendiquant des essais réussis.

**Photographie GitHub vérifiée le 24 octobre 2026 :**
- `master` au commit `0a94c865659a2add43e7832278f93df247f2130b`, tête `upgrade/angular-22` au commit `f48326900291a8a0b21e952f80639598cd874dc3`. `master...upgrade/angular-22` : **193 commits d'avance, 0 en retard, 115 fichiers touchés**. Aucun conflit d'historique visible dans cette comparaison ; cela ne prouve pas que GitHub jugera une future PR fusionnable.
- Code applicatif soumis à la dernière CI au commit `72061a8abf337e6447ffb4043860d2ab7baa5657` ; les **3 commits suivants ne changent que le document de référence**. [CI Validate Angular 22 migration #40110464779](https://github.com/twister65/Nault/actions/runs/40110464779) **SUCCESS**, [Linting](https://github.com/twister65/Nault/actions/runs/40110464810) **SUCCESS**, [CodeQL Advanced #40110464816](https://github.com/twister65/Nault/actions/runs/40110464816) **SUCCESS** et [packages Electron Linux/Windows #40110464889](https://github.com/twister65/Nault/actions/runs/40110464889) **SUCCESS**. Le journal `Published CodeQL results` contient `sha: 72061a8...`, `missingCategories: []`, `openAlerts: []`, `passed: true` pour `refs/heads/upgrade/angular-22`. Les analyses GitHub CodeQL ne constituent pas un audit manuel exhaustif.
- Ruleset `master` [Nault - Protect master (PR + CI)](https://github.com/twister65/Nault/rules/25353898), **actif**, impose PR, interdiction de suppression/force-push, branche à jour et check `Merge gate`, sans bypass ; aucune PR `upgrade/angular-22` → `master` n'est actuellement ouverte. Le workflow `.github/workflows/merge-gate.yml` agrège `pr-regression.yml`, `codeql.yml` et `critical-dependency-audit.yml` ; **ces trois contrôles sur le ref de fusion ne sont pas encore validés**, particulièrement `npm audit` niveau `critical` (le workflow dédié ne se déclenche pas sur simple push `upgrade/angular-22`). Ne pas revendiquer de résultat d'audit npm récent sans run du gate.
- Déploiement Web/PWA [nault-android-test.vercel.app](https://nault-android-test.vercel.app) **READY** au commit applicatif `ed188221eedb22ccd82271bd5f79f4ba5b89318d`, antérieur au correctif `linux.desktop` et à la chaîne d'artefacts, qui ne modifient pas le rendu Web. Les essais PWA/PoW/BLE/réception de fonds et langues principales réalisés sur Chromebook, ainsi que la construction Electron et les 5 validations réelles Ubuntu, sont consignés dans les sections précédentes.

**Points bloquants avant recommandation de fusion :**
1. **Envoi Ledger Angular 22 : VALIDÉ SELON L'UTILISATEUR le 24 octobre 2026.** L'utilisateur confirme avoir réalisé le test d'envoi. Aucun montant, hash ou journal de la transaction n'a été partagé ; ne pas les inventer. Les tests `send.component.spec.ts` et `nano-block.service.spec.ts` sont toujours des smoke tests de création : cette validation matérielle rapportée complète la couverture mais ne remplace pas des tests automatisés de signature.
2. **Vérifier le vrai `Merge gate` sur une PR Angular 22 en brouillon** avant de la rendre fusionnable (inclut analyses CodeQL publiées sur ref candidat, test de régression et audit npm critique). Ne pas merger si un check échoue.

**Risques et limites explicites à accepter/reporter avant fusion :**
- **S-01 du rapport de sécurité préliminaire daté du 12 octobre 2026 : risque ÉLEVÉ conditionnel sur les seeds des portefeuilles logiciels**, format historique `CryptoJS.AES.encrypt(seed, password)` / EvpKDF, sans AEAD moderne, coût de dérivation insuffisant contre attaques hors ligne après vol du stockage local. Code actuel `src/app/services/wallet.service.ts` : appels `CryptoJS.AES.encrypt` aux environs des lignes 429, 452, et 1171, dont `password || ''`. Exigence recommandée : format versionné Argon2id/scrypt/PBKDF2 renforcé + AES-GCM/XChaCha20-Poly1305, sauvegardes de migration de test vérifiées. **Non corrigé ; préexistant à cette migration et explicitement réservé à un chantier distinct** : documenter la limitation de sécurité, ne pas considérer Angular 22 comme sa remédiation ni ouvrir de nouveaux usages hot-wallet sur la foi de la fusion. Aucun vol de seed réel démontré par cet audit.
- **Sweeper** : code modifié pour compatibilité Angular/TypeScript mais `sweeper.component.spec.ts` ne réalise qu'un test de création ; aucun essai manuel de récupération signé sur Angular 22 rapporté. Enregistrement explicite comme `non testé` et campagne distincte avec clés de test jetables non financées si report accepté. De même la signature multisig réelle n'est pas validée : seul **Generate/Reset** a réussi, la future importation d'un portefeuille multisig et extension Chrome de signature sont hors migration.
- **Windows Electron** : GitHub Actions a fabriqué le ZIP et chargé les modules natifs, mais Windows a refusé de démarrer sur le poste utilisateur en affichant un problème de disque ; ne pas annoncer une panne du binaire Nault ni un test Windows validé. Report demandé par l'utilisateur. Cela interdit d'affirmer que la future release Windows a été testée ; si Windows est un critère obligatoire pour la release, la validation manquante reste bloquante pour cette release.
- **PWA** : installation, lancement hors ligne, reconnexion RPC/WS validés, mais mise à jour inter-version et quelques ressources graphiques hors ligne à compléter. **i18n** : FR/ES, **515 clés**, mais les outils avancés contiennent encore de l'anglais (report accepté par l'utilisateur).

**Séquence de sortie conseillée :** envoi Ledger **déclaré validé par l'utilisateur** → ouverture d'une PR **Draft** `upgrade/angular-22` vers `master` avec risques S-01/Sweeper/Windows consignés → exécution/résolution du `Merge gate` → décision explicite sur les risques reportés et accord de l'utilisateur **avant** toute fusion. Aucun changement de code cryptographique ni correction S-01 opportuniste dans cette revue.

### Validation fonctionnelle du PoW CPU — 24 octobre 2026 (ChromeOS, Vercel)

**Résultat : VALIDÉ (CPU et GPU WebGL) sur Chromebook.** L'utilisateur a réalisé sur Chromebook deux calculs PoW locaux avec le déploiement `https://nault-android-test.vercel.app` (commit applicatif `43ad84d`, branche `upgrade/angular-22`). Analyse des fichiers utilisateur `pow-console.log` et `pow-network.har` dans la conversation du 24 octobre ; ces captures, potentiellement sensibles, ne sont pas ajoutées au dépôt.

- **Worker natif esbuild** : `worker-I6PCXLVI.js` chargé avec **HTTP 200**, confirmant le chargement du Web Worker issu du remplacement de `worker-loader`.
- **Calculs observés** : deux exécutions `clientCPU`, multiplicateur **1×**, seuil `fffffff800000000`, **7 workers** ; temps **9,75 s** et **18,45 s**. La console montre `CPU Worker: Found work` puis `Work found` ; la réutilisation ultérieure de ces preuves par `Using cached work` est confirmée.
- **Validation cryptographique indépendante** : les deux nonces et les deux hashes figurant dans les logs satisfont le seuil de difficulté selon BLAKE2b-8 appliqué au nonce inversé suivi du hash (interprétation little-endian).
- **Réseau** : le HAR contient une réponse `process` réussie comportant un hash. Aucun `work_generate` RPC lors de ces calculs : PoW local confirmé. Les 14 entrées HAR de worker au statut réseau `0` sont **compatibles avec l'arrêt des autres workers à la résolution**, sans erreur correspondante dans la console ; cette hypothèse n'est pas une preuve de leur cause. Une erreur `400` concernant l'ancien nœud BerryPay est visible au démarrage de la console, sans incidence constatée sur les calculs CPU via le serveur ensuite sélectionné.
- **GPU WebGL testé ensuite** : calcul local terminé en **0,383 s**, 4 itérations, nonce `2ba87ec3cc6848f8` sur le hash `CDED6E3A993CC9AD8A2298AED27EEA80F63E9086362C9CA895766981316D6409`, multiplicateur 1×. Console `WebGL Worker: Found work` et `Using cached work` ; aucun appel RPC `work_generate` signalé dans la capture. Avertissements `GPU stall due to ReadPixels` non bloquants ; suffixe `GL_CLOSE_PATH_NV` ne signifie pas que Nault exige une carte NVIDIA. L'utilisateur confirme l'accélération matérielle ChromeOS activée dans `chrome://gpu`.

Aucune modification applicative ni fusion vers `master` associée à ce constat.

### Reprise des validations avant fusion — MuSig non-régression et futur portefeuille multisig (24 octobre 2026)

**Décision utilisateur : continuer la validation de la migration Angular 22 pour préparer la fusion dans `master`, sans fusion immédiate.** Les traductions FR/ES des pages sous « Outils avancés » (multisig notamment) sont **volontairement reportées**, aucune correction i18n à faire pendant ce lot de tests. La page `/multisig` présente en français un titre et des libellés anglais, comme la capture Chromebook du 24 octobre ; aucun défaut fonctionnel nouveau n'est déduit de ce seul constat.

**État technique vérifié au lancement :**
- [CI Validate Angular 22 migration #40107108613](https://github.com/twister65/Nault/actions/runs/40107108613), commit applicatif `ed188221eedb22ccd82271bd5f79f4ba5b89318d` : **SUCCESS**. CodeQL Advanced et Linting en succès au même SHA.
- Déploiement Vercel `nault-android-test.vercel.app` : **READY**, projet `nault-android-test`, commit applicatif `ed188221` confirmé.
- `src/app/components/multisig/multisig.component.ts` : `addAccount` valide le champ à partir d'une adresse Nano ; `generateMultisig` appelle `musigService.runAggregate` ; `removeSelectedAccount` invalide le résultat ; `reset` efface les adresses ; `navigateAccount` ouvre `/account/{adresse}?sign=1` ; `navigateBlock` traite uniquement `nanosign:`/`nanoprocess:`. `musig.service.ts` charge `musig_nano.wasm.b64` et utilise `musig_aggregate_public_keys`. Le test Jasmine `multisig.component.spec.ts` existant est **un smoke test de création de composant uniquement** ; la CI réussie ne prouve ni la génération MuSig réelle ni une signature distribuée.
- **Test manuel minimal — VALIDÉ selon l'utilisateur sur Chromebook (24 octobre 2026).** L'utilisateur confirme le succès de la **génération d'adresse multisig** et du bouton **RESET** dans `/multisig`, après notre procédure utilisant deux adresses publiques et suppression/réinitialisation. Ce compte rendu ne fournit ni journal WASM ni valeur d'adresse et **ne constitue pas une validation d'une signature multisig réelle**. Ne pas financer de nouvelle adresse multisig pour les tests de migration ; signer/diffuser de vraies opérations dans un chantier séparé.
- **Étapes suivantes avant fusion** : revue des validations Web/PWA et Ledger Nano X déjà effectuées ; packaging et exécution native des applications Electron sous **Linux et Windows**, y compris connexion/reconnexion Ledger ; audit des autres points encore ouverts (Sweeper, signature du hot wallet / audit S01, et mises à jour PWA) avec décision explicite sur ce qui est bloquant ou reporté. **Ne pas déclarer la branche prête à fusionner uniquement sur la CI ; demander l'accord explicite avant toute fusion.**

**Nouveau chantier multisig demandé par l'utilisateur, hors périmètre de la migration et de la fusion Angular 22 :** concevoir une interface d'**importation d'un portefeuille multisig depuis « Configure New Wallet »**, enregistrant l'adresse multisig et l'ensemble des adresses publiques de ses signataires ; permettre la préparation d'une opération d'envoi XNO dans le portefeuille multisig ; exiger la participation cryptographique de **chaque signataire** à la transaction ; développer une **extension Chrome de signature** pour que chacun puisse signer depuis son environnement. Préparer **ultérieurement** une documentation technique spécifique : formats et intégrité des demandes de signature, identification de la transaction et du réseau, gestion des participants et de leurs autorisations, état de collecte, modèle de sécurité (permissions de l'extension, consentement, isolation des secrets, confirmation des montants/destinataires, anti-rejeu), reprise après interruption et compatibilité avec les signatures multisig existantes. Le code MuSig actuel est `m-of-m` ; ne pas présenter l'extension, l'import ou la gestion des signataires comme déjà implémentés. **Aucun développement de cette nouvelle interface/extension ni modification des clés/WASM pendant cette validation de migration.**

### Préparation des packages Electron Linux/Windows — 24 octobre 2026

**But : disposer de véritables packages de test Angular 22, non signés et non publiés en release, pour valider les applications de bureau sur Ubuntu et Windows.** La CI [#40107108613](https://github.com/twister65/Nault/actions/runs/40107108613), au SHA applicatif `ed188221`, compile bien Angular desktop et le main/preload Electron mais **ne package pas des exécutables vérifiables**. La release GitHub `v1.18.3` existante ne constitue pas un package prouvé du commit Angular 22 ; ne pas la confondre avec les futurs artifacts.

- Nouveau workflow [`.github/workflows/angular-22-desktop-test-packages.yml`](https://github.com/twister65/Nault/blob/upgrade/angular-22/.github/workflows/angular-22-desktop-test-packages.yml), commit `dd50ca8`, déclenché automatiquement par sa création sur `upgrade/angular-22` et relançable manuellement par `workflow_dispatch`. Il compile le bureau sur Ubuntu 24.04 et Windows 2022 (Node 24.15.0, Python 3.11 pour les modules natifs), lance les contrôles Ledger simulés, prépare **AppImage Linux x64** et **ZIP portable Windows x64**, vérifie la structure/le chargement des modules sous Electron, publie un SHA-256, `BUILD.txt` et les fichiers comme **GitHub Actions artifacts privés à la durée limitée de 14 jours**. Aucun éditeur/signature/installation ne doit être supposé validé sur les appareils de l'utilisateur et aucune publication de release n'est autorisée.
- **Premier essai de packaging (échec Linux identifié et corrigé) :** [run #40110273911](https://github.com/twister65/Nault/actions/runs/40110273911). Le build Linux échouait après succès de la compilation et des 43 régressions Bluetooth simulées : **electron-builder 26.18.0 rejette `build.linux.desktop`** (`Invalid configuration object`, `configuration.linux.desktop should be ... null`). Le commit `cdc64e5` supprime de `package.json` cette option obsolète tout en conservant la cible AppImage et l'icône ; aucune modification des fonctionnalités du portefeuille. Le commit `72061a8` actualise les actions CI et relance la construction Linux/Windows : [run #40110464889](https://github.com/twister65/Nault/actions/runs/40110464889). Le **job Linux** de ce run est **SUCCESS** : package AppImage produit, extraction `--appimage-extract` et présence de `resources/app.asar` vérifiées ; artifact **`Nault-Angular22-Linux-x64`** (artifact ID `12566014010`, 157 776 355 octets pour l'archive, rétention jusqu'au 7 novembre 2026). Le **job Windows du même run a aussi conclu SUCCESS**, avec artifact **`Nault-Angular22-Windows-x64`** (ID `12566496645`, archive de 182 461 505 octets, expiration le 7 novembre 2026). Les deux packages proviennent **du même commit `72061a8`** ; les tests humains Linux sont validés, ceux sous Windows restent à effectuer.
- **Tests humains après disponibilité des artifacts** : démarrage à froid, aucun écran blanc, consultation comptes/RPC, compte Ledger, connexion/reconnexion USB et Bluetooth **si transport pris en charge**, test de lecture d'adresse, fermeture/réouverture de l'application, absence de régression PoW (sans envoyer de fonds importants). Relever `~/.config/nault/logs/main.log` sur Linux et `%APPDATA%\\nault\\logs\\main.log` sur Windows, sans données sensibles. Un test de signature réel, s'il est nécessaire, sera réalisé avec un montant faible, un accord et une confirmation sur la Ledger.
- Ne pas déployer ces binaires sur Vercel et ne pas fusionner dans `master` sans la dernière revue et l'autorisation de l'utilisateur.

### Validation matérielle Electron Ubuntu — 24 octobre 2026

**VALIDÉ PAR L'UTILISATEUR sur Ubuntu / Linux x64.** Après téléchargement de l'AppImage Angular 22 depuis le workflow de test `40110464889` (code source `72061a8abf337e6447ffb4043860d2ab7baa5657`), l'utilisateur a confirmé **OK pour les cinq contrôles** demandés : 1) démarrage de Nault Electron et affichage des comptes ; 2) Ledger USB et lecture de l'adresse ; 3) **deux** déconnexions/reconnexions successives ; 4) connexion Ledger Bluetooth ; 5) fermeture puis redémarrage de Nault avec portefeuille accessible. **Seul incident :** un problème initial d'appairage Bluetooth, résolu par l'utilisateur, sans modification du code Nault. Aucun journal matériel joint ; conclusion fondée sur son compte rendu direct. Cela valide la connexion, pas une nouvelle transaction signée sous Electron ni les parcours Sweeper/hot wallet.

**Packaging Linux + Windows cohérent désormais confirmé :** [workflow #40110464889](https://github.com/twister65/Nault/actions/runs/40110464889) **SUCCESS pour les deux jobs**, sur le même commit `72061a8` ; [CI Angular #40110464779](https://github.com/twister65/Nault/actions/runs/40110464779) **SUCCESS**. Artifacts GitHub disponibles jusqu'au **7 novembre 2026** :
- `Nault-Angular22-Linux-x64`, artifact ID `12566014010` (archive de 157 776 355 octets ; déjà validé manuellement).
- `Nault-Angular22-Windows-x64`, artifact ID `12566496645` (archive de 182 461 505 octets ; **Windows non encore validé manuellement**). L'archive contient le ZIP portable `Nault-WebBluetooth-Windows-x64.zip`, `SHA256SUMS.txt` et `BUILD.txt`. La CI vérifie son chargement des fichiers Angular/Electron et des modules natifs sous Electron, pas un démarrage d'interface avec la Ledger physique.

**Prochaine validation : Windows x64** : télécharger l'artifact Windows du run ci-dessus, extraire d'abord l'archive d'artefact puis le ZIP portable Nault complet dans un dossier indépendant de l'installation stable ; exécuter `Nault.exe` ; vérifier lancement, comptes/RPC, Ledger USB, deux reconnexions, Bluetooth si disponible et redémarrage. Ne pas importer de seed ni effectuer de transfert de fonds. Vérifier l'empreinte `SHA256SUMS.txt` sur le ZIP intérieur. Ne pas utiliser la release `v1.18.3` comme substitut de cette branche.

**Préparation de fusion :** les parcours matériels Ubuntu sont acquis ; Windows et revue finale des points de sécurité explicitement bloquants doivent encore être examinés. Aucun merge vers `master` avant accord explicite.

### Compléments i18n signalés par les captures ChromeOS (24 octobre 2026)

**Signalement utilisateur sur ChromeOS, interface sélectionnée en français :** captures de `Representatives`, `Configure Wallet` et `Receive` montrant de nombreuses chaînes laissées en anglais alors que les menus et les statuts Ledger de la barre latérale sont traduits. Exemples reproduits : `Manage Known Reps`, `Voting Weight`, `Change your representatives`, `Use Ledger`, `Import Seed`, `No new incoming transactions for selected account`, `Minimum Receive is set to`, `Copy address`, `Amount of USD`, ainsi qu'un `Total Balance` conservé dans une expression conditionnelle de `app.component.html`. Les exemples de mots mnémoniques BIP39 tels que `skin`, `legal`, `funny`, `huge` ne sont **pas** des libellés à traduire : ce sont des mots d'exemple de la liste anglaise.

**Correctifs publiés et validés sur `upgrade/angular-22` :**
- `representatives.component.html` : titre, texte d'introduction, statut / poids de vote, représentant inconnu, sélecteur des comptes, saisie du représentant et boutons de validation / progression. Les comparaisons sur `account.id === 'All Current Accounts'` conservent la valeur technique anglaise, seul l'affichage est traduit.
- `configure-wallet.component.html` : cartes du parcours initial (nouveau portefeuille, Ledger, importation de seed et phrase mnémonique, options supplémentaires), écran de choix de phrase mnémonique, messages de sécurité et états Ledger principaux. La génération/importation de clés et les flux Ledger ne sont pas modifiés.
- `receive.component.html` : états « aucune transaction entrante », seuil minimal, messages du mode commerçant, outils de copie d'adresse/lien et champ de montant fiduciaire. Correction de la valeur affichée du solde total dans `app.component.html`.
- Dictionnaires `en.json`, `fr.json`, `es.json` enrichis de **102 clés** supplémentaires, soit **515/515 clés complètes** par langue avec vérification de l'identité des paramètres `{{ variable }}` et sans divergence de structure. Une partie des sous-écrans et des erreurs codées dans les services restent en anglais ; ne pas qualifier Nault de localisé à 100 % avant audit exhaustif.
- **CI confirmée :** [Validate Angular 22 migration #40107108613](https://github.com/twister65/Nault/actions/runs/40107108613) **SUCCESS** sur le commit applicatif `ed188221eedb22ccd82271bd5f79f4ba5b89318d`, audit i18n **515/515** en FR/ES, builds Web/PWA et Electron, lint, Ledger/RPC, Playwright, **117/117 tests Karma/Jasmine**.
- **Déploiement Vercel confirmé :** projet **`nault-android-test` uniquement**, ID `dpl_CJyLr8z5qzPbHNN7wpNwhQWjt8yQ` **READY**, alias **`https://nault-android-test.vercel.app`** actif et sans erreur sur le SHA `ed188221`. Le projet `tablet` n'a pas été modifié, aucune fusion dans `master`.
- **Reste à tester manuellement** : vérifier le chargement du nouveau service worker PWA, puis relire les trois écrans sur Chromebook en français et en espagnol. Une autre passe reste nécessaire pour les textes non extraits dans les écrans secondaires et les notifications.

### Localisation française et espagnole — 24 octobre 2026

**Changement effectué sur `upgrade/angular-22` (pas encore validé sur du matériel ou sur Vercel au moment de cette note).** Le référentiel ne comportait que `src/assets/i18n/en.json` et `TranslocoRootModule.availableLangs` ne proposait que l'anglais. À la demande de l'utilisateur, deux dictionnaires `fr.json` et `es.json` ont été créés et vérifiés : **515 traductions / 515 clés de référence** dans chaque langue, réparties entre comptes, détails, carnet d'adresses, représentants, configuration, récupération du portefeuille, navigation générale et accueil. Les paramètres interpolés (`{{ account }}`, `{{ days }}`, `{{ percent }}`, `{{ minCharacters }}`, etc.) ainsi que l'espacement des fragments autour des liens sont préservés.

- **Activation** : `src/app/transloco/transloco-root.module.ts` propose maintenant `English`, `Français`, `Español`, conserve l'anglais par défaut et configure des imports statiques asynchrones explicites pour que le builder esbuild génère chaque morceau de traduction. `ConfigureAppComponent` sauvegarde déjà `language` via `Update Display Settings` et répercute le changement dans Transloco.
- **Tests** : `scripts/check-i18n.cjs` et `npm run test:i18n` contrôlent parité de clés, absence de valeurs vides, variables et espaces (515/515 pour fr/es) ; une étape `Verify French and Spanish translation dictionaries` est ajoutée à `.github/workflows/angular-22-validation.yml`. Test Jasmine `transloco-root.module.spec.ts` : chargement `en/fr/es`, échantillons d'étiquettes et repli anglais pour langue inconnue.
- **Couverture complémentaire** : 85 clés supplémentaires ajoutées aux trois dictionnaires pour les éléments auparavant codés en dur dans `app.component.html` (menu/navigation/connexion serveur), `wallet-widget.component.html` (statuts Ledger et portefeuille), `send.component.html` (envoi) et `receive.component.html` (réception et principales étiquettes du mode commerçant). Les chaînes interpolées et les valeurs persistées restent inchangées. **Limite** : ce résultat couvre désormais 515 textes après les compléments ci-dessus, mais d'autres notifications, écrans secondaires et chaînes littérales dans les services restent en anglais ; une passe d'internationalisation supplémentaire sera nécessaire avant de qualifier l'interface entière de 100 % traduite.
- **CI et déploiement vérifiés :** [Validate Angular 22 migration #40105526903](https://github.com/twister65/Nault/actions/runs/40105526903) **SUCCESS**, commit applicatif `c5f282704bc948f980067b4b1739e932f6e2fd61`, **117/117 Karma/Jasmine**, audit de traduction 413/413 fr/es, builds Web/PWA et Electron, tests Ledger/RPC, Playwright et lint. Vercel projet **`nault-android-test`** : déploiement `dpl_9E36svhEzXqN1S7btpeqAuyZxnbZ` **READY**, alias `https://nault-android-test.vercel.app` confirmé et sans erreur, SHA Git `c5f2827` ; **aucun** déploiement sur `tablet`, aucune fusion vers `master`. **Prochaines validations manuelles** : dans `Settings → App Settings → Language` et `Update Display Settings`, vérification du changement sans rechargement, navigation Accueil/Comptes/Paramètres, rechargement PWA et persistance de la langue. Ne jamais effacer les données du portefeuille pour tester les traductions. Ne pas fusionner dans `master`.

### Validation réception XNO Ledger déconnectée et libellés i18n (24 octobre 2026)

**Réception Ledger déconnectée : VALIDÉE SUR CHROMEBOOK selon le retour utilisateur.** Paramétrage : `Receive Method = Automatic - Largest Amount First`, minimum de réception `0.000001 XNO`, PoW local WebGL ; l'utilisateur a envoyé un premier XNO en déconnectant la Ledger Nano X, puis confirmé que le scénario est **OK**. Capture : `Ledger disconnected`, pastille `New` sur `Receive` et notification orange **« Incoming XNO is waiting. Unlock your Ledger, open the Nano app, then click Reconnect to receive it. »**. La capture suivante affiche `Ledger Ready` et le solde augmente de 22 à 23 XNO. Console `receive-console.log` : confirmation WebSocket entrante, cache de work, puis reconnexion BLE et `get work for receive block`. Une requête `/configure-app` a produit un HTTP 504 isolé ; aucun message `Error catching block` ou `Error unknown with ledger` dans le journal. Un second envoi de 1 XNO a aussi été rapporté ensuite par l'utilisateur ; ne pas extrapoler sa chronologie à la première capture.

**Régression visuelle intermittente : options de paramètres non traduites.** Les captures affichent notamment `configure-app.pending-options.automatic-largest-amount-first`, `configure-app.pow-options.client-side-gpu-webgl`, `configure-app.identicon-options.x-minutes` dans les menus déroulants, alors que les intitulés de champs sont traduits. Après un autre envoi de 1 XNO, les libellés sont revenus spontanément selon l'utilisateur. Ce changement ne prouve pas que le transfert a corrigé la traduction. **Cause identifiée dans le code :** `ConfigureAppComponent` traduisait les options par `translocoService.translate()` lors de l'initialisation des propriétés, avant le chargement asynchrone du dictionnaire, tandis que le reste du modèle utilise déjà la directive `*transloco` réactive. Toutes les clés concernées sont présentes dans `src/assets/i18n/en.json`.

**Correctif publié sur `upgrade/angular-22` (CI Angular 22 validée au SHA `5751766`) :** `99913d0` et `b7ee769` conservent les clés des 26 options au lieu de les traduire trop tôt, et gardent les paramètres d'interpolation `minutes/hours` ; `882d16c` traduit les options dans le modèle HTML à travers le helper réactif `t()`, en laissant les libellés non traduits tels que `USD - US Dollar`, `2x`, etc. ; `5751766` ajoute une vérification Jasmine des clés et valeurs d'options. Les valeurs persistées des sélecteurs ne changent pas ; aucun fichier de traduction ni code de transaction modifié. **CI confirmée :** [Validate Angular 22 migration #40103719555](https://github.com/twister65/Nault/actions/runs/40103719555), succès au SHA `5751766` (builds, lint, Ledger/RPC, Playwright et Karma/Jasmine). **Déploiement Vercel créé :** `dpl_DsKyJxbU9YMxj9kyS3u8xQXgsKF1`, projet vérifié `nault-android-test`, commit `5751766`, statut `BUILDING` à la dernière consultation, **alias principal non encore confirmé**. Ne tester le correctif qu'après confirmation `READY` et alias `nault-android-test.vercel.app`. Contrôler le premier affichage, la traduction après chargement et le rechargement PWA. Ne jamais effacer le stockage du portefeuille pour ce test ; ne pas fusionner dans `master`.

### CI Angular 22 — correction du mock de notifications Ledger (24 octobre 2026)

- **Échec reproduit dans GitHub Actions :** [run #40100117474, job #120890359952](https://github.com/twister65/Nault/actions/runs/40100117474/job/120890359952), sur SHA applicatif `84e72f4`. Installation npm, build Web/PWA, build Electron et lint **réussis**. La phase `Run automated Ledger USB/BLE transport regression checks` a échoué au test `desktop Bluetooth connects through renderer, not native IPC` : `TypeError: this.notifications.removeNotification is not a function`, puis `AssertionError: false == true`. Les suites RPC, Playwright et Karma/Jasmine ont été **ignorées en cascade**, et ne sont pas considérées validées par ce run.
- **Cause :** le code réel `ledger.service.ts` supprime désormais `ledger-connection-help` après succès de la reconnexion BLE ; `NotificationService` implémente bien `removeNotification`, mais le service de notification simulé dans `scripts/test-ledger-bluetooth.js` n'implémentait que `sendWarning`. Ce défaut concernait **la fixture de test**, pas une absence de méthode dans l'application.
- **Correctif poussé :** [`f48d682`](https://github.com/twister65/Nault/commit/f48d682cb71d95d66a813faa46f2cc0159c671f6) complète le mock par `removeNotification(identifier)` et ajoute une assertion confirmant qu'une reconnexion réussie nettoie l'ancienne notification.
- **Nouvelle CI validée :** [Validate Angular 22 migration #40100966775](https://github.com/twister65/Nault/actions/runs/40100966775), **SUCCESS** au SHA `f48d682` (compilations Web/PWA + Electron, lint, tests Ledger USB/BLE, tests RPC, Playwright et **114/114 Karma/Jasmine**). Attendre les étapes RPC/Playwright/Karma et la conclusion finale au même SHA. Un déploiement Vercel **exclusivement ciblé sur le projet `nault-android-test`** a été créé à partir du SHA CI-validé `f48d682` : ID `dpl_7BoU5jf5GXyzvr35M8VjeqEXH2hw`, URL technique `https://nault-android-test-5u1wnkbz4-olaverre-1312.vercel.app`. **État final vérifié : `READY`**, SHA Git déployé **`f48d682cb71d95d66a813faa46f2cc0159c671f6`**, alias **`nault-android-test.vercel.app`** présent, **`aliasError: null`**. La prochaine étape est le test matériel sur ChromeOS des états Ledger verrouillé/app Nano fermée, sans toucher aux données du portefeuille. Ne pas déployer sur `tablet`. **Ne pas fusionner dans `master`.**

### État Ledger verrouillé ou application Nano fermée — test et correctif (24 octobre 2026)

**Résultat final : VALIDÉ SUR CHROMEBOOK avec la version applicative `f48d682`.** L'utilisateur confirme, après avoir chargé le correctif, que les messages lorsque la Ledger est verrouillée ou lorsque l'application Nano est fermée sont explicites et que la reconnexion fonctionne correctement. Aucun nouveau log de ce deuxième test n'a été fourni : validation fonctionnelle rapportée par l'utilisateur.

- **Anomalie d'origine sur le déploiement `43ad84d` :** quitter l'application Nano déconnectait Nault sans instruction explicite ; tenter une reconnexion Ledger verrouillée affichait `Bluetooth connection failed: Ledger device: UNKNOWN_ERROR (0x5515)`. La console `console.log` montrait également `0x6e01` après fermeture de l'application. Ces codes surviennent après la connexion GATT et la négociation MTU et ne prouvent pas un défaut de couplage.
- **Corrections publiées :** `17b69ec` distingue les états `0x6e01` (application Nano non ouverte) et `0x5515` (Ledger verrouillée) et affiche une instruction de reconnexion ; `e3d2f05` ajoute cinq tests unitaires Jasmine ciblés ; `84e72f4` affiche l'aide dans la barre latérale. La correction de mock Ledger `f48d682` (test `removeNotification`) a permis de rétablir la CI.
- **Automatisation :** [Validate Angular 22 migration #40100966775](https://github.com/twister65/Nault/actions/runs/40100966775), conclusion **SUCCESS**, 114/114 tests Karma/Jasmine, Ledger/RPC/Playwright inclus. La cible `nault-android-test.vercel.app` a été vérifiée `READY` sur le déploiement `dpl_7BoU5jf5GXyzvr35M8VjeqEXH2hw` au commit applicatif `f48d682`. Aucun déploiement sur `tablet`, aucune fusion dans `master`.
- **Suite de validation :** envoi depuis un autre portefeuille contrôlé par l'utilisateur vers le compte Ledger Nault pendant que la clé est déconnectée, montant supérieur au seuil de réception configuré (valeur par défaut `0.000001 XNO`) ; vérifier `Incoming Balance`, l'indicateur `New`, une notification unique demandant `Reconnect` (et l'absence d'« Error catching block »/« Error unknown with ledger »), puis reprise de la réception une fois la clé reconnectée. Pour valider la reprise automatique, `pendingOption` doit être `amount` ou `date` et non `manual`. **Ce scénario n'est pas encore testé**. Ne jamais demander seed/PIN ni signer sans approbation sur la Ledger.

### Validation fonctionnelle Ledger Bluetooth — 24 octobre 2026 (ChromeOS)

**Connexion BLE initiale et deux reconnexions consécutives : VALIDÉES.** L'utilisateur confirme le fonctionnement sur Chromebook avec `https://nault-android-test.vercel.app` (Angular 22, code applicatif déployé au SHA `43ad84d`).

- **Couplage initial :** après réinitialisation des associations, `chrome://bluetooth-internals` détectait la Ledger mais Nault ne proposait pas immédiatement le couplage. Déconnecter la Nano X depuis cette page de diagnostic, puis relancer la sélection Web Bluetooth dans Nault, a permis le couplage et la connexion. Une session Bluetooth précédente ayant interféré reste une **hypothèse**, non une cause prouvée.
- **Journal utilisateur `btcon-console.log` :** une tentative de choix Bluetooth annulée par l'utilisateur (`TransportOpenUserCancelled: User cancelled the requestDevice() chooser.`), puis une connexion réussie (`[Ledger BLE] reconnect successful`). Après la fermeture d'une session GATT, **première reconnexion explicite réussie** (`forceReconnect: true, hadTransport: false`) ; après une deuxième fermeture, **deuxième reconnexion explicite réussie**, sans rechargement de la page et sans `Clear session`. Les deux reconnexions traversent la connexion GATT, la découverte des services/caractéristiques, `startNotifications`, la réponse MTU (6 octets), `MTU negotiated`, `getAppConfiguration` et `account address read successfully`. Trois messages `reconnect successful` dans la capture (connexion + deux reconnexions). Il subsiste une erreur `504` isolée sur `/configure-wallet`, sans incidence observée sur ce parcours.
- **Statut :** régression « seconde reconnexion » validée comme corrigée **sur ChromeOS uniquement** avec cette version ; ne pas extrapoler aux exécutables Electron Linux/Windows.
- **Prochains contrôles matériels :** mise en veille/verrouillage et application Nano fermée ; afficher un message clair de reconnexion au lieu d'erreurs Ledger lors d'un receive entrant ; ensuite transaction à faible montant avec confirmation sur appareil. Ne jamais demander seed/PIN. Aucun changement applicatif ni fusion dans `master` pour ce bilan.

### Validation fonctionnelle PWA — 24 octobre 2026 (ChromeOS)

**Résultat : validations principales RÉUSSIES.** L'utilisateur confirme installation en application ChromeOS, lancement de la PWA sans Wi-Fi et retour à la normale à la reconnexion. Diagnostics `ngsw/state` : Angular service worker 22.2.3, état `NORMAL`, deux manifestes actifs (`24acda4b…` et `780ae799…`), un client par version et file des tâches vide. Captures utilisateur : `pwa-console(1).log` et `pwa-network(1).har` (non archivées dans GitHub).

- Pendant la coupure Wi-Fi : plusieurs HTTP 504 dans la console (RPC `/proxy`, navigation `/configure-app`, polices Open Sans/Montserrat/Roboto Mono, et SVG), ainsi que connexions WebSocket échouées ; comportement compatible avec l'absence de réseau et/ou des ressources non présentes dans le cache du service worker. **Attention :** vérifier visuellement plus tard le rendu hors ligne de ces polices/icônes : le démarrage réussi ne prouve pas que toutes les ressources sont préchargées.
- Au retour du réseau : la console montre `WebSocket connected. Restoring account subscriptions` puis `pong`. Le HAR contient une connexion `/ws` **101 Switching Protocols**, quatre POST RPC `/proxy` **HTTP 200**, et deux préflights OPTIONS 204 ; la reconnexion est prouvée. Le HAR, pris surtout à la reconnexion, **ne comporte pas les 504**, observés dans la console.
- Le journal `ngsw/state` comporte `Driver.fetch(.../accounts): Failed to fetch` mais `Driver state: NORMAL` ; à surveiller uniquement si cela persiste une fois en ligne.
- **Reste à tester** : mise à jour PWA entre deux déploiements (nécessite un véritable changement de manifeste), et éventuellement premier chargement hors ligne de ressources iconographiques non précédemment visitées. Aucun nettoyage du stockage de portefeuille demandé.
- **Suite prioritaire** : Ledger Nano X Web Bluetooth sur Chromebook ; première et deuxième reconnexions sans rechargement, clé verrouillée ou application Nano fermée, signature de faible montant à l'accord de l'utilisateur, journaux nettoyés de tout secret.

### Décision définitive pour Angular 22 — conserver Karma/Jasmine (24 octobre 2026)

**Correction importante du suivi :** La migration du builder Angular Webpack vers `@angular/build:application` (esbuild/Vite) **n'a pas** remplacé le moteur de tests. Au dernier commit validé `43ad84d` (modifications applicatives validées au SHA `583ca06f`), `angular.json` contient bien `@angular/build:unit-test`, mais avec l'option **`runner: "karma"`**, `runnerConfig: "karma.conf.js"`. `package.json` contient `karma`, `jasmine-core`, `@types/jasmine` et les plugins Karma. Les **109/109 tests unitaires** annoncés dans ce document sont des tests **Karma/Jasmine**, et ne constituent pas une validation de Vitest.

- **E2E navigateur :** Playwright remplace Protractor, mais n'est pas un remplacement de Karma pour les tests unitaires.
- **Choix retenu :** garder `@angular/build:unit-test` avec `runner: "karma"` et Jasmine pour toute la validation fonctionnelle et la fusion Angular 22. Ne pas convertir les fichiers `.spec.ts` vers Vitest dans cette migration. Une étude Vitest pourra être rouverte comme chantier distinct après la fusion, uniquement sur décision explicite.
- **Source officielle :** [Angular : Migrating from Karma to Vitest](https://angular.dev/guide/testing/migrating-to-vitest) et [référence des API Vitest](https://vitest.dev/api/test).
- **Critères impératifs avant fusion Angular 22 :** compilation Web/PWA + Electron, lint, tests Ledger USB/BLE automatisés, tests RPC ciblés, smoke test Playwright, **109/109 tests unitaires Karma/Jasmine réussis**, contrôle des omissions/`skip`/`todo`, puis workflows applicables verts au SHA destiné à la fusion, ainsi que les validations fonctionnelles et de sécurité encore ouvertes.
- **Principe de reprise :** conserver Karma/Jasmine dans `upgrade/angular-22` jusqu'à la fusion dans `master`. L'expérimentation `experiment/angular22-vitest` reste sans intégration et ne doit plus être poursuivie dans le cadre de cette migration. Aucun changement dans `master` avant accord explicite.
- **Discipline documentaire jusqu'à la fusion Angular 22 dans `master` :** actualiser **ce fichier de référence à chaque jalon technique ou changement de statut de validation** (commit, lien CI, résultats, dépendances restantes, décisions et tests manuels). Ne jamais laisser une ancienne étape présentée comme le statut courant. Avant fusion, vérifier la CI au SHA destiné au merge, les validations matérielles et le bilan sécurité ; noter explicitement l'issue dans ce fichier lors de la préparation de la fusion. Cette règle ne constitue pas une tâche en arrière-plan automatisée.

**Essai expérimental effectivement exécuté (24 octobre 2026) :** branche [`experiment/angular22-vitest`](https://github.com/twister65/Nault/tree/experiment/angular22-vitest), commit de workflow [`c2817be`](https://github.com/twister65/Nault/commit/c2817be68b559afca68d6e0506fd1cad9e556fe1), [GitHub Actions #40090077620](https://github.com/twister65/Nault/actions/runs/40090077620) = **failure à la compilation TypeScript des tests** ; la suite Vitest n'a **pas** encore démarré. L'outil `refactor-jasmine-vitest` a modifié les mocks Jasmine sur le runner, **sans publier ces modifications dans `upgrade/angular-22`**. Principaux blocages :
- TS2688 sur `vitest/globals` dans `src/tsconfig.spec.json` (examiner `typeRoots` du TSConfig racine et l'usage d'imports explicites) ;
- `src/testing/component-test.module.ts` emploie encore `spyOn(...).and.returnValue(...)`, non pris en charge par la migration automatique car le fichier n'est pas `.spec.ts` ;
- mocks convertis `vi.spyOn<any>` avec génériques incorrects ; `vi.fn().mockResolvedValue()` sans argument et `vi.mocked(...).mock.lastCall` potentiellement `undefined` ou typé comme tuple vide ;
- les comportements dépendant de `jasmine.clock()` ou de `fakeAsync`/Zone.js et les tests sensibles RPC/Ledger nécessitent une revue sémantique approfondie, au-delà de la compilation.

**Décision utilisateur du 24 octobre 2026 :** arrêter le chantier Vitest pour Angular 22 et **conserver Karma/Jasmine**. L'essai expérimental et ses échecs restent archivés pour référence seulement ; aucune conversion Vitest ne doit être intégrée à `upgrade/angular-22` ni à `master` dans cette migration. La priorité passe aux **tests fonctionnels sur Android Test, ChromeOS, Linux et Windows**, notamment Web Worker PoW, Ledger USB/Bluetooth, service worker/PWA et packaging, puis aux validations multisignature, Sweeper et S01 selon le périmètre déjà convenu. Inscrire chaque résultat, correctif, lien CI et éventuel blocage dans ce document jusqu'à la fusion. Le workflow expérimental n'est pas une étape de validation obligatoire.

**Déploiement de référence pour les prochains tests fonctionnels :** Vercel `https://nault-android-test.vercel.app` a été vérifié en état `READY` sur le commit applicatif/documentaire `43ad84d` de `upgrade/angular-22` avant cette décision. Aucune modification du déploiement n'est requise pour retenir Karma/Jasmine. Les corrections futures seront déployées et vérifiées séparément, après CI verte.

### Nettoyage des dépendances Angular 22 — 24 octobre 2026 (reprise après interruption)

**Branche exclusivement modifiée :** `upgrade/angular-22`. **Dernier commit applicatif :** [`583ca06`](https://github.com/twister65/Nault/commit/583ca06f26d740b50c1f56c071542c8d2f4df2eb). **Dernière validation complète Angular 22 :** [#40083947910](https://github.com/twister65/Nault/actions/runs/40083947910) (conclusion `success`). CodeQL [#40083947859](https://github.com/twister65/Nault/actions/runs/40083947859), Linting [#40083947867](https://github.com/twister65/Nault/actions/runs/40083947867) et synchronisation lockfile [#40083947857](https://github.com/twister65/Nault/actions/runs/40083947857) : `success`.

- **E2E :** remplacement de Protractor (test `Welcome to app!` obsolète) par Playwright et un vrai smoke test Chrome du portefeuille ([`9f04c32`](https://github.com/twister65/Nault/commit/9f04c32ce06bc74d865162df402d61a21f464e6c)). Chaînes `request@2.88.2`, `har-validator@5.1.3`, `uuid@3.4.0` et `debug@3.2.6` supprimées.
- **Packaging :** `electron-builder` mis à jour vers `26.18.0` sans faire la migration cassante du runtime `electron-updater` ([`b5221a1`](https://github.com/twister65/Nault/commit/b5221a1e8aab069047189cc7a16b18d6ea5dcb57)). Anciennes chaînes `@npmcli/move-file`, `npmlog@6`, `are-we-there-yet@3`, `gauge@4` et `glob@8` retirées des avertissements npm.
- **Angular :** ancien builder Webpack et `worker-loader` remplacés par `@angular/build:application` (esbuild/Vite), et `@angular/build:unit-test` pour Karma ; ajout de `stream-browserify`, `buffer`, `less` et `karma-coverage` selon les besoins identifiés par CI, migration du Web Worker CPU vers `new Worker(new URL(..., import.meta.url))` ([`a13c83b`](https://github.com/twister65/Nault/commit/a13c83b8089a64b363a758cde7d571f3740a919e)). La production Web, le manifeste PWA `dist/ngsw.json`, le renderer Electron et les tests passent. **La compilation ne prouve pas encore le fonctionnement matériel du PoW CPU.**
- **Régressions CI :** le script `scripts/check-deprecated-dependencies.cjs` fait échouer `Validate Angular 22 migration` si Protractor, `request`, `har-validator`, `uuid@3`, l'ancien builder `@angular-devkit/build-angular`, `@ngtools/webpack` ou `worker-loader` réapparaissent, ou si `npm ci` émet une nouvelle dépréciation non autorisée ([`40d9556`](https://github.com/twister65/Nault/commit/40d95567f377a5a0b0733d6ca5abb48f08a2b4d8)).
- **Overrides morts :** suppression des entrées `overrides.request` et `overrides['@angular-devkit/build-angular']` devenues inutiles, sans toucher aux pins de sécurité toujours applicables ([`583ca06`](https://github.com/twister65/Nault/commit/583ca06f26d740b50c1f56c071542c8d2f4df2eb)).
- **Couverture automatique sur le dernier commit :** build Web/PWA, Electron, lint, simulation Ledger USB/BLE, **37 tests RPC ciblés**, smoke test Playwright Chrome, **109 tests unitaires Angular complets**. Tests physiques Ledger USB/Bluetooth et CPU PoW, essais de paiement/signature, packages Electron Linux/Windows réels et PWA offline à exécuter séparément.

**Deux avertissements npm restants, expliqués par [l'inventaire #40083508627](https://github.com/twister65/Nault/actions/runs/40083508627) :**

| Avertissement | Dépendance parente | État |
|---|---|---|
| `boolean@3.2.0` | `electron-builder@26.18.0 → app-builder-lib → @electron/get@3 → global-agent@3 → roarr` ; dépendance optionnelle de packaging | Attente de mise à jour upstream compatible |
| `glob@7.2.3` | `electron-builder → @electron/asar@3`, `karma@6`, `karma-coverage-istanbul-reporter → istanbul-lib-source-maps → rimraf` | Attente de migrations upstream ou remplacement ciblé de la chaîne |

Le script CI autorise explicitement **uniquement ces deux couples versionnés**, et signale tout nouvel avertissement. Ne pas masquer ces messages, désactiver les contrôles, imposer un `overrides` majeur à `@electron/get`, `@electron/asar` ou Karma, ni retirer les tests sans équivalent. La suppression à 100 % des avertissements nécessitera une migration distincte de ces parents avec validation des artefacts Electron et/ou de la suite de tests.

**Pour la suite :** conserver la nouvelle chaîne esbuild, faire les essais manuels prioritaires de PoW CPU / Web Worker et des transports Ledger sur ChromeOS, Linux, Windows et Android ; valider PWA et packaging avant toute fusion dans `master`. Conserver le contrôle CI bloquant. Le présent ajout documentaire `[skip ci]` n'est pas un nouveau résultat de tests applicatifs.

### Résultat de la CI Angular 22 — 24 octobre 2026 : première validation intégrale verte

**Confirmé sur le commit applicatif [`33c1292`](https://github.com/twister65/Nault/commit/33c12920163aa61bc187dc535eb5f337c8ea6c91).** Le workflow [Validate Angular 22 migration #40069385013](https://github.com/twister65/Nault/actions/runs/40069385013) s'est terminé avec la conclusion GitHub **success**. Toutes les étapes successives sont **success** : installation reproductible, versions Angular 22/TypeScript 6/ESLint 10, build production Web et manifest PWA, build Electron, lint, tests automatisés Ledger USB/BLE, tests ciblés Nano/RsNano RPC et **109/109 tests unitaires Angular réussis** (Chrome Headless 155). Aucun test ignoré dans le workflow principal. Le détail des suites ciblées doit être lu dans le journal, pas extrapolé du résultat global.

Pour ce même SHA applicatif, les workflows [CodeQL Advanced #40069384974](https://github.com/twister65/Nault/actions/runs/40069384974), [Linting #40069385004](https://github.com/twister65/Nault/actions/runs/40069385004) et [Docker Hub #40069384965](https://github.com/twister65/Nault/actions/runs/40069384965) sont aussi **success**. Les workflows `Repair Angular 22 legacy dependencies` et `Migrate Angular 21 to 22 (sandbox)` sont **skipped** car leurs conditions d'exécution ne sont pas remplies, pas en échec.

**Points toujours ouverts avant fin de migration :** avertissements npm de dépendances dépréciées (incluant la voie Webpack Angular), essais Ledger Bluetooth matériels et autres tests fonctionnels non couverts par la CI. Les builds et les tests automatisés ne valent pas validation du comportement matériel ni audit de sécurité complet ; le `master` n'a pas été fusionné. Le présent ajout documentaire est publié avec `[skip ci]`, donc les validations ci-dessus portent sur le SHA applicatif `33c1292`, et non sur un nouveau SHA documentaire.

### Reprise 3 — compilation des tests RPC et Angular sous TypeScript 6 (24 octobre 2026)

- La [CI #40068764256](https://github.com/twister65/Nault/actions/runs/40068764256/job/120797469898) valide l'installation, les versions Angular/TS/ESLint, le build Web avec PWA, le build Electron, le lint (7 avertissements, aucune erreur) et les vérifications automatisées Ledger USB/BLE.
- Blocage à l'étape `Run focused Nano and RsNano RPC tests` : échec **de compilation des fichiers de test TypeScript**, avant exécution des tests. Dans cette compilation Karma, d'autres specs hors des cinq `--include` provoquent aussi des erreurs.
- Diagnostics TS2454 dans `configure-app.component.spec.ts`, TS18048 dans `app-settings.service.spec.ts` et `rpc-transport.service.spec.ts`, TS18049 sur `options.signal`, TS18046 sur `catch(error)` et TS2345 dans `websocket.service.spec.ts` (fixture de confirmation partielle).
- Correctif **uniquement dans quatre fichiers `.spec.ts`** publié par [`33c1292`](https://github.com/twister65/Nault/commit/33c12920163aa61bc187dc535eb5f337c8ea6c91). Initialisation/affectation explicite du résolveur ; vérification explicite que les entrées existent ; assertions RPC inchangées sur la politique fetch (`redirect:error`, `credentials:omit`, `referrerPolicy:no-referrer`, Authorization explicite, AbortSignal), et vérification de la réponse d'erreur de proxy ; objet `NanoConfirmation` complet dans le test WebSocket.
- **CI en vérification :** [#40069385013](https://github.com/twister65/Nault/actions/runs/40069385013), commit `33c1292`. Avant de reprendre les tests manuels, confirmer **toutes** les étapes, dont les tests RPC exécutés réellement et la suite entière Angular, sur ce SHA. Les tests matériels de signature, le nettoyage des dépendances deprecated et la migration Webpack restent non résolus. Aucun merge `master`.

### Correctif CI Electron du 24 octobre — reprise 2

La validation [#40068217213](https://github.com/twister65/Nault/actions/runs/40068217213) a franchi les étapes de préparation et de compilation Web, puis a échoué sur deux erreurs restantes dans `desktop-app/src/desktop-app.ts` :
- TS2769 ligne 103 : surcharge `BrowserWindow.on` incompatible avec un type d'événement `string` élargi par `['resize', 'move'].forEach(...)`. Remplacé par `win.on('resize', saveState)` et `win.on('move', saveState)`.
- TS2588 ligne 284 : réaffectation de `currentWindow` déclaré `const`. Le gestionnaire `closed` réinitialise désormais correctement `mainWindow = null`.

**Correctif publié :** [`8ba20a6`](https://github.com/twister65/Nault/commit/8ba20a615f0e399a6ab7c97303c8bbb1600fc443), uniquement sur `upgrade/angular-22`. **Nouvelle CI :** [#40068764256](https://github.com/twister65/Nault/actions/runs/40068764256) ; vérifier son résultat avant de déclarer les tests automatiques validés. Le nettoyage des dépendances dépréciées reste distinct et ouvert.

## Reprise CI du 24 octobre 2026 — correctif Electron / dépendances

**Branche :** `upgrade/angular-22`; **commit publié :** [`aca84c0`](https://github.com/twister65/Nault/commit/aca84c07a836a114cb03731d5956296cc73a1a77). **Ne pas fusionner dans `master`.**

- Échec initial : [Validate Angular 22 migration #40016611697](https://github.com/twister65/Nault/actions/runs/40016611697), sur le commit `fdfaee7`. `npm ci`, assertion Angular/TypeScript/ESLint, build Web production et manifeste PWA réussis ; `npm run desktop:build` échoue à `desktop:compile` avec des erreurs strictes TypeScript 6 (implicit any, nullable, catch unknown, déclarations `hw-app-nano`/`node-hid`, `lib.esnext.intl.d.ts`). Les étapes de lint, de tests USB/BLE, RPC et de suite Angular **n'ont pas été exécutées** dans cette tentative.
- `deprecated.log` du 24/10 : `@zxing/library@0.23.0` exige Node >=24 (ancien runner Node 22.22.3) ; dépréciations `uuid@3.4.0`, `request@2.88.2`, `har-validator@5.1.3`, `glob@7.2.3`/`8.1.0`, `@npmcli/move-file@2.0.1`, `npmlog@6.0.2`, `are-we-there-yet@3.0.1`, `gauge@4.0.4`, `debug@3.2.6`, `@ngtools/webpack@22.2.4`, `@angular-devkit/build-angular@22.2.4`. **Ces dépréciations ne sont pas encore résolues**.
- Correctif `aca84c0` : types des fenêtres, callbacks et timer Electron, contrôles d'erreur stricts de Ledger, `parentPort` non nullable, timer BLE nullable, déclaration locale `hw-app-nano`, `skipLibCheck` pour erreurs de déclarations externes, et Node 24.15.0 dans le workflow Angular 22. Aucun changement intentionnel des APDU, signatures ni protocoles RPC/IPC.
- Validation requise : [nouvelle exécution Angular 22 #40068217213](https://github.com/twister65/Nault/actions/runs/40068217213), ainsi que CodeQL, Linting, dépendances critiques et autres contrôles applicables. **Ne pas considérer CI verte tant que les conclusions `success` ne sont pas confirmées pour le SHA de tête.**
- À faire : attribuer les dépendances dépréciées à leurs vrais parents via `npm explain` et/ou le lockfile, puis migrer progressivement sans imposer des `overrides` majeurs ; la migration Webpack vers `@angular/build:application` doit préserver PWA, Electron et polyfills et être testée séparément. Examiner aussi la compatibilité et la couverture du vieux Protractor/Karma et ne pas les supprimer pour masquer l'échec des tests.
- Attention : `skipLibCheck` aide à isoler les fichiers `.d.ts` externes, **ne prouve pas leur compatibilité runtime**. Les essais matériels USB/BLE et les tests de signature restent nécessaires.

---

## Bilan de validation ChromeOS — session du 23 octobre 2026 (terminée)

**Environnement de test :** Chromium/Chrome sur Chromebook (ChromeOS), dans une fenêtre de navigation privée, DevTools ouverts, site **https://nault-android-test.vercel.app**. Les tests matériels ont été réalisés avec une **Ledger Nano X en USB, Bluetooth désactivé**. Ils ne démontrent pas la compatibilité d'une Nano S Plus USB ni celle du Bluetooth. Le portail de test Vercel utilise le code Angular 22 de la branche `upgrade/angular-22`, commit applicatif [`fdfaee7`](https://github.com/twister65/Nault/commit/fdfaee76e109326e84573120793ac38b1e3d8555) pour les derniers contrôles UI. Le déploiement correspondant [`dpl_8RSkPdAqHwppikpHUw9uPMDEJzzv`](https://vercel.com/olaverre-1312/nault-android-test/8RSkPdAqHwppikpHUw9uPMDEJzzv) est **READY** et l'alias `nault-android-test.vercel.app` a été confirmé.

**Tests réalisés et résultats communiqués par l'utilisateur :**

| Scénario | Résultat | Détails observés |
|---|---|---|
| 1. Interface / traductions | **OK** | Navigation et textes de Nault, sans erreur bloquante au lancement |
| 2. RPC et WebSocket | **OK** | Configuration serveur, connexion réseau et communications RPC/WS vérifiées |
| 3. Connexion Ledger USB | **OK** | Nano X USB avec Bluetooth désactivé ; connexion et fonctionnement de Nault validés sur ChromeOS |
| 4A. Verrouillage et reconnexion USB | **OK avec trace à suivre** | Reconnexion réussie après déverrouillage ; durant le verrouillage, log `Check ledger status failed` / `TransportStatusError: UNKNOWN_ERROR (0x5515)`, `statusCode: 21781`. Cette trace n'a pas empêché la reconnexion ; ne pas conclure à une panne permanente ni normaliser ce statut sans étude |
| 4B. Débranchement et reconnexion physique USB | **OK** | Nano X rebranchée et reconnue, sans nécessité de redémarrer Nault |
| Fiche de compte → Advanced Options | **OK après correctif** | Panne runtime `onDestroy` puis `factory` reproduite avant correctif. Après `fdfaee7`, plus de TypeError ; panneau visible avec `Confirmed Blocks: 111 / 111` (100 %) et `Enable Remote Signing / Multisig` décoché |
| Fiche de compte → Confirm address on Ledger | **OK après correctif** | Bouton autrefois absent de la fiche, ajouté par `80dbf06`/`fdfaee7`. Vérification de l'adresse sur la Nano X confirmée par l'utilisateur |
| Régression bootstrap Transloco | **OK après correctif** | Page blanche `NG0201` éliminée par [`7cfc41a`](https://github.com/twister65/Nault/commit/7cfc41a272912265c7b8ed1e81f4597811d6f588), application ouverte sans erreur Angular de bootstrap |

**Point de forme :** dans `Accounts`, une icône `Confirm address on Ledger` existait déjà pour les portefeuilles Ledger ; elle manquait sur la fiche `Account Details`, qui n'affichait que Copier et QR. Le nouveau bouton de fiche est désormais validé. Le panneau `Advanced Options` *n'envoie aucun bloc sur le réseau* : il affiche les statistiques et un réglage optionnel pour la signature distante. L'utilisateur a laissé cette option décochée ; l'activation et la multisignature ne sont pas encore testées.

**Avertissement non bloquant observé dans la console :** `Permissions policy violation: unload is not allowed in this document`. À traiter éventuellement plus tard, sans le confondre avec les anciennes erreurs Angular.

**Tests restant à faire — reprise dans un NOUVEAU CHAT dédié au Bluetooth** (utilisateur prévoit le 24 octobre 2026, sans automatisation) :
- Ledger Nano X via **Web Bluetooth** sur ChromeOS, avec un appareil chargé et proche du Chromebook ; test d'association, connexion initiale, lecture du compte et confirmation d'adresse.
- Déconnexion volontaire et **reconnexions Bluetooth successives**, sans rechargement de la page (notamment seconde reconnexion, erreurs GATT `stopNotifications`/`writeValue`, état `Ledger get status` et action `Clear session` observés lors de précédents essais).
- Tester le cas clé Ledger verrouillée / application Nano fermée, puis déverrouillage et reprise ; vérifier qu'aucune reconnexion implicite n'est tentée sans geste utilisateur.
- Distinguer Web Bluetooth de ChromeOS de l'intégration Bluetooth **Electron Linux/Windows** ; ne pas extrapoler les résultats entre plateformes.
- En cas d'erreur, sauvegarder les logs Console/Network *sans seeds, clés privées, données de signature sensibles ni en-têtes RPC authentifiés*. Demander explicitement la ressource manquante en cas d'accès Vercel limité (403).

**Hors périmètre des validations acquises :** Ledger Nano S Plus, Bluetooth, transferts réels, réception/diffusion de transactions et PoW annulé, génération et signature MuSig, Sweeper, seeds de hot wallet et sécurité S01, builds Electron Linux/Windows, CI complète. `master` **non modifiée / non fusionnée**. La réussite des tests USB ne prouve pas la sécurité de signature cryptographique ni le fonctionnement multisig.

---

## Régression Account Details — Advanced Options et contrôle d'adresse Ledger (23 octobre 2026)

**Retour utilisateur ChromeOS :** tests 1 (interface/traductions), 2 (RPC/WebSocket) et 3 (Ledger Nano X USB avec Bluetooth désactivé) réussis. Test 4A : verrouillage puis reconnexion USB réussis, console `TransportStatusError UNKNOWN_ERROR (0x5515)` lors du verrouillage ; pas encore de décision de modifier cette gestion du statut. En ouvrant `Advanced Options` sur une fiche de compte, erreurs runtime `TypeError: Cannot read properties of undefined (reading 'onDestroy')`, puis `factory`, dans `main.aca0513b3b8dd50e.js` lors de la création de la vue via `*ngIf`. La vérification de l'adresse Ledger était introuvable sur la fiche : celle-ci affichait uniquement Copier et QR.

**Cause isolée :** `src/app/components/account-details/account-details.component.html` utilise deux occurrences du pipe `translocoDecimal` dans la sous-vue `showAdvancedOptions`, mais `@jsverse/transloco-locale` n'est ni présent dans les dépendances, ni importé dans le module. La compilation de production n'a pas détecté le pipe absent, lequel provoque à l'instanciation les échecs `onDestroy` et `factory`. Le pipe Angular `number` est déjà utilisé dans la même zone pour le pourcentage.

**Correctifs publiés uniquement sur `upgrade/angular-22` :**
- [`80dbf06`](https://github.com/twister65/Nault/commit/80dbf06d95e9464f7146a463e0e87951267c28e6) : dans `account-details.component.ts`, ajoute l'accès à `LedgerService`, un getter `isLedgerWallet` et `showLedgerAddress` utilisant `getLedgerAccount(account.index, true)`, avec contrôle de statut et notifications semblables à l'action existante dans `Accounts`. Aucune modification de la signature ou de LedgerService.
- [`fdfaee7`](https://github.com/twister65/Nault/commit/fdfaee76e109326e84573120793ac38b1e3d8555) : remplace les deux pipes manquants par `number:'1.0-0'` ; ajoute à l'en-tête de `Account Details` une icône Ledger conditionnelle à `walletAccount && isLedgerWallet`, côté Copier et QR. Cette icône ne doit pas être affichée pour un compte externe.

**Déploiement de contrôle :** projet `nault-android-test`, commit `fdfaee7`, [Vercel](https://vercel.com/olaverre-1312/nault-android-test/8RSkPdAqHwppikpHUw9uPMDEJzzv) id `dpl_8RSkPdAqHwppikpHUw9uPMDEJzzv`. Déclenché avec `commandForIgnoringBuildStep: 'exit 1'` pour cet appel, comme le build réussi précédent. **READY confirmé** ; statut GitHub/Vercel `success` et alias `nault-android-test.vercel.app` vérifié pointant vers ce même déploiement. **Runtime désormais validé par l'utilisateur sur ChromeOS** : `Advanced Options` s'ouvre sans TypeError ; statistiques affichées et `Confirm address on Ledger` fonctionne avec Nano X USB. Voir le bilan de session ci-dessus.

**Limites :** le succès du build seul ne valide pas encore ce parcours runtime. `0x5515` au verrouillage reste à étudier si des problèmes fonctionnels persistent ; il ne constitue pas à lui seul une panne de reconnexion. Pas de merge `master`, pas de transaction réelle, pas de S01 ni de multisig fonctionnelle dans ce lot.

---

## Incident runtime Android — page blanche après le premier build Angular 22

**Observation de l'utilisateur (23 octobre 2026) :** `AndroidTest-console` après déploiement du commit `ba35cc2` sur `nault-android-test.vercel.app`. La console montre deux occurrences `main.f290bb30901e26e2.js:1 ERROR xt: NG0201` avec un échec d'injection de dépendance Angular dès le bootstrap (`Object.ɵfac`, `Pc.get`). La trace ne donne pas le token d'injection à cause de la minification. Une autre erreur `evmAsk.js:76 Cannot redefine property: ethereum` paraît liée à un script injecté par extension et ne démontre pas la cause de la page blanche.

**Diagnostic prioritaire :** `src/app/transloco/transloco-root.module.ts` contenait toujours une configuration ancienne basée uniquement sur les tokens `TRANSLOCO_CONFIG` et `TRANSLOCO_LOADER`, sans les autres dépendances de `TranslocoService`. Or `AppComponent` injecte `TranslocoService` au démarrage, et le contrat actuel de `@jsverse/transloco@8.4.x` exige d'enregistrer les providers via `provideTransloco({config, loader})`. Ceci est une cause **plausible et concrète** de `NG0201`, non encore confirmée par un test d'ouverture du site après correctif. Référence : https://jsverse.gitbook.io/transloco/getting-started/installation (exemple NgModule).

**Correction publiée :** [`7cfc41a`](https://github.com/twister65/Nault/commit/7cfc41a272912265c7b8ed1e81f4597811d6f588) remplace les deux providers legacy par `provideTransloco` complet ; conserve la langue `en`, le fallback, les paramètres existants et le chargeur de fichiers `assets/i18n`. Ne touche pas aux opérations cryptographiques.

**Déploiement de contrôle :** Vercel `nault-android-test` [`dpl_EAxSp3zoM6woehzivSJo77BW5VFt`](https://vercel.com/olaverre-1312/nault-android-test/EAxSp3zoM6woehzivSJo77BW5VFt), commit `7cfc41a`, production test. **READY confirmé** via Vercel et statuts GitHub `success` pour les deux projets `nault-android-test` et `nault-tablet-css-test`. L'alias officiel `https://nault-android-test.vercel.app` a été vérifié et pointe vers ce déploiement. La construction a été déclenchée en contournant pour cet appel la configuration `Ignored Build Step` qui annulait les premières tentatives. **Runtime confirmé par l'utilisateur** : ouverture de Nault sans erreur de bootstrap après correction du provider Transloco. Voir bilan ChromeOS ci-dessus.

**À vérifier ensuite :** demander à l'utilisateur l'ouverture en fenêtre privée ou cache mis à jour et console; vérifier disparition de `NG0201` ; si persiste, obtenir la nouvelle trace et produire un build diagnostic avec source maps *sur environnement privé uniquement*, sans exposer secrets ou symboles. Le déploiement `Ready` ne valide pas le runtime, Ledger, BLE/WebHID, RPC, MuSig, Sweeper ni S01. Aucun merge `master`.

---

## Validation Vercel Angular 22 — 23 octobre 2026 : deux builds Ready

**Résultats vérifiés :** l'utilisateur a transmis les logs complets `Vercel-ba35cc2.log` et `Vercel-1c5a29c.log`. Les deux compilations Vercel du projet `nault-tablet-css-test`, branche `upgrade/angular-22`, ont **réussi**, sans aucune erreur TypeScript :

- [`ba35cc2`](https://github.com/twister65/Nault/commit/ba35cc2cb88853aa5895257be52ed5349ca71354) : [déploiement Vercel](https://vercel.com/olaverre-1312/nault-tablet-css-test/F6mSNzVYeeJrKXj85Vw9fBwVJVdG), statut GitHub **success** ; `Build Completed` et `Deployment completed` dans le log.
- [`1c5a29c`](https://github.com/twister65/Nault/commit/1c5a29c3509aac6933fff0d02e665f37e39a1f54) : [déploiement Vercel](https://vercel.com/olaverre-1312/nault-tablet-css-test/3AhQvQmTv8Ly9hsDKbRTrQAp9kdL), statut GitHub **success** ; `Build Completed` et `Deployment completed` dans le log. Ce deuxième commit n'apporte qu'une mise à jour de la documentation.

**Empreinte de compilation identique :** `dc1b1d697aeb4584` ; bundle principal `main.f290bb30901e26e2.js` (2,55 MB brut), total initial ~3,09 MB brut / ~620,28 kB estimés transférés. La compilation produit les assets, `index.html` et le service worker. Conclusion vérifiée : **1 060 → 0 erreurs de typage TypeScript** sur le build Web de production ; la migration Angular 22 passe désormais `npm run wallet:build` sur Vercel.

**Avertissements non bloquants conservés :** de nombreuses dépendances npm encore dépréciées (`request@2.88.2`, `uuid@3.4.0`, `glob` anciennes versions, etc.) ; builder Webpack `@angular-devkit/build-angular:browser` déprécié au profit de `@angular/build:application` ; navigateurs cibles dépassant la politique Angular 22 ou ES5 ; avertissements de dépendances CommonJS/AMD `events` (Ledger transport) et `hermes-channel`. Ne pas interpréter les déploiements Ready comme une suppression de ces avertissements.

**Prochaines validations :** contrôler séparément tests unitaires, lint, CodeQL, workflow GitHub Actions, build Electron Ubuntu/Windows, compatibilité PWA/Android/Chromebook et parcours de Ledger USB/WebHID/BLE ; tests spécifiques de non-régression des chemins de signature hors ligne, gestion du PoW annulé, MuSig stages 0–3 et Sweeper. La multisignature réelle et la remédiation S01 du hot wallet sont des chantiers distincts. **Ne pas fusionner vers `master` et ne pas publier en production sans validation et accord de l'utilisateur.**

**Consigne de continuité :** les logs détaillés du projet Vercel n'étaient pas directement accessibles au connecteur (403). Si un prochain déploiement échoue et que l'accès est refusé, demander immédiatement le journal de build à l'utilisateur plutôt que de déduire des erreurs de GitHub Actions d'un autre SHA.

---

## Reprise du 23 octobre — dernier diagnostic Vercel isolé sur `95a8a19`

**Log fourni par l'utilisateur :** `vercel-95a8a19.log`. Déploiement Vercel `nault-tablet-css-test`, branche `upgrade/angular-22`, commit [`95a8a19`](https://github.com/twister65/Nault/commit/95a8a198e4127cbcda44459ad9b5a02b0e51c9fe). **1 erreur TypeScript** (`TS2345` dans `src/app/components/sweeper/sweeper.component.ts:547`, argument `string` au lieu de `number` dans `wallet.accounts`). La ligne finale `BUILD_UTILS_SPAWN_1` est la conséquence, pas une seconde erreur TypeScript. Les bundles navigateur étaient générés, mais le processus `wallet:build` a échoué. Les avertissements distincts restants concernent les modules CommonJS (`events`, `hermes-channel`), l'outillage Angular Webpack déprécié, des dépendances npm obsolètes et les navigateurs non pris en charge.

**Progrès mesuré :** de **1 060 diagnostics initialement à 1 seul** sur `95a8a19` ; **1 059 diagnostics éliminés (~99,91 %)**. Cela ne garantit pas l'absence d'erreurs sur le commit suivant.

**Correctif publié sur `upgrade/angular-22` :** [`ba35cc2`](https://github.com/twister65/Nault/commit/ba35cc2cb88853aa5895257be52ed5349ca71354) — conversion décimale de `this.startIndex` et `this.endIndex` via `parseInt(..., 10)` avant l'appel à `wallet.accounts` dans `sweeper.component.ts`. Les boucles de dérivation déjà présentes emploient le même `parseInt`, aucune modification des algorithmes de dérivation ni des transferts.

**Validation requise :** attendre le résultat effectif du build Vercel de `ba35cc2` ou d'un commit contenant la correction (si son statut est inaccessible, demander immédiatement le journal à l'utilisateur). Ne déclarer Angular 22 « compilable sur Vercel » qu'après succès explicite. Vérifier aussi `npm run wallet:build`, `npm run wallet:build-desktop` / `npm run desktop:compile`, lint, tests, CodeQL, et les workflows PWA/Android/Chromebook/Ubuntu/Windows nécessaires. Attention : les chemins de signature Ledger/multisig/Sweeper et le PoW ont été adaptés en amont pour accepter des états nullables ; une compilation réussie **ne prouve pas** la validité fonctionnelle ni la sécurité des opérations financières. Les tests de multisignature réels, ainsi que le chantier de sécurité S01/hot wallet, restent séparés. Ne pas fusionner dans `master` sans validations et accord.

**Communication :** lorsque les logs Vercel ne sont pas accessibles par connecteur (403 du scope `olaverre-1312`), demander sans tarder un fichier journal à l'utilisateur, sans multiplier les tentatives inutiles.

---

## Reprise du 23 octobre — log Vercel `bddc6d3` : 78 diagnostics TypeScript

**Log exact de l'utilisateur** : fichier `Vercel-bddc6d3.log`, build Vercel `nault-tablet-css-test`, branche `upgrade/angular-22`, commit [`bddc6d3`](https://github.com/twister65/Nault/commit/bddc6d34ab5b18e5af3729927ff948787895f8ac). **78 diagnostics TypeScript** sur 4 fichiers, **et une 79ᵉ ligne `BUILD_UTILS_SPAWN_1`**, qui n'est que la conséquence du build `npm run wallet:build` sorti avec code 1. Ne pas annoncer « 79 diagnostics TS ». Les bundles navigateur étaient générés, mais la compilation finale n'a pas réussi. Répartition : **46 Sweeper, 30 Sign, 1 ModalService, 1 NanoBlockService** ; aucun diagnostic MuSig ou MultisigComponent. Cela représente **982 erreurs éliminées sur 1 060 initialement (~92,6 %)** sur ce commit mesuré. Les warnings npm sur les dépendances dépréciées, CommonJS, le builder Webpack et les navigateurs non supportés sont distincts de ces 78 erreurs bloquantes.

**Corrections publiées après ce log** (sur `upgrade/angular-22` uniquement) :
- [`93b6187`](https://github.com/twister65/Nault/commit/93b6187f3aab7d2709a32b0380b709f1a784eb7c) : champs nullables / types des blocs et clés de `Sign`, index des participants et garde sur la clé MuSig, blocs temporaires pour calcul d'empreinte initialisés avec chaînes vides.
- [`8c49845`](https://github.com/twister65/Nault/commit/8c49845a87a5a18f69d316f3bf505b5744619c6f) : `NanoBlockService.signOfflineBlock` accepte un compte manuel ne contenant que `keyPair`, vérifie l'index Ledger et la présence du bloc précédent quand nécessaire, et retourne `null` en cas de PoW indisponible. `signStateBlock` dépend uniquement de `keyPair`.
- [`fe742e7`](https://github.com/twister65/Nault/commit/fe742e7d88a87221bc4ee2d4ea52973a926d199a) : `Sign` refuse les états incomplets et les échecs du PoW plutôt que de poursuivre la publication ; garde l'absence de signature et de compte, type les blocs signés. 
- [`087415e`](https://github.com/twister65/Nault/commit/087415efbd00589d74f50db56412e48bbbc2ed80) : `Sweeper`, typage des structures des blocs pending, des clés, compteurs et callbacks ; remplace les callbacks avec `function().bind(this)` par des flèches conservant le même contexte ; convertit la limite RPC numérique ; stoppe l'envoi lorsque le PoW ou le hash précédent est absent, au lieu de publier un bloc incomplet.
- [`fe5bc46`](https://github.com/twister65/Nault/commit/fe5bc465e6db3b2127c551e2562844b876f92eef) : annotation explicite du payload legacy `ModalService.showAccount` (encore de type `any`, contrat à préciser après identification des consommateurs).
- [`c09d9df`](https://github.com/twister65/Nault/commit/c09d9df1cb63a929d646f02776337d2e696cacc2) : vérification explicite du signataire juste avant l'appel de signature hors-ligne.

**État de vérification après correction :** les commits ont été publiés, mais les **nouveaux résultats complets Vercel/CI ne sont pas encore confirmés** ; le dernier nombre confirmé reste **78** pour `bddc6d3`. Il serait incorrect de déclarer qu'il ne reste plus aucune erreur. Chercher le build du SHA final, comparer les nouveaux diagnostics et traiter les erreurs de typage éventuellement introduites par les contrats explicites. Le contrôle Vercel peut échouer sur les premiers commits intermédiaires du lot, avant l'application des suivants.

**Précautions de sécurité :** ce lot touche désormais aux entrées de la signature manuelle / Ledger et au chemin de sweep. Avant fusion, réaliser des tests de non-régression avec mocks : signer un bloc valide, refuser un signataire absent, annulation Ledger, PoW `null`, import de clé manuelle, open/receive/send/change, réussite/échec RPC, balayage multi-index sans fonds réels et callback de réception/envoi. Ne pas confondre compilation et validation cryptographique. Ne pas réaliser de sweep avec fonds ou de test multisig réel sans validation explicite. **S01 hot wallet et refonte multisig restent distincts.** Aucun merge `master` et aucune mise en production autorisés.

---

## Reprise sur logs Vercel du 23 octobre 2026 — MuSig sans diagnostic

**Log reçu de l'utilisateur :** `vercel.log`, déploiement Vercel sur `upgrade/angular-22` au commit [`feec2f7`](https://github.com/twister65/Nault/commit/feec2f73c6cfab9b4857aad07a6a1463f89b5534). Le log affiche **132 erreurs TS** et aucune dans `musig.service.ts`. Depuis les **1 060 erreurs** initiales, il en reste 12,45 %, soit **928 diagnostics éliminés (87,55 %)**, pour cette mesure **avant les correctifs listés ci-dessous**. Génération des bundles navigateur réussie mais `npm run wallet:build` finit avec code 1. Deux avertissements CommonJS sont présents (`events`, `hermes-channel`) et plusieurs dépendances npm restent dépréciées (`request`, `uuid@3`, `@angular-devkit/build-angular@22`, etc.) ; ce sont des sujets distincts des erreurs TypeScript.

**Répartition mesurée du log Vercel :** `sweeper.component.ts` **62**, `sign.component.ts` **50**, `multisig.component.ts` **18**, `modal.service.ts` **1**, `nano-block.service.ts` **1**. Aucune erreur MuSig, aucun nouveau diagnostic dans les écrans import, configuration, export ou keygenerator.

**Correctifs de cette reprise publiés uniquement sur `upgrade/angular-22` :**
- [`907b5e6`](https://github.com/twister65/Nault/commit/907b5e66ba3facbeba5aeabe68b89dd256dc8caf) : `multisig.component.ts` — états nullables, tableau de comptes, `ViewChild` facultatif, types des entrées URL/QR et valeur de présentation de l'agrégation `?? ''`. Ne modifie pas le calcul des clés agrégées.
- [`47123d5`](https://github.com/twister65/Nault/commit/47123d5201e476d2de0b8b8461ddfdea9e02094b) : `sign.component.ts` — états des onglets et listes de données multisignatures, types des arguments de formulaire et des paramètres URL, garde du type de clé détecté, normalisation de l'index et vérification du compteur d'onglets. Aucun changement intentionnel des étapes MuSig, de l'encodage ou des fonctions de signature.
- [`bddc6d3`](https://github.com/twister65/Nault/commit/bddc6d34ab5b18e5af3729927ff948787895f8ac) : `sweeper.component.ts` — **uniquement** typage des champs de formulaire, état de navigation, scrolling `ViewChild`, paramètres des contrôles et modal UIkit. Les boucles de transfert, seed phrase, callbacks RPC, dérivation et publication des blocs restent à revoir séparément.

**Validation non confirmée sur ces nouveaux SHA.** Vercel signale encore un échec sur `907b5e6`; les statuts de `47123d5` et `bddc6d3` étaient **pending** à cette vérification. Les journaux détaillés Vercel ne sont pas accessibles par le connecteur, donc le nombre de nouveaux diagnostics ne doit pas être deviné. Relire impérativement un log frais sur le dernier SHA avant d'appliquer de nouveaux correctifs.

**Suite prioritaire :** résoudre les diagnostics résiduels du composant Sign et du Sweeper **en gardant les étapes critiques de transaction isolées**. `signOfflineBlock`, `getWork(): string | null`, `StateBlock.work`, `processPending` et les callbacks capturant `this` nécessitent une revue de sûreté et des tests ciblés, pas des assertions `!` non justifiées. `modal.service.ts` demande d'identifier le contrat des consommateurs avant de choisir son type. Le dernier TS de `nano-block.service.ts` concerne `work` nullable et ne doit pas être camouflé. Multisig fonctionnelle non testée ; **S01 hot wallet** et remédiation de sécurité séparés.

**Limites :** pas de fusion sur `master`, pas de mise en production de Vercel, pas de modification d'Apache, CORS, matériel Ledger ou secrets.

---

## Priorité MuSig — typage WebAssembly du 23 octobre 2026

**Demande utilisateur :** traiter en priorité `src/app/services/musig.service.ts` suspecté de bloquer les builds Vercel. Le dernier log GitHub Actions détaillé disponible était le [run 39988515156](https://github.com/twister65/Nault/actions/runs/39988515156) sur `b9d5327`, avec **76 erreurs TypeScript dans MuSig sur 241 au total**. Vercel signalait **ERROR** sur le commit documentaire `e3c1978` (déploiement `dpl_7xrQ7D7wsiU3jiLyU3wSLSD7y7Lw`), mais les logs de build Vercel n'ont pas pu être lus (autorisation du scope manquante). Ne pas attribuer automatiquement ces 76 erreurs au journal Vercel.

**Corrections publiées sur `upgrade/angular-22` :**
- [`a7c52c3`](https://github.com/twister65/Nault/commit/a7c52c3290590a66c4f320baeb8199bb07c13c9f) : interface TypeScript des exports du WASM MuSig basée sur les points d'appel existants ; types numériques des paramètres WASI, chargement explicite et garde du WASM ; types `Uint8Array` pour la mémoire, pointeurs numériques, callback d'agrégation, résultats d'agrégation et signatures d'étapes ; tableaux de clés publiques et paramètres typés ; conversions d'erreurs capturées en texte. La lecture des octets `copyFromWasm` utilise une vue `Uint8Array` explicite pour accéder au buffer. Aucun algorithme de dérivation de clé, de génération de signature ou d'ordre des étapes MuSig intentionnellement modifié.
- [`79c4181`](https://github.com/twister65/Nault/commit/79c4181770af022eaa4abc51bb45d5da26488102) : prise en charge contrôlée de `privateKey: string | null` dans l'API publique `runMultiSign`, afin de refléter l'appel de la page Sign qui utilise un état initial nullable. L'absence de clé est rejetée avant l'appel interne au moteur.
- [`59127ed`](https://github.com/twister65/Nault/commit/59127eda7826f5d26a1c2dfa098d9d4126f48b17) : préservation de l'ordre historique de validation des données d'entrée avant la vérification de chargement du WASM, sans changer les calculs.

**Ce qui reste à valider :** ces commits sont **publiés, mais leur build n'est pas confirmé**. Lire la CI GitHub Actions et Vercel du SHA actuel avant d'annoncer un nouveau nombre de diagnostics. Vérifier particulièrement l'absence de nouvelles erreurs dans `sign.component.ts` et les définitions WASM. Les signatures de fonctions reposent sur les appels du JavaScript existant ; comparer avec le véritable module compilé (`build-or-validate_musig_wasm.sh`) et ajouter des tests simulés avant de valider la cryptographie. Il faut aussi tester séparément l'agrégation d'adresses et les étapes 0–3, l'annulation, les erreurs, les libérations de mémoire et le résultat signé. Ne pas annoncer la multisignature fonctionnelle sans ces tests.

**Interdictions maintenues :** aucun merge vers `master`, aucun changement de `S01` / hot wallet, aucune modification du transport Ledger/APDU, ni des paramètres Apache/CORS. La branche reste une migration de typage Angular 22 jusqu'à la validation complète Web/PWA, Electron, lint, CodeQL et tests.

---

## Reprise du 23 octobre — quatre lots de typage publiés, CI à vérifier

**Dernière mesure confirmée avant ces corrections :** [241 diagnostics TypeScript sur `b9d5327`](https://github.com/twister65/Nault/actions/runs/39988515156), contre 1 060 initialement. Le build Web **échoue** ; lint et CodeQL étaient **success** sur cette référence. Cette mesure **n'est pas** celle des commits publiés ci-dessous.

**Nouveaux commits sur `upgrade/angular-22` :**
- [`f82997f`](https://github.com/twister65/Nault/commit/f82997fb37fcd131471dd287896bf6c1ceeaee3a) : `keygenerator.component.ts`, le tableau de lignes mnémoniques porte le type `string[][]`, sans modifier la génération.
- [`ffd6d97`](https://github.com/twister65/Nault/commit/ffd6d97cabb0e42cddef0a95055eeb72c86121ca) : `import-wallet.component.ts`, type explicite du message d'erreur et garde du type de portefeuille importé avant le déchiffrement. Aucun algorithme de déchiffrement modifié.
- [`46eb987`](https://github.com/twister65/Nault/commit/46eb98757a859f06940ceb358a790185ccb552cb) : `manage-wallet.component.ts`, signatures et cellules CSV typées, traitement des valeurs manquantes, conversion numérique explicite des champs count/offset et des timestamps. Vérifier que l'export CSV/JSON fonctionne avant fusion.
- [`f8ac90e`](https://github.com/twister65/Nault/commit/f8ac90eeb90dd500888f5d45f9e80ebc8eeea8ba) : `configure-wallet.component.ts`, accès facultatif à l'état de navigation, données mnémoniques typées, QR et modal UIkit typés, `FileList` nullable, vérification du résultat `FileReader` et conversion explicite de l'index. Les chemins de gestion de graine restent inchangés.

**Point de vigilance :** les quatre commits de code portent `[skip ci]` afin de constituer un lot de corrections. **Aucune validation de compilation du nouveau lot ne doit être prétendue** avant un nouveau run. Ce commit documentaire sans `[skip ci]` vise à déclencher la CI ordinaire de branche. Après son exécution, vérifier d'abord le run Angular 22 correspondant au SHA exact, puis les runs lint et CodeQL. Ne pas confondre nombre attendu et nombre mesuré : les fichiers corrigés représentaient 33 diagnostics potentiels sur la dernière mesure, sans garantie qu'aucun nouveau diagnostic n'apparaisse.

**Reprise suivante :** examiner les éventuelles nouvelles erreurs de compilation introduites par les types CSV, QR, `FileReader` ou l'import, puis éliminer les diagnostics d'interface restants. Les gros lots sont `musig.service.ts` (76), `sweeper.component.ts` (62), `sign.component.ts` (50) et `multisig.component.ts` (18) à la mesure précédente. Pour `musig`, `sign` et `sweeper`, n'effectuer que du typage vérifiable avec tests simulés ; ne pas masquer les nullables `PoW` ni toucher au protocole multisignature par opportunisme.

**Décisions fermes :** pas de fusion `master`, pas de déploiement Vercel rouge, pas de modification Apache/CORS, pas de tests matériels Ledger demandés. La conformité de sécurité **S01 du hot wallet** et le chantier de validation/refonte multisignature restent des travaux distincts. Conserver l'historique des mesures ci-dessous pour les reprises après réinitialisation de quota.

---

## CI du lot Sign — 241 diagnostics vérifiés

**Dernière validation de code :** [commit `b9d5327`](https://github.com/twister65/Nault/commit/b9d5327b6e55920fc26d6dd3f8870152e698844e), [run Angular 22 39988515156](https://github.com/twister65/Nault/actions/runs/39988515156). **241 erreurs TypeScript**, contre 260 au lot précédent et **1 060** au départ (**819 diagnostics éliminés**, soit 77,3 %). Le **build Web échoue encore**, donc la compilation Electron, les tests Angular/RPC et les essais matériels ne peuvent être considérés comme validés. La page `sign.component.ts` passe de **69 à 50 diagnostics** ; les modifications portent sur ses champs d'affichage, paramètres QR et déclarations TypeScript, **pas** sur le calcul des signatures. Le reste se répartit ainsi sur ce SHA : `musig.service.ts` 76, `sweeper.component.ts` 62, `sign.component.ts` 50, `configure-wallet.component.ts` 19, `multisig.component.ts` 18, `manage-wallet.component.ts` 11, `import-wallet.component.ts` 2, `keygenerator.component.ts` 1, `modal.service.ts` 1 et `nano-block.service.ts` 1.

**Contrôles de ce SHA :** [CodeQL 39988515035](https://github.com/twister65/Nault/actions/runs/39988515035) **success** ; [lint 39988514823](https://github.com/twister65/Nault/actions/runs/39988514823) **success** sur le même SHA. Cela confirme le lint et l'analyse statique, mais **pas** la compilation Web ni les tests de transactions. **Point de reprise exact :** tête de code `b9d5327`, puis commit documentaire du présent bloc.

**Suites recommandées :** garder les corrections de l'interface Sign séparées des fonctions `confirmTransaction`, `signOfflineBlock`, `runMultiSign` et du WASM. Le champ nullable `currentBlock`, les comptes potentiellement absents et les résultats de PoW `string | null` exigent de vrais gardes et des tests adaptés, non des assertions `!`. Les modules `sweeper` et `configure-wallet` manipulent aussi des graines et des clés : ne pas profiter du typage pour implémenter implicitement **S01**. Le chantier multisig (et ses tests) restera distinct et doit être validé avant toute fusion finale.

**État :** aucune fusion `master`, aucun déploiement Vercel, aucune modification Apache/CORS ou tests physiques Ledger/BLE. `upgrade/angular-22` continue uniquement comme branche de travail.

---

## Reprise du 23 octobre — 260 diagnostics, états de présentation de Sign

**Mesure CI certaine :** [validation Angular 22 39946339298](https://github.com/twister65/Nault/actions/runs/39946339298) pour le commit [`188e15d`](https://github.com/twister65/Nault/commit/188e15da5ed5c42c5b63697a0c7e6c9df8c2165d) : **260 erreurs TypeScript**, contre 265 sur `37be906` et 1 060 à l'origine (800 diagnostics éliminés). Le build Web/PWA est toujours **failure** et les tests qui en dépendent, ainsi qu'Electron, ne sont pas validés. [Lint 39946339312](https://github.com/twister65/Nault/actions/runs/39946339312) et [CodeQL Advanced 39946339378](https://github.com/twister65/Nault/actions/runs/39946339378) : **success**. Aucune erreur ne reste dans le service Ledger, tandis que `nano-block.service.ts` conserve **une** erreur de type concernant `work: string | null` ; **ne pas résoudre celle-ci par `!` ou en inventant du PoW**, sa sémantique doit être contrôlée avec les transactions.

**Nouveau commit de code :** [`b9d5327`](https://github.com/twister65/Nault/commit/b9d5327b6e55920fc26d6dd3f8870152e698844e) corrige **seulement le typage de présentation** dans `sign.component.ts` : résultats du carnet d'adresses, états du QR, indicateurs optionnels, référence `ViewChild`, paramètres d'ouverture de scanner et accès typé au modal UIkit ; les libellés de comptes non enregistrés s'affichent comme chaînes vides. Aucune modification de calcul de signature, de PoW, d'accès à la graine, d'APDU Ledger ni de protocole multisignature. **CI correspondante :** [build 39988515156](https://github.com/twister65/Nault/actions/runs/39988515156), [lint 39988514823](https://github.com/twister65/Nault/actions/runs/39988514823), [CodeQL 39988515035](https://github.com/twister65/Nault/actions/runs/39988515035). Au moment de cette note, CodeQL est **success**, la compilation et le lint sont **en cours** : **ne pas attribuer 260 au nouveau SHA** et vérifier tout nouveau diagnostic.

**Restants sur le dernier SHA mesuré `188e15d` :** `musig.service.ts` 76, `sign.component.ts` 69, `sweeper.component.ts` 62, `configure-wallet.component.ts` 19, `multisig.component.ts` 18, `manage-wallet.component.ts` 11, `import-wallet.component.ts` 2, `keygenerator.component.ts` 1, `modal.service.ts` 1, `nano-block.service.ts` 1. Ce périmètre regroupe beaucoup de flux sensibles : faire des lots de **types uniquement**, valider contre la CI du commit correspondant et ne pas masquer de valeurs nullables par assertions non justifiées.

**Décisions maintenues :** la conformité **S01 du hot wallet à seed phrase**, et les tests/refontes de **multisignature** relèvent de chantiers distincts. Pas de modification fonctionnelle des secrets ni des signatures avant audit et tests dédiés. Ne pas fusionner dans `master`, déployer sur Vercel, modifier Apache/CORS ni relancer les essais Bluetooth matériels avant validation complète Angular 22.

---

## Dernière mesure — 265 diagnostics, garde de réception

**CI de référence confirmée :** [`37be906`, validation 39945946364](https://github.com/twister65/Nault/actions/runs/39945946364) : **265 erreurs TypeScript**, contre **280** précédemment et **1 060** initialement (**795 diagnostics éliminés**). Le build Web échoue encore. [Lint 39945946350](https://github.com/twister65/Nault/actions/runs/39945946350) et [CodeQL Advanced 39945946338](https://github.com/twister65/Nault/actions/runs/39945946338) sont **success** sur ce SHA. Dans `nano-block.service.ts`, 21 erreurs ont été ramenées à **5** ; une nouvelle erreur est apparue dans `account-details.component.ts` parce que `generateReceive` exige à juste titre un `WalletAccount` défini.

**Dernier correctif poussé : [`188e15d`](https://github.com/twister65/Nault/commit/188e15da5ed5c42c5b63697a0c7e6c9df8c2165d).** Remplace l'indexation non typée du `window.nacl` par l'interface TypeScript des fonctions déjà utilisées, supprime un état transitoire `workBlock: string | null` alors que sa valeur effective est une chaîne, et vérifie l'existence de `walletAccount` dans la réception manuelle avant d'appeler `NanoBlockService.generateReceive`. Ce dernier garde-fou émet un avertissement en l'absence de compte plutôt que de tenter une signature sur `undefined`. Aucun changement du hash, de l'encodage, de la preuve de travail, du moteur multisig ou de la gestion de graine. **Validation du dernier commit : [Angular 22 39946339298](https://github.com/twister65/Nault/actions/runs/39946339298), [lint 39946339312](https://github.com/twister65/Nault/actions/runs/39946339312), [CodeQL 39946339378](https://github.com/twister65/Nault/actions/runs/39946339378), en cours lors de ce point de reprise.**

**Diagnostics encore présents sur `37be906`** : `musig.service.ts` 76, `sign.component.ts` 69, `sweeper.component.ts` 62, `configure-wallet.component.ts` 19, `multisig.component.ts` 18, `manage-wallet.component.ts` 11, `nano-block.service.ts` 5, `import-wallet` 2, `account-details` 1 (corrigé par dernier lot), `keygenerator` 1, `modal.service.ts` 1. Attention à l'erreur résiduelle d'affectation `StateBlock.work` (`string | null`) dans `signOfflineBlock` : **ne pas la masquer par une assertion `!`** ; choisir explicitement la sémantique de l'absence de PoW avec tests ciblés dans la phase transaction/signature.

**Suite sécurisée :** relire le log de `39946339298`, analyser les erreurs supplémentaires de types et les corriger sans modifier le comportement cryptographique. La majorité des erreurs restantes est concentrée dans les flux `musig`, `sign` et `sweeper` ainsi que les écrans du portefeuille ; prévoir des tests simulés et une revue de sécurité avant tout changement. **S01 du hot wallet et tests/refontes multisignatures sont des chantiers distincts** ; ils ne sont pas résolus par ce nettoyage de types. La validation Web/PWA, Electron et tests unitaires/RPC n'est pas terminée. Pas de merge `master`, pas de nouvelle URL Vercel, aucune modification Apache et aucun nouvel essai matériel Bluetooth.

---

## Suite de migration — 280 diagnostics validés, contrats du bloc Nano

**Mesure confirmée avant le dernier commit :** [CI Angular 22 39945449764](https://github.com/twister65/Nault/actions/runs/39945449764) sur [`422eddc`](https://github.com/twister65/Nault/commit/422eddc590f89fd18a7ad08dbee9da2526591f66) : **280 erreurs TypeScript**, contre **1 060** initialement (**780 diagnostics éliminés**). `ledger-web-ble.ts` n'a plus d'erreur TS. La compilation Web est toujours **failure** ; [lint 39945449780](https://github.com/twister65/Nault/actions/runs/39945449780) et [CodeQL Advanced 39945449834](https://github.com/twister65/Nault/actions/runs/39945449834) **success** sur ce même SHA.

**Nouveau commit de code : [`37be906`](https://github.com/twister65/Nault/commit/37be906def2772a3c901f6e8bee14b1e5e98e1fa).** Typage du contrat minimal utilisé par `hashStateBlock` : les **cinq champs effectivement hachés** (compte, précédent, représentant, solde, lien) sont obligatoires, mais `signature` et `work` ne sont pas nécessaires au hash. Les brouillons de blocs dans `nano-block.service.ts` distinguent ces deux champs encore absents (`null`) des champs déjà calculés. Annotations des comptes/paramètres de création de blocs, du format d'information de compte non approuvé et des champs optionnels des blocs Ledger ; lecture sûre des erreurs capturées. Les instructions de hash, les octets, les signatures, les valeurs de transactions et les secrets restent **inchangés**. **CI à vérifier : [validation 39945946364](https://github.com/twister65/Nault/actions/runs/39945946364), [lint 39945946350](https://github.com/twister65/Nault/actions/runs/39945946350), [CodeQL 39945946338](https://github.com/twister65/Nault/actions/runs/39945946338).** Tous sont en cours au moment de ce point de reprise. Il ne faut pas attribuer la mesure 280 au dernier SHA.

**Répartition des erreurs sur la mesure 280** : `musig.service.ts` 76, `sign.component.ts` 69, `sweeper.component.ts` 62, `nano-block.service.ts` 21 (lot courant), `configure-wallet.component.ts` 19, `multisig.component.ts` 18, `manage-wallet.component.ts` 11, `import-wallet.component.ts` 2, `keygenerator.component.ts` 1, `modal.service.ts` 1. Les composants de seed phrase et la multisignature constituent des **chantiers de sécurité distincts** suivant la décision de l'utilisateur (dont conformité S01 du hot wallet). Leur code ne doit pas subir de changements de comportement au seul motif de la migration Angular.

**Reprise** : examiner en priorité les diagnostics nouveaux du run `39945946364` (contrat `DraftStateBlock`, `StateBlock` et `WalletAccount`) et corriger les incompatibilités de types **sans changer les signatures**. Les tests unitaires RPC/Angular, le build Electron, le service worker PWA et les tests simulés Ledger restent bloqués tant que la compilation Web échoue. Ne pas fusionner dans `master`, ne pas déployer sur Vercel, ne pas modifier Apache/CORS, ne pas relancer les essais matériels USB/BLE avant validation finale.

---

## Dernière reprise — ABI Ledger typée et nettoyage des diagnostics BLE

**Mesure CI vérifiée sur [`64785b2`](https://github.com/twister65/Nault/commit/64785b2a31e7158f17048f61cc434fd20d763ae6)** : [run Angular 22 39945144881](https://github.com/twister65/Nault/actions/runs/39945144881) : **286 erreurs TypeScript**, contre **1 060** sur la référence initiale (**774 diagnostics éliminés**, ~73 %). `ledger.service.ts` n'a désormais **plus aucun diagnostic** après l'ajout de sa déclaration `hw-app-nano` fondée sur les contrats Flow de la bibliothèque `roosmaa/hw-app-nano`. **Le build Web reste en échec** ; on ne peut déclarer ni les tests Jasmine/RPC, ni Electron validés. Consulter les statuts lint et CodeQL du run correspondant, et non ceux d'un SHA plus ancien.

**Dernier commit de code [`422eddc`](https://github.com/twister65/Nault/commit/422eddc590f89fd18a7ad08dbee9da2526591f66)** : dans `ledger-web-ble.ts`, seules les déclarations des minuteries, du type du résultat de découverte GATT et la lecture structurelle des messages d'erreur `unknown` changent. La lecture de `message` ne dépend plus de `instanceof Error`, car les erreurs Bluetooth peuvent provenir d'un autre contexte JS. **Aucun changement de politique BLE, d'APDU, de reconnexion, de transaction ou de signature.** Ce fichier présentait 6 erreurs TypeScript avant ce correctif. À vérifier : [build Angular 22 39945449764](https://github.com/twister65/Nault/actions/runs/39945449764), [lint 39945449780](https://github.com/twister65/Nault/actions/runs/39945449780), [CodeQL 39945449834](https://github.com/twister65/Nault/actions/runs/39945449834), **en cours lors de cette rédaction**.

**Bilan 286 avant ce dernier correctif** : `musig.service.ts` 76, `sign.component.ts` 69, `sweeper.component.ts` 62, `nano-block.service.ts` 21, `configure-wallet.component.ts` 19, `multisig.component.ts` 18, `manage-wallet.component.ts` 11, `ledger-web-ble.ts` 6, `import-wallet` 2, `keygenerator` 1 et `modal.service.ts` 1. La grande majorité relève de la gestion des clés et des signatures.

**Décision utilisateur à respecter** : traitement du hot wallet à graine de récupération conformément à **S01 de l'audit de sécurité**, ainsi que le comportement et les tests multisignatures, **dans des chantiers séparés**. Pour Angular 22, typer uniquement à partir de contrats vérifiables, sans changer la gestion des secrets, l'encodage, l'algorithme de signature ni les transactions. Éviter de résoudre des erreurs en ajoutant `any` ou en désactivant `strict`. Ne pas modifier `master`, Apache ou l'alias Vercel, ni engager de test matériel Bluetooth avant la campagne de validation finale.

---

## Suite du 23 octobre — typage des erreurs Ledger et contrat hw-app-nano

**Référence terminée** : [validation Angular 22 39942936876](https://github.com/twister65/Nault/actions/runs/39942936876) sur [`dd9a00c`](https://github.com/twister65/Nault/commit/dd9a00c937127f90c47f918dd9b33654d483339c) : **305 erreurs TypeScript** (319 précédemment ; 1 060 au départ). La compilation Web reste **en échec**, les tests Angular/RPC/Electron n'ont pas été atteints. [Lint 39942936769](https://github.com/twister65/Nault/actions/runs/39942936769) et [CodeQL 39942936789](https://github.com/twister65/Nault/actions/runs/39942936789) : **success**.

**Commit [`8851c3f`](https://github.com/twister65/Nault/commit/8851c3f01eb8efb3b0f626a41c3b099b9e6c4b04)** : `ledgerErrorFields(error: unknown)` effectue une lecture typée des propriétés d'erreur `name`, `message`, `id`, `statusCode`, `statusText`, sans nouvelle commande Ledger ni changement de politique de connexion. `updateCacheOffline` précise ses paramètres. [CI 39944642332](https://github.com/twister65/Nault/actions/runs/39944642332) : **287 erreurs TypeScript**, soit **773 de moins** que la référence initiale ; le seul diagnostic de `ledger.service.ts` concerne alors l'absence de déclaration TypeScript pour `hw-app-nano`. Web encore **failure** ; [CodeQL 39944642481](https://github.com/twister65/Nault/actions/runs/39944642481) **success**, vérifier le résultat du lint du même SHA si nécessaire.

**Commit [`64785b2`](https://github.com/twister65/Nault/commit/64785b2a31e7158f17048f61cc434fd20d763ae6)** : ajout dans `src/typings.d.ts` d'une déclaration ambient pour **`hw-app-nano@1.3.0`** fondée sur les signatures Flow de `roosmaa/hw-app-nano/src/Nano.js` et `src/api.js` (constructeur, `getAppConfiguration`, `getAddress`, `cacheBlock`, `signBlock`). Décrit explicitement les chaînes de bloc et les paramètres optionnels, sans `any` général ni modification de l'implémentation JavaScript ou du protocole APDU. **Validation de cette déclaration en cours : [Angular 22 39945144881](https://github.com/twister65/Nault/actions/runs/39945144881)**, [lint 39945145018](https://github.com/twister65/Nault/actions/runs/39945145018), [CodeQL 39945144896](https://github.com/twister65/Nault/actions/runs/39945144896). Ne pas supposer que l'annotation de la bibliothèque rend toutes les opérations Ledger vérifiées ; la déclaration devra être confrontée aux tests simulés et aux versions installées.

**Restants à la mesure 287 :** `musig.service.ts` 76, `sign.component.ts` 69, `sweeper.component.ts` 62, `nano-block.service.ts` 21, `configure-wallet.component.ts` 19, `multisig.component.ts` 18, `manage-wallet.component.ts` 11, `ledger-web-ble.ts` 6, `import-wallet` 2, `keygenerator` 1, `modal.service.ts` 1 et `ledger.service.ts` 1 (ce dernier visé par la déclaration du dernier commit). Ne pas avancer un chiffre plus récent sans lire le run du dernier SHA.

**Contrat utilisateur :** travaux S01 du hot wallet par seed phrase **hors de cette migration**, et tests/modifications de cryptographie multisignature **à part**. Limiter les travaux Angular 22 à la compatibilité de types vérifiable ; éviter tout contournement `strict: false`, tout masquage des cas `null` ou toute modification de données de clés. Pas de fusion dans `master`, pas de modification Apache/CORS ni déploiement Vercel rouge, pas d'essai matériel BLE/USB tant que la CI complète ne passe pas.

---

## CI confirmée à 319 diagnostics, interfaces Ledger IPC ciblées

**Mesure sur le commit [`82127a0`](https://github.com/twister65/Nault/commit/82127a07b59b3821e50429f857e28178675875d9) :** [run 39942507506](https://github.com/twister65/Nault/actions/runs/39942507506) = **319 erreurs TypeScript** (contre **341** sur `09f8f7b` et **1 060** initialement, soit **741 diagnostics éliminés** au total). **Échec à la compilation Web**, donc ni Electron ni les tests Angular/RPC n'ont été exécutés jusqu'au bout. [Lint 39942507472](https://github.com/twister65/Nault/actions/runs/39942507472) et [CodeQL Advanced 39942507328](https://github.com/twister65/Nault/actions/runs/39942507328) **success** pour ce même SHA. Aucun diagnostic ne subsiste dans `desktop.service.ts`, `rpc-transport.service.ts`, `wallet-widget.component.ts`, `remote-signing.component.ts` ni `remote-sign.service.ts`.

**Nouveau lot, encore à valider :** [`dd9a00c`](https://github.com/twister65/Nault/commit/dd9a00c937127f90c47f918dd9b33654d483339c) : déclarations strictement TypeScript des paramètres des cinq méthodes IPC du service `ledger.service.ts` (`getDesktopResponse`, `getLedgerAccountDesktop`, `updateCacheDesktop`, `signBlockDesktop`, `updateCache`). **Pas de changement de logique, de protocole, de codes APDU, de crypto, de BLE ou de transport.** Contrôler [la validation 39942936876](https://github.com/twister65/Nault/actions/runs/39942936876), [lint 39942936769](https://github.com/twister65/Nault/actions/runs/39942936769) et [CodeQL 39942936789](https://github.com/twister65/Nault/actions/runs/39942936789). Résultat non encore disponible à la rédaction ; ne pas annoncer de nouveaux diagnostics supprimés sans le log.

**Point de sécurité :** le hot wallet / seed phrase / exigence S01 et le comportement cryptographique de multisignature restent **hors périmètre** de cette mise à niveau. Le service Ledger conserve encore ses autres diagnostics TypeScript (déclaration du package externe `hw-app-nano`, variables d'erreur `unknown`, formats applicatifs), qui requièrent des corrections avec analyse des contrats réels et tests simulés. Le moteur `musig.service.ts`, `sweeper`, `sign` et `nano-block` est encore non compilable. Ne pas modifier ces flux par de simples assertions hasardeuses.

**Conditions de validation inchangées :** obtenir d'abord un build Web/PWA et Electron, le lint, CodeQL, les tests RPC/Angular et simulés Ledger sur un même commit, puis les essais matériels à la fin de la migration. Ne pas fusionner `master`, ne pas modifier Apache/CORS ni déployer sur Vercel tant que le build est rouge. Deuxième reconnexion Bluetooth toujours ouverte ; ne pas relancer de test physique maintenant.

---

## Reprise Angular 22 — typage IPC et interface de signature distante

**Code actuellement poussé** sur `upgrade/angular-22` : [`82127a0`](https://github.com/twister65/Nault/commit/82127a07b59b3821e50429f857e28178675875d9). Le point de mesure confirmé avant ce lot demeure **341 diagnostics TypeScript** sur [`09f8f7b`](https://github.com/twister65/Nault/commit/09f8f7bd80cf04a04613abbc15903b493a8d9996) (run [39911522558](https://github.com/twister65/Nault/actions/runs/39911522558)). **Ne pas attribuer ce chiffre au dernier commit tant que sa CI n'est pas terminée.**

**Commits de cette reprise :**
- [`db1ec1c`](https://github.com/twister65/Nault/commit/db1ec1c61fbf193a928230af2390b598d3287a44) : signature d'écouteur et d'arguments du pont IPC Electron dérivée de `NaultDesktopBridge`, lecture des en-têtes RPC sans transmettre `null` à `Headers.set`, et déclaration du `ViewChild` du champ de déverrouillage. La politique `secureEndpoint`, l'interdiction des redirections et la transmission des en-têtes ne changent pas.
- [`82127a0`](https://github.com/twister65/Nault/commit/82127a07b59b3821e50429f857e28178675875d9) : annotations de type `URL`, états de formulaire et listes d'adresses dans l'interface de signature distante. Les contrats de navigation et de validation de bloc sont inchangés. **La signature cryptographique, le WASM de multisignature et les clés n'ont pas été modifiés.**

**Contrôles à lire pour reprise** : [validation Angular 22 du dernier SHA, run 39942507506](https://github.com/twister65/Nault/actions/runs/39942507506), [lint 39942507472](https://github.com/twister65/Nault/actions/runs/39942507472), [CodeQL 39942507328](https://github.com/twister65/Nault/actions/runs/39942507328). **En attente/en cours lors de la rédaction**. Vérifier le compteur et d'éventuels diagnostics chez les consommateurs du pont IPC après leur conclusion. Les workflows concurrents peuvent annuler les runs du commit précédent.

**Décision de sécurité rappelée** : l'utilisateur réserve explicitement le **traitement de S01 sur le hot wallet par seed phrase** et les **tests/refontes multisignatures** à une phase distincte. Pour Angular 22, ne faire que du typage sans modification des algorithmes ou des secrets ; ne pas tenter de rendre le build vert par `strict: false`, `skipLibCheck` ou des types `any` non justifiés. Les modules de signature `sign`, `sweeper`, `nano-block`, `ledger` et le WASM exigent des corrections isolées et des tests simulés, avant une campagne matérielle ultérieure.

**État de livraison :** build Web/PWA toujours non validé, pas de tests Angular/RPC/Electron concluants, aucune fusion dans `master`, aucun déploiement Vercel ni modification Apache/CORS. Le dysfonctionnement de deuxième reconnexion Bluetooth reste ouvert ; pas de test matériel supplémentaire demandé.

---

## Nouvelle mesure validée — 341 diagnostics TypeScript

**Branche `upgrade/angular-22`, dernier commit de code [`09f8f7b`](https://github.com/twister65/Nault/commit/09f8f7bd80cf04a04613abbc15903b493a8d9996).** La [validation GitHub Actions 39911522558](https://github.com/twister65/Nault/actions/runs/39911522558) s'est achevée en **failure du build Web**, avec **341 erreurs TypeScript** contre **1 060** initialement : **719 diagnostics éliminés (environ 67,8 %)**. [Lint 39911522492](https://github.com/twister65/Nault/actions/runs/39911522492) et [CodeQL Advanced 39911522485](https://github.com/twister65/Nault/actions/runs/39911522485) sont **success sur ce même SHA**. Aucun build Electron/PWA intégral ni test Jasmine/RPC/matériel ne peut encore être déclaré validé. Les fichiers `nano-identicon`, `ninja.service`, `nano-transaction-mobile`, `currency-symbol.pipe` et `accounts.component.ts` ne génèrent plus d'erreurs.

**Distribution des erreurs encore visibles au même SHA :** `musig.service.ts` 76, `sign.component.ts` 69, `sweeper.component.ts` 62, `ledger.service.ts` 35, `nano-block.service.ts` 21, `configure-wallet.component.ts` 19, `multisig.component.ts` 18, `remote-signing.component.ts` 13, `manage-wallet.component.ts` 11, `ledger-web-ble.ts` 6, plus de petits fichiers de transport et d'import (de 1 à 2 erreurs chacun). La majorité relève désormais du chemin sensible de portefeuille, de signature ou de communication Ledger : **ne pas accélérer en désactivant `strict`, en ajoutant `any` arbitraires ou en changeant des algorithmes sans tests**.

**Décision utilisateur conservée :** la **multisignature** (tests non encore réalisés) et la **mise en conformité S01 du hot wallet à seed phrase** sont des chantiers de sécurité **distincts**. Ne pas les fusionner implicitement à la migration Angular 22. Si leur typage est indispensable à la compilation Angular, limiter le travail aux interfaces et aux garanties de type, en conservant rigoureusement les comportements en attendant leur campagne dédiée. Relire l'audit S01 original pour en connaître l'exigence exacte au lancement du chantier de remédiation.

**Pour reprendre :** vérifier la tête de branche et la CI sur GitHub ; ouvrir les diagnostics résiduels du run 39911522558 ; examiner d'abord les petites erreurs purement techniques, puis consacrer des lots individualisés et des tests simulés à `ledger.service`, `nano-block.service`, `sign` / `sweeper` sans modification du protocole, des graines ou de la signature. Conserver `master`, Apache, les domaines CORS existants et Vercel inchangés ; ne pas demander d'essai Bluetooth physique avant la validation Angular 22. Le build Web reste rouge et aucun déploiement n'a été demandé.

---

## Point de reprise — 355 diagnostics et derniers composants auxiliaires

**Dernière compilation vérifiée :** [CI 39911106769](https://github.com/twister65/Nault/actions/runs/39911106769) sur [`0b0c279`](https://github.com/twister65/Nault/commit/0b0c2795f34f1ee95955e2dbd61fb7e92324f181) : **355 diagnostics TypeScript**, contre **1 060** initialement (**705 supprimés**, soit environ **66,5 %**). Le build Web échoue encore ; tests Angular/RPC et builds Electron non atteints. [Lint 39911106766](https://github.com/twister65/Nault/actions/runs/39911106766) et [CodeQL Advanced 39911106790](https://github.com/twister65/Nault/actions/runs/39911106790) : **success**. L'écran `send.component.ts` ne remonte plus d'erreur. L'unique diagnostic résiduel dans le lot d'interface était dans `nano-identicon` (nœud DOM nullable).

**Nouveau commit non encore mesuré :** [`09f8f7b`](https://github.com/twister65/Nault/commit/09f8f7bd80cf04a04613abbc15903b493a8d9996), typage et contrôles sans changement de signature pour `nano-identicon`, `nano-transaction-mobile`, `currency-symbol.pipe`, `accounts.component`, `ninja.service`. Dans `NinjaService`, le regroupement par score utilise un dictionnaire sans prototype et un contrôle `hasOwnProperty` sûr. **CI à consulter : [validation 39911522558](https://github.com/twister65/Nault/actions/runs/39911522558)** ; `lint` [39911522492](https://github.com/twister65/Nault/actions/runs/39911522492) **success**, CodeQL [39911522485](https://github.com/twister65/Nault/actions/runs/39911522485) encore en cours à la rédaction. Ne pas attribuer 355 à ce dernier SHA sans validation.

**Répartition des gros restants sur la mesure 355 :** `musig.service.ts` (76), `sign.component.ts` (69), `sweeper.component.ts` (62), `ledger.service.ts` (35), `nano-block.service.ts` (21), `configure-wallet.component.ts` (19), `multisig.component.ts` (18), `remote-signing.component.ts` (13), `manage-wallet.component.ts` (11), `ledger-web-ble.ts` (6), petits services de transport. **Ils concentrent désormais l'essentiel des erreurs dans les interfaces de signature/portefeuille et devront être examinés par lot avec tests simulés**. L'utilisateur a explicitement réservé les **tests multisignature** et la **correction du hot wallet à seed phrase selon S01 de l'audit de sécurité** à des chantiers distincts. Continuer uniquement le typage de compatibilité nécessaire à Angular 22, sans transformer les algorithmes, signatures, clés ni données stockées par opportunisme. À la phase dédiée S01, relire l'audit d'origine avant toute implémentation.

**Validation avant fusion :** Web/PWA, service worker, Electron, lint, CodeQL, tests Angular/RPC simulés et tests fonctionnels planifiés ; pas d'essai USB/Bluetooth matériel demandé maintenant. Aucun merge dans `master`, aucune modification Apache/CORS, aucun nouveau domaine Vercel ni déploiement d'un build rouge.

---

## Point de reprise — écrans Receive/Send et sécurité S01 isolée

**Tête de code actuelle :** [`0b0c279`](https://github.com/twister65/Nault/commit/0b0c2795f34f1ee95955e2dbd61fb7e92324f181), uniquement sur `upgrade/angular-22`. **Dernière mesure CI terminée :** [run 39910783213](https://github.com/twister65/Nault/actions/runs/39910783213), commit [`f4d5c80`](https://github.com/twister65/Nault/commit/f4d5c80bd0696acfe30b38eef75c7fb13d35dc8a) : **372 diagnostics TypeScript**, contre **1 060** sur la référence initiale, soit **688 éliminés** (environ **65 %**). Le build Web reste **failure**, pas de compilation Electron ni de tests Jasmine/RPC valides. Lint [39910783380](https://github.com/twister65/Nault/actions/runs/39910783380) et CodeQL [39910783274](https://github.com/twister65/Nault/actions/runs/39910783274) : **success** sur `f4d5c80`. **Ne pas reporter ce chiffre sur `0b0c279` avant sa propre compilation.**

**Commits de cette reprise :**
- [`37201a5`](https://github.com/twister65/Nault/commit/37201a57625a8be604a08225226824f60f42fbff) : types du widget des représentants et du convertisseur XNO, comparateur `BigNumber.comparedTo()` pour le tri.
- [`2b73a85`](https://github.com/twister65/Nault/commit/2b73a850c982ca04f2da9cd51879c0a1e4f09de8) : captures immuables de l'ID de compte sélectionné dans les callbacks du widget, corrigent les deux erreurs résiduelles.
- [`de85ecd`](https://github.com/twister65/Nault/commit/de85ecd55fe10f86a9d7c7a1d83fd5530ff02534) : modèles de transaction recevable et de mode marchand, dictionnaire de hashes, URI/QR et souscriptions dans `receive.component.ts`. Un garde évite de calculer un montant marchand tant que la demande n'a pas été initialisée. Le [run 39910470234](https://github.com/twister65/Nault/actions/runs/39910470234) rapportait **406 erreurs**, dont 1 dans Receive.
- [`f4d5c80`](https://github.com/twister65/Nault/commit/f4d5c80bd0696acfe30b38eef75c7fb13d35dc8a) : dernier libellé nullable de Receive et types de champs, montant, alias, listes, paramètres de navigation du formulaire Send ; `send.component.ts` passe de 36 à **3 erreurs** et Receive à **0**, selon son run.
- [`0b0c279`](https://github.com/twister65/Nault/commit/0b0c2795f34f1ee95955e2dbd61fb7e92324f181) : trois erreurs résiduelles de Send (typage UIkit/alias/libellé), composants d'icônes Nano, installation PWA, import du carnet d'adresses et pipe d'affichage Rai. **Validation à lire : [run 39911106769](https://github.com/twister65/Nault/actions/runs/39911106769)**, en cours à la rédaction.

### Périmètre sécurité expressément réservé

À la demande de l'utilisateur : **ne pas traiter pendant ce chantier Angular 22** le comportement de signature multisignature ni les tests multisignature ; **ne pas modifier le hot wallet par seed phrase** pour satisfaire le point **S01 de l'audit de sécurité**. Leur remédiation fonctionnelle et leur validation feront l'objet de **chantiers séparés**, avec revue des exigences S01 depuis l'audit d'origine, tests de sauvegarde/restauration, signatures et non-régression avant fusion. Le détail technique exact de S01 devra être relu dans l'audit au lancement de ce chantier ; ne pas en inventer une interprétation. Les interfaces `musig.service.ts` (76 diagnostics), `sweeper`, `sign`, `configure-wallet` ou `nano-block.service.ts` nécessitent une phase de typage dédiée prudente pour compiler Angular 22, **sans refonte de la cryptographie, du stockage de graine ou du protocole de signature**.

**Suite immédiate :** attendre les conclusions CI du SHA `0b0c279` (compilation, lint, CodeQL), relever les erreurs résiduelles réellement nouvelles et prioriser les services/appels à risques limités plutôt qu'une modification non testée du cœur wallet. Avant validation finale Angular 22 : compilation Web/PWA et Electron sur un même commit, tests unitaires/fixtures RPC, CodeQL et essais humains planifiés. Ne pas fusionner `master`, ne pas modifier Apache ou les règles CORS, ne pas déployer sur Vercel tant que la compilation est rouge, ne pas demander de nouvel essai matériel Bluetooth.

---

## CI finale du présent lot — 471 diagnostics

**Mesure vérifiée sur le dernier commit de code :** [`48120cd`](https://github.com/twister65/Nault/commit/48120cd48f0ccfe3c70b735f8dda9968b5ad8abc), [run Angular 22 39908158571](https://github.com/twister65/Nault/actions/runs/39908158571) : compilation Web **failure avec 471 diagnostics TypeScript**, contre **1 060** initialement, soit **589 diagnostics éliminés** (environ 56 %). [Lint 39908158502](https://github.com/twister65/Nault/actions/runs/39908158502) et [CodeQL Advanced 39908158458](https://github.com/twister65/Nault/actions/runs/39908158458) **success**. Les composants `manage-representatives`, `qr-scan`, `transaction-details` et `representative.service.ts` ne présentent **aucune erreur TypeScript** sur ce SHA. Aucun test Jasmine, test RPC ou build Electron n'a été validé (ils restent bloqués derrière le build Web).

**Restants principaux au run 39908158571 :** `musig.service.ts` **76** (module cryptographique WASM à isoler), `sign` **69**, `sweeper` **62**, `receive` **46**, `send` **36**, `ledger.service` **35**, `nano-block.service` **21**, `configure-wallet` **19**, `multisig` **18**, `change-rep-widget` **17**, `remote-signing` **13**, `manage-wallet` **11**, `ledger-web-ble` **6**, etc. Ne pas confondre baisse des diagnostics avec validation de sécurité des signatures, du PoW et de la réception.

**Prochain travail :** traiter d'abord les modèles de formulaire / état nullable dans les composants encore défectueux, en commits ciblés ; **ne pas modifier le WASM multisignature ni les algorithmes de signature pour satisfaire seulement le compilateur**. Obtenir ensuite `wallet:build`, `dist/ngsw.json`, `desktop:build`, les tests Angular et RPC, tests Ledger simulés, et CodeQL sur un même commit. Préserver le domaine Vercel CORS autorisé, ne pas fusionner `master` ni demander de tests Bluetooth physiques.

---

## Point de reprise — 491 diagnostics et composants auxiliaires

La [validation Angular 22 39907725481](https://github.com/twister65/Nault/actions/runs/39907725481) sur [`67d398d`](https://github.com/twister65/Nault/commit/67d398d7b957f14a8899a41e3ba71cf55b2630a7) s'est achevée en **failure lors de la compilation Web**, avec **491 diagnostics TypeScript** (contre **1 060** au début de la migration : **569 erreurs éliminées**, environ **54 %**). Le composant `address-book.component.ts` n'en présente plus. Lint [39907725480](https://github.com/twister65/Nault/actions/runs/39907725480) et CodeQL [39907725499](https://github.com/twister65/Nault/actions/runs/39907725499) sont **success** ; cette réussite n'exécute pas les tests Angular ni Electron bloqués derrière la compilation.

Un lot supplémentaire a été poussé sous [`48120cd`](https://github.com/twister65/Nault/commit/48120cd48f0ccfe3c70b735f8dda9968b5ad8abc) :
- `manage-representatives.component.ts` : liste `onlineReps` typée, modèle `StoredRepresentative.online?: boolean` explicite, gestion d'une réponse RPC sans liste de représentants et des erreurs JavaScript `unknown`.
- `qr-scan.component.ts` : initialisation explicite des périphériques de capture, indicateurs et résultat QR nullable ; ni les formats de codes-barres ni la logique de deeplink n'ont été modifiés.
- `transaction-details.component.ts` : abonnement `Subscription | null`, conversions hexadécimales typées, fallback explicite des étiquettes de comptes.

**Validation de ce lot** : [run Angular 22 39908158571](https://github.com/twister65/Nault/actions/runs/39908158571) était **en cours** à la rédaction. Lire les diagnostics précis avant de traiter les lots suivants ; ne pas annoncer leur disparition sans ce run. Les autres blocs dominants dans la mesure 491 sont `musig.service.ts` (76, WASM cryptographique à traiter séparément), `sign` (69), `sweeper` (62), `receive` (46), `send` (36), `ledger.service.ts` (35), `nano-block.service.ts` (21), `configure-wallet` (19), `multisig` (18).

**Contraintes non négociables** : pas de désactivation de `strict`, `skipLibCheck` ni de `@ts-nocheck`. Ne pas fusionner `upgrade/angular-22` dans `master`, ne pas déclencher de déploiement Vercel rouge, ne pas modifier `SetEnvIf Origin` dans Apache. Réutiliser uniquement le domaine `https://nault-wallet-staging-olaverre-1312.vercel.app` après compilation fonctionnelle. Différer les tests matériels USB, WebHID, Bluetooth et Android à la validation finale Angular 22 ; l'anomalie de deuxième reconnexion Nano X reste ouverte.

---

## Suite — représentants 522 et carnet d'adresses

**Dernière validation terminée :** la [CI Angular 22 39907361352](https://github.com/twister65/Nault/actions/runs/39907361352) sur [`e2f6dca`](https://github.com/twister65/Nault/commit/e2f6dca73d22e1a183d92958d21f71888d9b7e1d) rapporte **522 diagnostics TypeScript** (contre **1 060** initialement, **538 supprimés**). La compilation Web échoue toujours ; le fichier `representatives.component.ts` ne remonte plus d'erreur. Ne pas déduire des succès des tests Angular/RPC : la CI est arrêtée avant eux.

**Dernier commit de code :** [`67d398d`](https://github.com/twister65/Nault/commit/67d398d7b957f14a8899a41e3ba71cf55b2630a7) : `address-book.component.ts` utilise désormais `Record<string, BalanceAccount>` pour le registre indexé par adresse Nano, au lieu du tableau numérique incorrect ; les abonnements RxJS sont typés, le tri DOM est filtré sur les éléments/attributs effectivement présents, les fichiers importés sont validés comme texte, les noms de comptes/arguments QR sont typés et les erreurs `unknown` sont rendues explicitement. L'import/export et les appels RPC restent inchangés. **Validation correspondante : [39907725481](https://github.com/twister65/Nault/actions/runs/39907725481), en cours au moment de cette note**. Relever le nouveau nombre de diagnostics sur ce SHA avant d'entreprendre le lot suivant.

**Poursuite** : traiter d'abord les éventuelles régressions introduites par le nouveau modèle `accounts` du carnet d'adresses, puis les composants `qr-scan` (7 erreurs), `manage-representatives` (8 erreurs) et `transaction-details` (5 erreurs), indépendamment de la signature cryptographique. Ne pas modifier les règles Apache, l'alias de staging Vercel, ni les composants Ledger/BLE. Ne pas fusionner dans `master` sans build Web/PWA, Electron, lint, CodeQL, tests unitaires/RPC et validation finale.

---

## Avancement du 23 octobre — composants Angular et 555 diagnostics

**Branche :** `upgrade/angular-22`. **Aucun changement dans `master`.** La [validation Angular 22 39907030496](https://github.com/twister65/Nault/actions/runs/39907030496) sur le commit [`ecbb76d`](https://github.com/twister65/Nault/commit/ecbb76d164b796083ef6c1a0e8fc50196cb1e4ca) a confirmé **555 diagnostics TypeScript** (départ : 1 060, soit **505 diagnostics supprimés**). **Web/PWA : failure**, car compilation encore bloquée ; Electron, tests RPC/Angular et tests matériels restent **non validés**. [Lint 39907030468](https://github.com/twister65/Nault/actions/runs/39907030468) et [CodeQL 39907030369](https://github.com/twister65/Nault/actions/runs/39907030369) : **success**. Les composants `account-details.component.ts` et `configure-app.component.ts` n'apparaissent plus dans les diagnostics de ce run.

**Commits documentés dans ce lot :**
- [`5c15cb5`](https://github.com/twister65/Nault/commit/5c15cb58fedbb3fd313fca8e4b5a9fac04c662df) : typage des messages de bloc recevable, des états nullables de signature distante, du tableau des représentants et des abonnements RxJS dans `account-details`. Exporte également le modèle `AddressBookEntry` déjà existant. Le [run 39906688921](https://github.com/twister65/Nault/actions/runs/39906688921) a réduit les diagnostics de **682 à 614** ; cinq erreurs de `account-details` subsistaient.
- [`ecbb76d`](https://github.com/twister65/Nault/commit/ecbb76d164b796083ef6c1a0e8fc50196cb1e4ca) : corrige ces cinq derniers diagnostics `account-details` et type les champs de `configure-app` (serveurs RPC, stats, valeurs optionnelles, PoW, représentants, options de langues). `AppSettings` est maintenant exporté pour permettre le typage des changements de paramètres. Les règles de validation des endpoints `secureEndpoint` et les privilèges de configuration restent inchangés.
- [`e2f6dca`](https://github.com/twister65/Nault/commit/e2f6dca73d22e1a183d92958d21f71888d9b7e1d) : typage des listes de comptes sélectionnés et des représentants recommandés dans la page `representatives`, garde contre l'ajout de comptes inconnus, message explicite sur les exceptions. Aucun changement dans les calculs ou la signature de changement de représentant. **Le [run de validation 39907361352](https://github.com/twister65/Nault/actions/runs/39907361352) était encore en cours** lors de la rédaction : vérifier le total réel et les éventuelles régressions sur ce SHA.

**Prochain chantier recommandé :** lire le dernier run de `e2f6dca`, puis typer `address-book.component.ts` (**31 erreurs** dans la mesure 555). Son champ `accounts: BalanceAccount[]` est utilisé **comme un dictionnaire indexé par adresse Nano** : prévoir `Record<string, BalanceAccount>`, des abonnements `Subscription | null`, la validation de l'élément DOM avant le tri, et la gestion `unknown` des erreurs, en préservant les fonctions d'import/export. Les autres fichiers prioritaires sont `receive` (46), `send` (36), `sign` (69), `sweeper` (62) et `ledger.service` (35). La multisignature `musig.service.ts` (76 diagnostics) doit conserver un **lot distinct avec tests cryptographiques**. Ne pas réduire les options strictes du compilateur ni masquer les erreurs par des assertions génériques.

**Restrictions :** pas de fusion Angular 22 dans `master`, pas de déploiement Vercel tant que le build n'est pas vert. Le domaine de staging demeure `https://nault-wallet-staging-olaverre-1312.vercel.app` (déjà autorisé par Apache, ne pas modifier sa whitelist). Aucun essai matériel Bluetooth demandé ; défaut de deuxième reconnexion Nano X toujours ouvert, `Clear session` reste le contournement.

---

## Dernier résultat confirmé — 684 diagnostics TypeScript

**Mesure après correctif wallet :** [run Angular 22 39888727352](https://github.com/twister65/Nault/actions/runs/39888727352) sur [`e84b348`](https://github.com/twister65/Nault/commit/e84b34896441d21ec2d093646bcda5d2f0abefc9) : **684 erreurs TypeScript**, contre **1 060** initialement (**376 de moins**, environ 35 %). Le build Web/PWA reste en **failure**. **Lint** [39888727303](https://github.com/twister65/Nault/actions/runs/39888727303) et **CodeQL Advanced** [39888727385](https://github.com/twister65/Nault/actions/runs/39888727385) : **success**. `wallet.service.ts`, `util.service.ts`, `app-settings.service.ts` et `representative.service.ts` n'ont **plus aucune erreur** dans ce run. **Les tests Jasmine, RPC et Electron ne sont pas exécutés après le build Web échoué** ; ne pas confondre lint/CodeQL verts avec fonctionnalité validée.

**Correctif supplémentaire :** [`dca0f5b`](https://github.com/twister65/Nault/commit/dca0f5b4b8fbb6951265cfafa0af6776e702313d) : typage de `event.target` comme `Node` uniquement après vérification `instanceof Node` dans `AppComponent.onGlobalClick`, sans modifier la logique normale de fermeture du menu. Ce commit est postérieur au run de 684 erreurs ; **la CI de ce SHA est à confirmer**.

**Reste à traiter (sur `e84b348`) :** 76 diagnostics dans `musig.service.ts` (WASM/multisignature : lot de vérification cryptographique spécifique), 71 dans `account-details`, 69 dans `sign`, 62 dans `sweeper`, 54 dans `configure-app`, 46 dans `receive`, 36 dans `send` et 35 dans `ledger.service.ts`. Prioriser les interfaces/états et les tableaux initiaux `never[]` des composants avant d'envisager toute modification du WASM. Vérifier chaque petit lot par compilation et tests simulés. Préserver le comportement de réception Ledger indisponible et la vérification anti-doublon des blocs entrants.

**Règles de reprise inchangées :** Angular 22 **non terminée**, pas de fusion dans `master`, pas de release ni déploiement Vercel d'une compilation rouge. Origine staging attendue après validation : `https://nault-wallet-staging-olaverre-1312.vercel.app`, sans modifier Apache. Aucun nouvel essai matériel Bluetooth avant la campagne de validation Angular 22 ; la deuxième reconnexion Nano X reste ouverte (`Clear session` comme contournement).

---

## Point de reprise — wallet à 10 diagnostics

**Dernière CI terminée :** [`2ac4e76`, run 39888320190](https://github.com/twister65/Nault/actions/runs/39888320190). Compilation Web **failure**, **694 erreurs TypeScript** contre 1 060 au début (**366 diagnostics supprimés**). Lint et CodeQL **success** ([lint 39888320134](https://github.com/twister65/Nault/actions/runs/39888320134), [CodeQL 39888320153](https://github.com/twister65/Nault/actions/runs/39888320153)). `wallet.service.ts` est passé de **51 à 10** erreurs, mais le build Web n'a pas atteint l'exécution des tests Jasmine ; ne pas présenter le nouveau test anti-doublon comme exécuté.

**Nouveau commit :** [`e84b348`](https://github.com/twister65/Nault/commit/e84b34896441d21ec2d093646bcda5d2f0abefc9), visant les dix erreurs restantes de `wallet.service.ts`. Les chemins non-Ledger de génération d'export refusent maintenant explicitement une graine `null` plutôt que de passer cette valeur au chiffrement, le déverrouillage retourne `false` en absence de graine, et les abonnements `requestWalletUnlock` sont typés `Subscription | undefined`. Aucun changement du chiffrement CryptoJS lui-même, de la signature Ledger ou de l'interprétation RPC.

**CI à vérifier pour ce dernier lot :** [validation Angular 22 39888727352](https://github.com/twister65/Nault/actions/runs/39888727352) : **en cours au point de reprise**, résultat inconnu. Vérifier nombre d'erreurs et éventuelles régressions de typage dans tous les composants, puis finaliser la compilation Web avant de pouvoir exécuter les tests Angular/RPC. Les tests de réception sécurisée et de QR exigent une validation quand la suite sera de nouveau exécutable.

**Contrainte permanente :** aucune fusion `master`, aucun déploiement sur le domaine de staging tant que le build échoue ; pas de test matériel Bluetooth. Les prochains gros fichiers à traiter sont `musig.service.ts` (WASM cryptographique, 76 erreurs ; lot séparé), `account-details` (71), `sign` (69), `sweeper` (62), `configure-app` (54), `receive` (46).

---

## Suite du 23 octobre — 737 diagnostics et types du wallet

**Nouveau résultat confirmé :** la [CI Angular 22 39887845010](https://github.com/twister65/Nault/actions/runs/39887845010), commit [`ba4f873`](https://github.com/twister65/Nault/commit/ba4f87378032b1f954ee1422f3f1e088722ad283), finit en **failure sur la compilation Web** avec **737 erreurs TypeScript**. Base initiale : 1 060, soit **323 diagnostics résolus**. `AppSettingsService` et `RepresentativeService` sont à **0 diagnostic** sur ce run. Lint/CodeQL réussis sur les commits antérieurs ; ne pas confondre cela avec une validation complète Angular 22.

**Deux commits de suite :**
- [`72ae6d9`](https://github.com/twister65/Nault/commit/72ae6d97c822dfb035a601ca785391949e170188) : types du portefeuille (comptes, blocs en attente, indices, montants `string | BigNumber`), garde pour ne pas assimiler des comptes inconnus aux comptes de l'utilisateur si un RPC renvoie des données supplémentaires, et alignement du cache des blocs traités, composé de **hashs `string[]`**. La branche de vérification des doublons utilise maintenant `includes(nextBlock.hash)` au lieu de rechercher une propriété `hash` inexistante sur une chaîne. L'ancienne vérification était sans effet ; cette correction doit être testée avant fusion car elle influence les répétitions de réception.
- [`2ac4e76`](https://github.com/twister65/Nault/commit/2ac4e76082e8696f9cf2bf1d50cc8d0729c18019) : test Jasmine de non-régression vérifiant qu'un bloc déjà marqué comme reçu n'entraîne pas de nouvel appel à `generateReceive`. Ce test n'exige pas de clé Ledger réelle.

**CI du dernier commit :** [validation 39888320190](https://github.com/twister65/Nault/actions/runs/39888320190) lancée, **résultat en attente** au moment de cette documentation. Le test Jasmine ne peut être exécuté via la chaîne Angular tant que le build Web est bloqué par les erreurs strictes ; vérifier son comportement dès que le compilateur progresse. Examiner aussi si le nouveau type `Block.amount` déclenche des diagnostics supplémentaires chez ses consommateurs.

**Priorité après résultat CI :** traiter les erreurs supplémentaires éventuellement introduites dans le modèle `WalletService`, puis continuer les typages du portefeuille et des composants `account-details`/`configure-app`. Le service de multisignature WASM reste hors de ce lot pour éviter une modification cryptographique non validée. Ne pas fusionner vers `master`, ne pas déployer sur le staging Vercel tant que le build est rouge et ne pas demander d'essais matériels Bluetooth.

---

## Suivi du 23 octobre — nouvelle CI à 756 diagnostics

**Validation mesurée :** [run Angular 22 39887249708](https://github.com/twister65/Nault/actions/runs/39887249708) sur [`2da219b`](https://github.com/twister65/Nault/commit/2da219baadd0e043613049811384866cbbff5eb3). Le build Web/PWA reste **failure**, avec **756 diagnostics TypeScript**, contre **831** sur `1df6f81` et **1 060** sur la référence initiale `7920bff`. Soit une baisse de **304 diagnostics** par rapport à la référence, sans contournement des options strictes. Le service des représentants affiche **0 erreur**, `UtilService` en affiche **9** (erreurs de notation `BigNumber.Value`, plus une erreur sur `isNumeric`).

**Commits ajoutés après `2da219b` :**
- [`815a385`](https://github.com/twister65/Nault/commit/815a3853ae6417e84c5fa7d1f8a783e8c9fb3b30) remplace le type purement déclaratif et non reconnu `BigNumber.Value` par l'union `string | number | BigNumber`, et convertit explicitement en chaîne l'argument du test numérique (identique à la coercition JavaScript antérieure). Lint et CodeQL sur ce commit : **success** ([39887661119](https://github.com/twister65/Nault/actions/runs/39887661119), [39887661176](https://github.com/twister65/Nault/actions/runs/39887661176)).
- [`ba4f873`](https://github.com/twister65/Nault/commit/ba4f87378032b1f954ee1422f3f1e088722ad283) cible `AppSettingsService` : lecture/écriture générique typée des clés, refus des clés inattendues dans une importation partielle, langues Transloco disponibles sous forme chaîne ou objet, et traitement d'une URL de nœud absente. La langue initiale est représentée par la chaîne vide et l'initialisation par `!language` afin de continuer à détecter les anciens paramètres `null` ; cette modification de représentation requiert des tests.
- La nouvelle CI pour **`ba4f873`** est [39887845010](https://github.com/twister65/Nault/actions/runs/39887845010), **en cours/en attente lors de cette note**. Ne pas attribuer à ce commit la mesure 756 avant d'avoir lu son propre log. Vérifier en particulier les appels aux accesseurs typés de `AppSettingsService` et les imports du carnet d'adresses.

**Travaux encore ouverts :** composants `account-details` (71 diagnostics au dernier run), `sign` (69), `sweeper` (62), `configure-app` (52), `wallet.service` (51), et `musig.service` (76 ; code WASM de signature à isoler). Ne pas affaiblir la sécurité ou le typage ; ne pas toucher à `master`, Apache, domaines Vercel, configuration RPC/IPC ou Bluetooth. Les builds Electron, APK et tests matériels restent non validés.

---

## Point de reprise du 23 octobre — modèles représentants et utilitaires

**Point de départ vérifié :** `upgrade/angular-22` sur [`797252c`](https://github.com/twister65/Nault/commit/797252c027e91023ca15775a0dd82301e90bdcba), aucune modification de `master`. L'ancienne [CI de validation 39885967252](https://github.com/twister65/Nault/actions/runs/39885967252) pour `1df6f81` termine en **failure lors du build Web**, avec **831 erreurs TypeScript**. Avant le travail du 23 octobre, la référence était **1 060**, soit **229 diagnostics de moins**. Le lint et CodeQL pour `1df6f81` sont **success**.

**Deux corrections ciblées supplémentaires :**
- [`bf2e8f5`](https://github.com/twister65/Nault/commit/bf2e8f5a33ef75ec29eb866ac2f32acd8657f1a8) : `RepresentativeService` utilise des tableaux/subjects typés (représentants stockés, détails, changement recommandé), un état initial `[null]` conservé pour l'attente, et un poids de vote total nullable. `ApiService.representativesOnline` déclare le dictionnaire de réponses et son éventuel champ `error`. Les règles de préférence/confiance des représentants sont inchangées.
- [`2da219b`](https://github.com/twister65/Nault/commit/2da219baadd0e043613049811384866cbbff5eb3) : annotations des conversions hexadécimal/uint4/uint5/uint8, montants Nano, génération des clés, contrôle d'adresse, difficulté PoW et utilitaires de tableaux. La bibliothèque `nacl` externe reçoit une interface de type explicite. Les paramètres optionnels de `blake2b` passent de `null` à `undefined` pour correspondre au typage publié, sans changer la clé de hachage effective. **Ceci ne prouve pas une validation cryptographique : les tests restent nécessaires.**

**CI et limites :** [Lint de `bf2e8f5` 39887072859](https://github.com/twister65/Nault/actions/runs/39887072859) et [CodeQL 39887072776](https://github.com/twister65/Nault/actions/runs/39887072776) : **success**. La CI Web sur le commit `2da219b` est [39887249708](https://github.com/twister65/Nault/actions/runs/39887249708), **en attente lors de cette note** ; ne pas lui attribuer un succès. Comparer les diagnostics de **ce** run à 831 après sa conclusion et corriger d'éventuelles incompatibilités de signature induites par les types plus précis.

**Ordre conseillé :** réparer d'abord les régressions potentielles de typage dans `RepresentativeService`/`UtilService` révélées par la CI, puis typer `wallet.service.ts` et les composants consommateurs. **Isoler `musig.service.ts`** : l'interface WASM et ses pointeurs/mémoires exigent vérification particulière ; ne pas corriger par des assertions arbitraires et ne pas toucher au protocole/signatures sans preuve de non-régression. Réexécuter les tests Web/PWA, Electron, RPC, Nano et Ledger simulés sur le même SHA après obtention d'une compilation fonctionnelle.

**Contraintes :** conserver les options strictes de TypeScript 6, ne pas fusionner dans `master`, ne pas réécrire l'historique, ne pas modifier Apache/whitelist CORS ni déployer l'Angular 22 cassé. Aucun nouveau test matériel Bluetooth avant validation finale d'Angular 22 ; reconnexion Nano X toujours ouverte (contournement `Clear session`).

---

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

### Affichage du commit réellement compilé (PR #27, 27 octobre 2026)

- Nouvelle entrée **Paramètres → À propos de Nault** ; affiche le SHA court (7 caractères) sous forme de lien vers `twister65/Nault/commit/<SHA complet>`, avec dictionnaires EN/FR/ES.
- `scripts/write-build-info.cjs` écrit `src/assets/build-info.json` avant les compilations `npm run wallet:build`, `npm run wallet:build-desktop` et `npm run build`. Source : `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA` ou `git rev-parse HEAD`, sous validation stricte d'un SHA hexadécimal à 40 caractères. Aucun identifiant fictif n'est affiché si absent.
- Le fichier généré est ignoré par Git et inclus dans les assets du bundle Angular ; la PWA utilise son cache de version Angular pour les fichiers `/assets/**`. L'affichage ne dépend **pas** du HEAD courant de GitHub ni du cache de DevTools.
- Commandes de validation : `npm run test:build-info`, `npm run wallet:build`, `npm run desktop:build`, `npm test -- --watch=false --browsers=ChromeHeadlessCI --progress=false`. Vérifier sur la PWA ChromeOS/Android et sur les packages Electron, avec un commit connu.
- Cette fonction est **isolée dans la PR #27** ; aucune fusion dans `master` ni validation matérielle implicite.

### Rectificatif « Commit GitHub non disponible » — PR #27 (27 octobre 2026)

- Signalement sur la PWA Android du commit `af40133` : **À propos de Nault → Commit GitHub : Non disponible**, alors que Vercel affiche `Nault build commit: af40133`. L'échec précis de récupération du JSON distant n'a pas pu être établi côté utilisateur.
- Correctif : **suppression du fetch runtime** vers `assets/build-info.json` ; SHA complet injecté en tant que constante `__NAULT_BUILD_COMMIT__` par `ng build --define`. Cela rend le SHA indissociable du bundle JavaScript Angular/PWA ou Electron exécuté, et évite les désaccords de cache avec les assets.
- Le script `scripts/build-with-revision.cjs` encadre `npm run build`, `npm run wallet:build` et `npm run wallet:build-desktop` : SHA détecté strictement sur 40 hexadécimaux via Vercel, GitHub Actions ou `git rev-parse HEAD`, passé sous forme littérale JSON à Angular. Absence de SHA vérifiable : `null` et « Non disponible », jamais de commit inventé. Valeur `null` par défaut en développement et tests unitaires.
- Le test `npm run test:build-info` vérifie les arguments `--define` Web et desktop, y compris les guillemets, la base Electron relative et le rejet des entrées malformées. Un test Jasmine vérifie que la page À propos n'a plus besoin d'une requête HTTP.
- Le champ enregistré du portefeuille, les clés, WebBluetooth/WebHID, RPC, PoW et le Service Worker restent inchangés. Exiger Merge gate vert, puis déploiement de test Android sans fusion dans `master`. Vérifier « À propos » avec le SHA du nouveau déploiement.

### Compte rendu final des validations matérielles PR #27 — 27 octobre 2026

**Version PWA testée :** `5b8be63`, déployée sur `https://nault-android-test.vercel.app` (Vercel READY). **État GitHub :** PR #27 en Draft vers `upgrade/angular-22`, aucune fusion dans `master`.

**ChromeOS / PWA (validation utilisateur) :**
- **Ledger Nano S Plus :** reconnexion USB réussie, détection/mémorisation du modèle après reconnexion d'un ancien portefeuille, option de reconnexion Bluetooth masquée après déconnexion ; aucune reconfiguration ni suppression des données nécessaire.
- **Ledger Nano X :** reconnexions USB et Bluetooth validées, les deux modes restent proposés.

**Android / tablette (validation utilisateur, déclarative, sans accès distant au matériel) :**
- Affichage du commit exact `5b8be63` dans **Paramètres → À propos de Nault** : confirmé par l'utilisateur après remplacement du chargement JSON par une constante intégrée au bundle.
- Ensemble des essais demandés avec la **Nano X Bluetooth** déclaré **validé** par l'utilisateur : disponibilité du transport BLE sans USB sur Android, connexion/déconnexion/reconnexion, conservation de l'identité du portefeuille (adresse/solde), annulation du sélecteur Bluetooth sans notification trompeuse.
- Cette validation couvre la tablette de test et les interactions rapportées ; elle ne remplace pas une campagne matérielle sur tous les modèles Android, et aucun journal APDU complémentaire n'a été fourni.

**CI du dernier commit applicatif `5b8be63` :**
- **Merge gate : SUCCESS** (run GitHub Actions `40575536326`) : régressions Angular ciblées et complètes, build Web/desktop, lint, audit de dépendances, CodeQL Advanced v4 publié.
- **Electron App Release : SUCCESS** (run `40575536322`) avec packages Linux, Windows et macOS Intel ; le workflow spécifique `macOS Web Bluetooth test build` est **skipped**, sans validation matérielle macOS.
- **Linting : SUCCESS**, **Docker Hub : SUCCESS** ; Vercel Android Test : READY.
- **Prochaine étape facultative :** revue de la PR #27 et décision explicite de sortie de Draft / fusion après les dernières validations demandées. Aucune fusion ni déploiement de production Nault n'est autorisé par ce compte rendu.

## Post-merge security hardening: electron-updater (27 October 2026)

- Scope: **isolated PR** against `master`; leave Angular 22, Electron 44, Ledger IPC/transport, PoW and RPC unchanged. No deployment/merge without successful review.
- Dependabot alert #25 ([GHSA-9jxc-qjr9-vjxq](https://github.com/advisories/GHSA-9jxc-qjr9-vjxq), CVE-2024-39698): `electron-updater@4.3.5` can validate the Windows signature of a *different file* after a compromised update manifest, due to shell environment-variable expansion. The fix starts with 6.3.0-alpha.6; **6.8.12** is the published stable release from 26 October 2026.
- New stable 6.8.12 also hardens redirects and credential stripping during differential downloads; requires patched `builder-util-runtime@9.7.1`, `js-yaml@4.3.2` and `semver >=7.5.2`. Regenerate `package-lock.json` via an isolated Actions npm registry job; do not hand-invent dependency integrity checksums.
- The old updater constructor deliberately sets `autoDownload=false` (update download only with user confirmation) and packaged applications call `checkForUpdates()` on startup. Keep the user decision and packaged-only guard. New `electron-updater` events use a single `UpdateInfo` argument rather than legacy positional event/note/name arguments; the event listeners in Nault do not require payload fields.
- Regression: `npm run test:electron-updater-security` checks **the resolved npm lockfile**, not only package.json; retain TypeScript Electron main compilation and package builds Linux / Windows / macOS (Intel and ARM where available). After CI, test a signed Windows installer update (publisher name, valid signature, rejected/tampered signature, user decline), and a manual Linux/macOS update check before release.
- Threat model: a correct version of `electron-updater` does not replace a properly configured code signing identity, trusted HTTPS release channel or a test for compromised manifests. The existing test artifacts are unsigned; package build success is not a signed auto-update end-to-end test.
- After this PR, refresh GitHub's default-branch Dependabot alerts (updater, `builder-util-runtime`, `js-yaml` and updater's `semver`). Other `semver` copies and the pre-existing S-01 hot-wallet-seed issue require separate remediation.

## Post-merge Dependabot: semver ReDoS isolated fix (27 October 2026)

- Goal: address [GHSA-c2qf-rxjj-qqgw](https://github.com/advisories/GHSA-c2qf-rxjj-qqgw) / CVE-2022-25883 on **both** outstanding Dependabot semver alerts (#15, #70), without any Ledger transport library, Angular 22, Electron 44 or Electron updater version change.
- Actual baseline lockfile on master: Ledger `@ledgerhq/devices@7.0.2 → semver@7.3.7`; legacy `node-abi@2.30.1 → semver@5.7.1`, shared by native HID dependencies; `make-dir@2.1.0` and `tiny-async-pool@1.3.0` also require semver 5.x. A separate development-only `istanbul-lib-report` copy uses `semver@6.3.0`, also vulnerable according to the GHSA. All must remain on their respective compatible major branch.
- Scoped npm overrides: Ledger devices `semver@7.8.5`; version-scoped `node-abi@2.30.1`, `tiny-async-pool@1.3.0` and `make-dir@2.1.0` retain patched `semver@5.7.2`; separately, `make-dir@3.1.0` (under Istanbul reporter) retains patched `semver@6.3.1`. No global semver-major forcing; no wallet crypto behavior changes.
- Registry-derived lockfile generated via an isolated short-lived GitHub Actions workflow (subsequently remove that workflow before merge). Never manually synthesize integrity checksums.
- New `npm run test:semver-security` checks **every installed semver copy**, asserts patched minimums by major and verifies parent-resolution compatibility (Ledger/native), pinned versions, and integrity hashes. Run via full Merge gate and Angular22 CI alongside existing Ledger mock transport, RPC, Karma, Playwright and desktop builds on Linux/Windows/macOS.
- After merge, user checks refreshed GitHub Dependabot inventory; pre-existing S-01 and unrelated `lodash`, `tar-fs` and development-tool advisories are separate PRs.

- Important pre-CI correction: a broad `node-abi` override incorrectly assigned semver 5.x to `node-abi` 3.x/4.x, whose declared dependency is semver 7.x. Scope the override to `node-abi@2.30.1` and validate the **declared semver major of every consumer**. Initial temporary lockfile sync/test run was rejected by the new tests; later lockfile revisions require a fresh all-green CI before merge.
