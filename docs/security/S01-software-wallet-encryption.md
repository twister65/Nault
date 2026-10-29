# S-01 — Chiffrement des portefeuilles logiciels (proposition en revue)

**Source :** audit préliminaire du 12 octobre 2026, constat S-01 (élevé).
**Branche :** fix/security-s01-wallet-encryption — ne pas fusionner sans tests et autorisation.
**Périmètre :** seed Nano, clé privée et clé privée étendue. Hors périmètre : Ledger, MuSig, RPC, IPC.

## Menace et choix cryptographiques

Le format historique CryptoJS.AES.encrypt(secret, password) utilise une dérivation de mot de passe à coût faible et n'authentifie pas le ciphertext. Une copie du stockage local permet des attaques hors ligne.

Nouvelles écritures : enveloppe versionnée nault:v2:<base64(JSON)> avec sel aléatoire 16 octets, PBKDF2-HMAC-SHA-256 à **600 000 itérations**, AES-256-GCM via WebCrypto, nonce aléatoire 12 octets et tag 128 bits. Le type de portefeuille (seed, privateKey, expandedKey) entre dans les données authentifiées. La phrase de passe doit contenir **au moins 12 caractères** ; recommander une phrase de passe longue et unique.

Absence de WebCrypto sécurisé, paramètres inconnus, mot de passe trop court, corruption, ciphertext malformé ou type incorrect : **échec fermé**, sans écriture en clair et sans nouveau chiffrement historique.

## Compatibilité et migration

1. Les sauvegardes historiques CryptoJS/OpenSSL restent lisibles avec leur ancien mot de passe. Déverrouiller un portefeuille ancien ne le migre **pas** automatiquement.
2. Les nouveaux portefeuilles logiciels sont chiffrés en v2 **avant** notification de succès. Les sauvegardes déclenchées pendant la découverte des comptes ne doivent pas écrire de secret en clair.
3. L'import explicite d'un ancien backup préserve son ciphertext ; changer ensuite son mot de passe permet de passer au nouveau format.
4. La rotation de mot de passe d'un ancien portefeuille demande confirmation de l'existence d'une **sauvegarde de récupération vérifiée** et ne remplace que le stockage local. Les exports antérieurs gardent leur ancien mot de passe.
5. Une erreur de dérivation/chiffrement ou d'écriture de stockage ne doit pas remplacer l'ancienne copie. Les comptes et adresses dérivées restent inchangés.
6. Ne jamais utiliser une seed réelle dans les tests, journaux, captures, HAR, commentaires ou exemples.

La confirmation de sauvegarde est une déclaration utilisateur, **pas** une vérification cryptographique. Prévoir une restauration d'une copie fictive et une procédure de sauvegarde hors navigateur avant déploiement réel.

## Plan de validation obligatoire

- Tests Karma/Jasmine : sel/nonce distincts, aller-retour de secret fictif, mauvais mot de passe, ciphertext altéré, mauvais type, version inconnue, compatibilité legacy, absence d'écriture en clair et rollback après échec.
- Migration fictive : backup historique → déverrouillage → export inchangé → rotation explicitement confirmée → stockage v2 → redémarrage → mêmes comptes/adresses → restauration du backup v1 avec son ancien mot de passe.
- Formats : seed, privateKey, expandedKey, plusieurs index, URL/QR. Vérifier la taille du QR.
- Plateformes : ChromeOS, PWA hors ligne, Android, Electron Linux et Windows, builds macOS x64/arm64. Vérifier la disponibilité de crypto.subtle.
- Gates : compilation Angular 22, lint, Karma/Jasmine, CodeQL Advanced v4, tests de restauration, revue de sécurité et CI verte. Aucun déploiement ni fusion sans validation et accord.

## Limites et retour arrière

Cette protection concerne la seed au repos ; le secret reste en RAM quand le hot wallet est déverrouillé. Elle ne protège pas d'un malware, d'un XSS actif ou d'un keylogger. Elle ne touche pas aux seeds Ledger.

Conserver une seed de récupération hors ligne ou un export ancien **effectivement vérifié** avant migration. Ne pas effacer l'export historique après rotation ; un ancien Nault ne peut pas lire le format v2 et ne doit jamais réécrire ce stockage. Restaurer la sauvegarde historique avec une version compatible si besoin.

## Compte rendu S01-04 — ChromeOS (29 octobre 2026)

**Statut : 7/7 tests manuels réussis sur ChromeOS, avec une sauvegarde et une seed entièrement fictives.** Le libellé initial du rapport indiquait « Android », mais l'utilisateur a expressément précisé que les manipulations ont été réalisées sur **ChromeOS**. Ne pas comptabiliser ce scénario comme une validation Android.

1. Import de la sauvegarde historique CryptoJS/OpenSSL v1 au format JSON : réussi.
2. Deux comptes Nano aux index 0 et 1 retrouvés : réussi. Adresses publiques communiquées pour référence, abrégées dans ce document : index 0 `nano_3se9n8su…jwxyrkh`, index 1 `nano_181gqshx…35ipz`.
3. Verrouillage, rechargement et déverrouillage de l'ancienne sauvegarde sans migration implicite : réussi ; export toujours préfixé `U2FsdGVkX1`.
4. Rotation volontaire de mot de passe avec confirmation explicite : réussie.
5. Export du portefeuille migré : préfixe `nault:v2:` confirmé ; adresses des comptes 0 et 1 inchangées.
6. Après migration, ancien mot de passe refusé sur le portefeuille v2, nouveau mot de passe accepté : réussi.
7. Restauration de la sauvegarde v1 originale avec son mot de passe historique, mêmes comptes : réussie.

**À faire :** vérifications Android/PWA réelles, scénarios distincts de clé privée/clé étendue et URL/QR si non déjà couverts, puis revue finale du risque cryptographique avant une éventuelle fusion dans `master`. Android-test a été déployé sur le commit `7fcb8b0` avec l'accord explicite de l'utilisateur. Aucune fusion dans `master` n'est autorisée par le présent compte rendu.
