# Nault v1.18.3 — travaux à reprendre ultérieurement

Statut : **reporté** (18 octobre 2026). Ce document sert de liste de suivi, sans nouvelle fonctionnalité ni changement de production. Ne pas mélanger ces sujets avec la PR #9 (sécurité et CI).

## macOS — Ledger Nano X

Les builds de test macOS Intel x64 et Apple Silicon arm64 ont été générés avec succès par GitHub Actions, mais **la connexion Ledger sur un vrai Mac n'a pas encore été vérifiée**.

- [ ] Tester macOS sur matériel disponible (Intel et/ou Apple Silicon).
- [ ] Vérifier la découverte, l'appairage BLE et l'adresse Nano affichée sur la Ledger.
- [ ] Tester reconnexion après perte du signal puis **Bluetooth → USB → Bluetooth** sans redémarrage de Nault.
- [ ] Tester refus et confirmation, envoi d'un faible montant et réception, après validation de l'adresse.
- [ ] Étudier la signature du binaire et la notarisation pour une éventuelle distribution macOS.

## Android — étude Web Bluetooth

Objectif exploratoire : déterminer si **Nault Web sous Chrome Android** peut réutiliser le transport `@ledgerhq/hw-transport-web-ble` pour une Ledger Nano X. **Aucune compatibilité Android n'est actuellement validée.**

- [ ] Étudier Web Bluetooth, les contraintes HTTPS, permissions, sécurité et prise en charge de la bibliothèque Ledger sur Android.
- [ ] Créer, au besoin, une branche expérimentale distincte (p. ex. `feature/android-web-bluetooth`).
- [ ] Premier test sans transaction : découverte et appairage, lecture de l'adresse Nano et validation sur l'écran Ledger.
- [ ] Ensuite seulement : reconnexion, refus/confirmation, signature et évaluation de l'utilité d'une application native.

## État déjà validé

- Ledger Nano X sous **Linux et Windows** : Bluetooth, USB et basculement **USB → Bluetooth → USB**, sans faux message d'erreur.
- [PR #7 — intégration Ledger Bluetooth](https://github.com/twister65/Nault/pull/7)
- [PR #11 — reconnexion USB après Bluetooth, fusionnée](https://github.com/twister65/Nault/pull/11)

## Priorité actuelle

Reprendre [PR #9 — sécurité/CI et Merge gate](https://github.com/twister65/Nault/pull/9). Son traitement reste **entièrement séparé** de ces travaux macOS/Android.
