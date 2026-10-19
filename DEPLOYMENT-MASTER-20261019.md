# Déploiement Web Nault — 19 octobre 2026

La branche contient **la véritable version Angular compilée du master**, produite dans `gh-pages` par [GitHub Actions](https://github.com/twister65/Nault/actions/runs/39204955247).

- Dernier commit de source `master` : `f5c10f031bd1f4f0061743b80fdcce881b4241e2`.
- Commit de compilation statique : `73d7216bb7f815a8f810a205f27ecab1fb3e6659`.
- Test URL (protégée par Vercel Authentication) : https://nault-android-test.vercel.app/
- Hébergement purement statique : RPC, WebSocket et PoW sont choisis dans les paramètres du navigateur Nault, pas hébergés sur Vercel.
- La configuration `vercel.json` fournit la résolution des routes Angular et des en-têtes HTTP pour Chrome / Android.
- **Aucune seed, clé privée, adresse sensible, identifiant RPC ou jeton d'authentification ne doit être placé dans ce dépôt.**
- Cette branche de publication ne doit **pas** être fusionnée dans `master`, car elle contient seulement des fichiers Angular générés.

Test de régression souhaité sur Android : lecture d'adresse Nano X, reconnexion Bluetooth, stabilité des connexions RPC/WebSocket. Faire le premier test sans transaction et diagnostiquer les déconnexions réseau avant nouvelle opération.
