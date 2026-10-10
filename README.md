# Fortune Atlas

Visualiseur externe d'un vault [FortuneMemory](https://github.com/itsrealfortune/chlone) : graphe de similarité 3D, arbre POSIX des scopes, timeline. Lecture seule — le bot n'est jamais bloqué ni modifié.

## Démarrage

```bash
bun install   # rien à installer en pratique (bun:sqlite intégré)
bun src/server.ts        # live : http://127.0.0.1:8471
bun src/export.ts        # statique : atlas-static.html (données inline)
```

Variables d'environnement :

| Variable | Défaut | Rôle |
|---|---|---|
| `FORTUNE_ATLAS_DB` | `../clone/data/fortunememories.db` | vault sqlite à lire |
| `FORTUNE_ATLAS_PORT` | `8471` | port du mode live |

## Vues

- **Graphe** : nœuds = souvenirs, arêtes = similarité **cosinus (vecteurs) OU Jaccard (lexique)** au-dessus des seuils réglables. 🟢 les deux · 🔵 vectoriel seul · 🟠 lexical seul. Layout force-directed temps réel, plafond d'arêtes configurable. Lisibilité : éclairage + brouillard de profondeur, taille des nœuds proportionnelle au degré, opacité des arêtes selon leur force, sélection qui isole un nœud et ses voisins (halo + étiquettes 2D projetées), recadrage automatique de la vue (plongée pour les layouts plats).
- **Scopes** : colonnes Miller sur la déclinaison POSIX (`discord → dm → 9950101… → souvenirs`), avec compteurs.
- **Timeline** : axe `created_at`, bandes par branche (`global` / `discord` / `personal`).
- **Fiche** : contenu intégral, métadonnées, voisins proches cliquables, frères du même scope.

## API (mode live)

- `GET /api/memories` — souvenirs + vecteurs
- `GET /api/edges?k=3&minSim=0.15` — arêtes k-NN cosinus pré-calculées
- `GET /api/scopes` — arbre des scopes

## Confidentialité

`atlas-static.html` embarque l'intégralité du vault : il est gitignoré et ne doit jamais être commité ni partagé tel quel. Le mode live ne lie que `127.0.0.1` et ouvre la base en lecture seule.

## Roadmap

- [x] Pelures de sensibilité, graphe des tags, radar anniversaires/périssables
- [ ] Cimetière des oubliés, détecteur de doublons par `content_hash`
