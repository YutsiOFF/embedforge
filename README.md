# EmbedForge

Bot Discord de creation d'embeds + constructeur web statique (GitHub Pages).

- `/embed create` : modale (titre, description, couleur, image, miniature) puis apercu prive avec boutons
- `/embed import` : coller un JSON exporte par le site
- `/embed aide` : mode d'emploi + lien du site
- Site : apercu Discord en direct, modeles, editeur de champs, export JSON / code discord.js

## 1. Prerequis

- Node.js 18 ou plus (`node -v`)
- Une application Discord : https://discord.com/developers/applications

## 2. Creer l'application Discord

1. **New Application** -> nom `EmbedForge`
2. Onglet **Bot** -> **Reset Token** -> copie le token
3. Onglet **General Information** -> copie l'**Application ID** (CLIENT_ID)
4. **OAuth2 -> URL Generator** : scopes `bot` + `applications.commands`,
   permissions `Send Messages`, `Embed Links`, `Read Message History`
5. Ouvre l'URL generee pour inviter le bot
6. (Optionnel) Mode developpeur Discord active, clic droit sur le serveur -> copier l'ID (GUILD_ID)

## 3. Configuration

```bash
copy .env.example .env
```

Remplis `.env` :

```env
DISCORD_TOKEN=ton_token
CLIENT_ID=ton_application_id
GUILD_ID=id_du_serveur
SITE_URL=https://yutsioff.github.io/embedforge/
```

## 4. Installation et lancement

```bash
npm install
npm run deploy   # enregistre la commande /embed
npm start        # demarre le bot
```

Le bot affiche `Connecte en tant que ...`, puis dans Discord : `/embed create`.

## 5. Utilisation

| Bouton | Effet |
| --- | --- |
| Ajouter un champ | modale nom / valeur / inline (25 max) |
| Auteur / Footer | auteur, footer, horodatage |
| JSON | affiche le JSON de l'embed courant |
| Envoyer | ouvre un selecteur de salon puis publie |
| menu Retirer un champ | supprime un champ precis |

L'apercu est prive (ephemeral) et expire apres 30 minutes d'inactivite.

## 6. Publier le site (GitHub Pages)

1. Push le depot sur GitHub (ou double-clique `push-github.cmd`)
2. **Settings -> Pages**
3. **Source : Deploy from a branch**, branche `main`, dossier `/docs`, **Save**
4. Le site sort sur `https://<pseudo>.github.io/<repo>/`

Le site fonctionne sans serveur : il ne produit que du JSON, que le bot consomme
via `/embed import`. Aucun secret n'est expose cote web.

## 7. Structure

```
src/
  index.js            point d'entree
  deploy-commands.js  enregistrement de /embed
  interactions.js     boutons, menus, modales
  modals.js           formulaires Discord
  ui.js               apercu + composants
  commands/embed.js   commande slash
  lib/embed.js        validation des limites Discord
  lib/sessions.js     etat des apercus (memoire, 30 min)
docs/                 site statique (GitHub Pages)
```

## Limites connues

- Les apercus sont stockes en memoire : un redemarrage les vide.
- Pas d'edition d'un embed deja publie.
- Le bot doit tourner quelque part (PC allume, VPS, Railway...) ; GitHub Pages n'heberge que le site.
