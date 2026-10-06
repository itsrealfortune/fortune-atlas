# Politique de confidentialité — Fortune

Bot Discord conversationnel : clone virtuel qui génère chaque réponse à
partir des messages des salons surveillés et de leur historique récent.

## 1. Données traitées

- **Contenu des messages** des salons surveillés et historique récent du
  salon — uniquement pour générer les réponses contextuelles.
- **Faits extraits** (préférences, événements, relations dits par les
  utilisateurs) avec provenance.
- **Identifiants techniques** nécessaires au fonctionnement (IDs salon,
  auteur, horodatages).

## 2. Stockage et chiffrement

- Vault de mémoire (SQLite) et journaux d'exploitation sur machine
  personnelle, France. Journaux rotatifs et plafonnés.
- **Contenus et résumés chiffrés au repos (AES-256-GCM)** ; clé de 256 bits
  hors dépôt (variable d'environnement, jamais commitée). Seules les
  métadonnées de routage (scope, tags, type, sensibilité) et les vecteurs
  de recherche non réversibles restent en clair.
- Données jamais revendues, jamais partagées, **jamais utilisées pour
  entraîner une IA** (inférence uniquement).

## 3. Durée et effacement

Conservation jusqu'à effacement, car la mémoire long terme est la fonction
du bot. À tout moment, sans justification :

- **Commande `--oublie-moi`** (dans n'importe quel salon surveillé) :
  oublie tous vos souvenirs, supprime votre session si DM, et vous ignore
  définitivement (plus aucune réponse, plus aucun stockage, plus de
  sollicitation). `--reviens-moi` annule l'exclusion.
- **MP Discord à `itsrealfortune`** (ID `301492402999263235`) pour toute
  demande d'accès, rectification ou suppression.
- Les commandes `--reset-session` / `--reset-all-sessions` sont des outils
  d'administration du salon, pas un droit en libre-service.

## 4. Sécurité

Accès serveur restreint, secrets hors dépôt, surface minimale (localhost +
tunnel). En transit : TLS Discord.

## 5. Contact et droits

MP Discord à `itsrealfortune` pour l'accès, la rectification et la
suppression de vos données.
