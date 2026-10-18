# Nault v1.18.3 — travaux à reprendre ultérieurement

Statut au **18 octobre 2026** : Android testé avec succès sur une vraie Ledger Nano X ; macOS reste à valider matériellement. Document de suivi uniquement, sans changement de production ni fusion dans `master`.

## macOS — Ledger Nano X

Les builds de test macOS Intel x64 et Apple Silicon arm64 ont été générés avec succès par GitHub Actions, mais **la connexion Ledger sur un vrai Mac n'a pas encore été vérifiée**.

- [ ] Tester macOS sur matériel disponible (Intel et/ou Apple Silicon).
- [ ] Vérifier la découverte, l'appairage BLE et l'adresse Nano affichée sur la Ledger.
- [ ] Tester reconnexion après perte du signal puis **Bluetooth → USB → Bluetooth** sans redémarrage de Nault.
- [ ] Tester refus et confirmation, envoi d'un faible montant et réception, après validation de l'adresse.
- [ ] Étudier la signature du binaire et la notarisation pour une éventuelle distribution macOS.

## Android — Nault Web / Ledger Nano X : VALIDATION MATÉRIELLE

**Confirmé par l'utilisateur le 18 octobre 2026**, avec Chrome sur tablette Android et Ledger Nano X :

- [x] Chargement de la véritable application Nault Web hébergée en HTTPS chez Vercel : https://nault-android-test.vercel.app (accès protégé Vercel Authentication).
- [x] Reconnexion Bluetooth depuis Nault Web, sélection de la Ledger Nano X, sans erreur constatée.
- [x] Lecture de l'adresse Nano et comparaison avec l'adresse affichée sur la Ledger : **identique**.
- [x] **Envoi de 1 XNO effectué avec succès** selon le testeur ; aucune erreur rapportée. Le test ne constitue pas un audit de tous les scénarios de signature ou une vérification indépendante de la confirmation du bloc sur réseau.
- [x] Source effective : véritable Angular compilé sur la branche `gh-pages` depuis `master` au commit `fde5bb8b0aa8c0777553b02ae23a6f05a771cabd` (déploiement intermédiaire `434b1dc`).
- [x] Branche dédiée au déploiement, **sans modification de `master`** : [`deploy/android-ledger-web-test`](https://github.com/twister65/Nault/tree/deploy/android-ledger-web-test).

**Tests complémentaires facultatifs avant qualification Android plus large :**

- [ ] Déconnexion / perte de signal prolongée et reconnexion, plusieurs cycles successifs.
- [ ] Refus de signature, réception et changement de représentant, sur un compte de test avec faible montant.
- [ ] Changement de tablette/version Chrome, nettoyage des autorisations GATT, vérification sécurité/permissions.
- [ ] Évaluer si une application Android native apporterait une valeur réelle ; **aucun APK n'est nécessaire pour le premier résultat fonctionnel**.

## État déjà validé

- Ledger Nano X sous **Linux et Windows** : Bluetooth, USB et basculement **USB → Bluetooth → USB**, sans faux message d'erreur.
- Ledger Nano X sous **Android / Chrome Web** : reconnexion Bluetooth, adresse confirmée sur appareil, et envoi de **1 XNO** rapporté réussi (18 octobre 2026).
- [PR #7 — intégration Ledger Bluetooth](https://github.com/twister65/Nault/pull/7)
- [PR #11 — reconnexion USB après Bluetooth, fusionnée](https://github.com/twister65/Nault/pull/11)

## Priorité actuelle

[PR #9 — sécurité/CI et Merge gate](https://github.com/twister65/Nault/pull/9) : **fusionnée** dans `master` (commit `fde5bb8`). Poursuivre les vérifications de sécurité distinctement. Priorités plateforme : tests macOS sur matériel réel, puis robustesse Android si nécessaire.
