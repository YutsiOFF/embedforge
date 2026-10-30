# EmbedForge

Bot Discord de creation d'embeds + constructeur web statique (GitHub Pages).

- `/embed create` : modale (titre, description, couleur, image ou GIF, miniature) puis apercu prive avec boutons
- `/embed import` : coller un JSON exporte par le site
- `/embed aide` : mode d'emploi + lien du site
- Jusqu'a 10 embeds empiles dans un seul message (navigation ◀ ▶, ajout, suppression, duplication)
- GIF animes : colle l'URL directe du fichier (`.gif`, `.webp`, `.apng`)
- Site : apercu Discord en direct, onglets d'embeds, modeles, editeur de champs, export JSON / code discord.js

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
| Ajouter un champ | modale nom / valeur / inline (25 max par embed) |
| Auteur / Footer | auteur, footer, horodatage de l'embed courant |
| Modifier | rouvre titre / description / couleur / image / miniature du bloc courant |
| JSON | affiche le JSON de tout le message (un objet, ou `{ embeds: [...] }`) |
| Envoyer | ouvre un selecteur de salon puis publie tous les embeds ensemble |
| ◀ ▶ | passe d'un embed a l'autre |
| Ajouter un embed | empile un nouveau bloc (10 maximum) |
| 🗑️ | supprime le bloc courant |
| menu Retirer un champ | supprime un champ precis du bloc courant |

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

## 6 bis. Plusieurs embeds et GIF

Discord accepte **10 embeds par message** et **6000 caracteres au total** (titre, description,
champs, auteur, footer confondus). Le bot et le site appliquent ces deux limites : au-dela, les
derniers blocs sont retires et un avertissement s'affiche dans l'apercu.

Pour un GIF, il faut **l'URL du fichier**, pas la page d'un site :

- ✅ `https://media.giphy.com/media/xxxx/giphy.gif`
- ✅ `https://i.imgur.com/xxxx.gif`
- ❌ `https://tenor.com/view/...` (page HTML, Discord ne l'affiche pas)

Sur Tenor ou Giphy : clic droit sur le GIF -> *Copier l'adresse de l'image*.
Le site convertit automatiquement les liens Giphy et Imgur connus ; le bot fait de meme.

## Limites connues

- Les apercus sont stockes en memoire : un redemarrage les vide.
- Pas d'edition d'un embed deja publie.
- La modale d'import est limitee a 4000 caracteres par Discord : un JSON de 2-3 gros embeds peut
  depasser. Dans ce cas, importe le reste via un second `/embed import` ou allege les descriptions.
- Le bot doit tourner quelque part (PC allume, VPS, Railway...) ; GitHub Pages n'heberge que le site.
