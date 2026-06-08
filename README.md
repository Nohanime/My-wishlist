# Wishlist v2

Liste de souhaits avec auth, rôles admin/guest et participants multiples par cadeau.

## Stack
- **Backend** : Node.js / Express
- **DB** : PostgreSQL (Railway)
- **Auth** : JWT en cookie httpOnly + bcrypt

---

## Déploiement sur Railway

### 1. Créer le projet

1. Va sur [railway.app](https://railway.app) → New Project
2. **Add PostgreSQL** → Railway crée la DB et injecte `DATABASE_URL` automatiquement
3. **Add Service → GitHub Repo** (ou "Deploy from local" avec le CLI)

### 2. Variables d'environnement

Dans Railway → ton service → Variables, ajoute :

| Variable | Valeur |
|---|---|
| `ADMIN_EMAIL` | ton@email.com ← **ton vrai email** |
| `JWT_SECRET` | une longue chaîne aléatoire (ex: `openssl rand -hex 32`) |
| `NODE_ENV` | `production` |

`DATABASE_URL` est injectée automatiquement par Railway, pas besoin de la mettre.

### 3. Premier déploiement

Railway détecte Node.js, lit `package.json` et lance `npm start` automatiquement.

### 4. Créer ton compte admin

Une fois le site en ligne :
1. Va sur ton URL Railway
2. Clique **Connexion → Créer un compte**
3. Utilise **exactement l'email** que tu as mis dans `ADMIN_EMAIL`
4. Tu auras automatiquement le badge admin et l'onglet "Gérer"

---

## Dev local

```bash
# 1. Copier le fichier d'env
cp .env.example .env
# Remplir DATABASE_URL avec une Postgres locale ou Railway

# 2. Installer
npm install

# 3. Lancer
npm run dev   # avec nodemon
# ou
npm start
```

---

## Fonctionnement

### Rôles
- **Admin** : l'email dans `ADMIN_EMAIL` — peut ajouter/supprimer des articles, voir les participations, retirer n'importe qui d'un cadeau
- **Connecté** : pseudo mémorisé, peut participer sans retaper son nom, peut se retirer
- **Invité** : entre son prénom à la main, mémorisé en localStorage, peut participer et se retirer

### Participer à un cadeau
- Plusieurs personnes peuvent rejoindre le même cadeau (participation libre)
- Les participants apparaissent en chips dorées sous chaque article
- Chacun peut se retirer en cliquant le × sur son chip

### Scraping
Fonctionne sur Amazon, Fnac, Cdiscount, LDLC, Boulanger, Darty et la majorité des sites e-commerce via og:title / og:image / JSON-LD.
Si un site bloque les robots → bouton ✏️ pour ajout manuel.
