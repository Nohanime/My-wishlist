# 🎄 Wishlist — Liste de cadeaux

Un site de liste de souhaits de Noël avec scraping automatique de produits.

## Lancer en local

```bash
npm install
npm start
# → http://localhost:3000
```

## Déployer sur Railway (gratuit)

1. Crée un compte sur https://railway.app
2. New Project → Deploy from GitHub (ou upload le dossier)
3. Railway détecte automatiquement Node.js
4. Le site est en ligne en 2 min 🚀

## Déployer sur Render (gratuit)

1. Crée un compte sur https://render.com
2. New → Web Service → connecte ton repo GitHub
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Free tier disponible

## Déployer sur Fly.io

```bash
npm install -g flyctl
fly launch
fly deploy
```

## Structure

```
wishlist/
├── src/
│   └── server.js      # API Express + scraping
├── public/
│   └── index.html     # Frontend
├── wishlist.db        # Base SQLite (créée au démarrage)
└── package.json
```

## Fonctionnalités

- ✅ Scraping automatique Amazon, Fnac, Cdiscount, LDLC, + générique
- ✅ Ajout manuel en fallback
- ✅ Espace admin : gérer les articles, voir les réservations
- ✅ Espace amis : voir la liste, réserver en son prénom
- ✅ Base de données SQLite persistante
- ✅ Style Noël festif 🎄

## Note sur Amazon

Amazon bloque parfois les requêtes automatiques. Si ça ne fonctionne pas,
utilise l'ajout manuel (bouton ✏️) ou essaie un autre lien de la même page.
