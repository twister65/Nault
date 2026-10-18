# Nault Web — test Android / Ledger Nano X (18 octobre 2026)

## Origine exacte du build

Il s'agit de **la véritable application Angular Nault**, et non d'une maquette.

- Dépôt source : https://github.com/twister65/Nault
- Source : branche `master`, révision `fde5bb8b0aa8c0777553b02ae23a6f05a771cabd` (PR #9 incluse)
- Fichiers générés par GitHub Actions / `npm run wallet:build` et publiés dans `gh-pages`.
- Commit source du snapshot statique : `434b1dc8f9193b6105337bb88ff29f8001232b16`, message `Deploying to gh-pages from @ twister65/Nault@fde5bb8b0aa8c0777553b02ae23a6f05a771cabd`.
- Cette branche ne modifie pas le JavaScript Angular précompilé ; seule la configuration Vercel et cette documentation sont ajoutées.
- **Ne pas fusionner cette branche de fichiers générés dans `master`.**

## Vercel : paramétrage du projet test

Créer un projet Vercel depuis le dépôt `twister65/Nault` (GitHub connecté). Si Vercel sélectionne `master` par défaut, choisir **Settings → Environments → Production → Branch Tracking**, puis `deploy/android-ledger-web-test`. Déclencher un nouveau déploiement de cette branche si le déploiement initial venait de `master`.

- Framework Preset : **Other**
- Root Directory : `./`
- Build Command : **Override activé, commande vide** (pas de compilation npm, les fichiers Angular sont déjà générés)
- Output Directory : `.`
- Install Command : laisser vide / désactiver (aucune dépendance à installer)
- Variables d'environnement : **aucune**, ne fournir aucun secret
- HTTPS : fourni par Vercel
- Contrôle d'accès : pour un site non public, activer **Vercel Authentication → All Deployments** dans **Settings → Security → Deployment Protection**, avant de communiquer le lien. Connecter le navigateur Chrome Android au compte autorisé pour accéder au site. Un site `vercel.app` non protégé reste publiquement accessible, même si `robots.txt` décourage l'indexation.

Si l'interface Vercel propose d'importer d'abord `master`, corriger la branche de production avant les tests. La branche de production correcte doit afficher un `index.html` directement à sa racine.

## Test Android — sans transfert de fonds au départ

1. Ouvrir l'adresse HTTPS depuis **Chrome Android directement** (pas un aperçu incorporé ni un iframe).
2. Déverrouiller la Ledger Nano X et ouvrir l'application Nano ; Bluetooth activé et batterie suffisamment chargée.
3. Dans Nault : **Settings → Configure new wallet → Use Ledger → Connect via Bluetooth**, ou reconnecter uniquement un portefeuille Ledger déjà configuré. Ne pas importer ni saisir une seed.
4. Choisir la Ledger dans l'interface Bluetooth Android et vérifier toute demande de confirmation d'appairage.
5. Confirmer **l'adresse Nano sur l'écran physique Ledger**, sans signer de transaction.
6. Noter le message d'erreur exact, la version de Chrome Android et l'étape atteinte (sélection, GATT, notifications, MTU, adresse). Ne jamais transmettre seed, clé privée, PIN, signature ou APDU.

## Limites

Le bon fonctionnement sous Linux/Windows Electron ne constitue pas une validation du transport Web Bluetooth sous Chrome Android. Les correctifs natifs USB et IPC ne s'appliquent pas au navigateur Android. L'app peut conserver un service worker et des données locales ; pour une comparaison équitable, commencer dans un profil Chrome sans données Nault antérieures.

Ne pas effectuer de transaction avant la validation complète du chemin BLE, du compte et des éventuels écarts RPC.

