# EmbedForge

Bot Discord de creation d'embeds + constructeur web statique (GitHub Pages).

- `/embed create` : modale (titre, description, couleur, image ou GIF, miniature) puis apercu prive avec boutons
- `/embed import` : coller un JSON exporte par le site
- `/embed aide` : mode d'emploi + lien du site
- Jusqu'a 10 embeds empiles dans un seul message (navigation ◀ ▶, ajout, suppression, duplication)
- GIF animes : colle l'URL directe du fichier (`.gif`, `.webp`, `.apng`)
- Site : apercu Discord en direct, onglets d'embeds, modeles, editeur de champs, export JSON / code discord.js
- Envoi direct depuis le site : connexion Discord, choix du serveur et du salon, publication par le bot

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
DISCORD_CLIENT_SECRET=ton_client_secret   # pour l'envoi direct depuis le site
API_PORT=3000
API_PUBLIC_URL=http://localhost:3000
```

## 4. Installation et lancement

```bash
npm install
npm run deploy   # enregistre la commande /embed
npm start        # demarre le bot
```

Le bot affiche `Connecte en tant que ...`, puis dans Discord : `/embed create`.

### Windows : double-clic, sans terminal

| Fichier | Role |
| --- | --- |
| `start-bot.cmd` | verifie Node, `.env` et les dependances, lance le bot et le **redemarre tout seul** s'il plante. Garde la fenetre ouverte. |
| `demarrage-auto.cmd` | cree un raccourci dans le dossier *Demarrage* de Windows : le bot se lance a chaque ouverture de session (`demarrage-auto.cmd /off` pour annuler) |
| `push-github.cmd` | commit + push du projet sur GitHub |

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
start-bot.cmd         lancement Windows avec redemarrage auto
demarrage-auto.cmd    bot lance a l'ouverture de session
src/
  index.js            point d'entree
  api.js              API HTTP : OAuth2 Discord, liste des salons, envoi
  deploy-commands.js  enregistrement de /embed
  interactions.js     boutons, menus, modales
  modals.js           formulaires Discord
  ui.js               apercu + composants
  commands/embed.js   commande slash
  lib/embed.js        validation des limites Discord
  lib/sessions.js     etat des apercus (memoire, 30 min)
docs/                 site statique (GitHub Pages)
  send.css            styles de la carte d'envoi direct
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

## 8. Rendre le bot en ligne 24/7

Un bot Discord garde une connexion permanente : il lui faut une machine allumee en continu.
GitHub Pages ne peut pas l'heberger (site statique uniquement).

### Option A - gratuit, ton PC (le plus simple)

Double-clique `start-bot.cmd`, puis `demarrage-auto.cmd` une fois : le bot se relance a chaque
demarrage de Windows et se reconnecte seul apres un crash.
Limite : il est hors ligne des que le PC est eteint ou en veille. Reglage utile :
Parametres -> Systeme -> Alimentation -> *Mettre en veille* = **Jamais** (sur secteur).

### Option B - gratuit, vrai 24/7 : Oracle Cloud Always Free

Seule offre gratuite serieuse pour un process permanent (les offres gratuites de Railway et
Fly.io ont disparu, et les services gratuits de Render s'endorment). Il faut une carte bancaire
pour verifier l'identite (aucun debit sur le *Always Free*).

1. Compte sur https://www.oracle.com/cloud/free/ puis **Compute -> Instances -> Create**
2. Image **Ubuntu 22.04**, shape **VM.Standard.A1.Flex** (Ampere ARM, dans le quota gratuit)
3. Telecharge la cle SSH proposee, puis connecte-toi : `ssh ubuntu@IP_PUBLIQUE`
4. Installe Node puis le bot :

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
git clone https://github.com/YutsiOFF/embedforge.git && cd embedforge
npm install --omit=dev
nano .env     # colle DISCORD_TOKEN, CLIENT_ID, GUILD_ID, SITE_URL
node src/deploy-commands.js
```

5. Service systemd (redemarrage auto, demarre avec la machine) :

```bash
sudo tee /etc/systemd/system/embedforge.service >/dev/null <<'EOF'
[Unit]
Description=EmbedForge Discord bot
After=network-online.target

[Service]
WorkingDirectory=/home/ubuntu/embedforge
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
User=ubuntu

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now embedforge
sudo systemctl status embedforge     # doit afficher active (running)
journalctl -u embedforge -f          # logs en direct
```

Mise a jour du bot : `cd ~/embedforge && git pull && npm install --omit=dev && sudo systemctl restart embedforge`.

## 7 bis. Envoyer directement depuis le site

Le site est statique : il ne peut pas garder un secret. L'envoi passe donc par une petite API
HTTP qui tourne **dans le bot** (`src/api.js`) et garde le client secret et le token du bot.

```
Site (GitHub Pages)  ->  API du bot  ->  Discord
   OAuth2 du compte        token du bot
```

1. `npm start` : le bot affiche `[api] http://localhost:3000`
2. Dans le site, carte **Envoyer sur Discord** : renseigne l'adresse de l'API
   (`http://localhost:3000` en local), puis **Se connecter avec Discord**
3. Choisis le serveur, le salon, puis **Envoyer le message**

Le site n'envoie que le JSON des embeds : c'est le bot qui publie, avec ses propres permissions.
Ton compte Discord ne recoit aucun droit d'ecriture.

### Configurer la connexion Discord (une seule fois)

1. Developer Portal -> ton application -> **OAuth2**
2. **Redirects** : ajoute l'adresse exacte `<API_PUBLIC_URL>/auth/discord/callback`
   (ex. `http://localhost:3000/auth/discord/callback`)
3. Copie le **Client Secret** dans `.env` : `DISCORD_CLIENT_SECRET=...`
4. `SITE_URL` doit etre l'URL du site (retour apres connexion)
5. Relance le bot : `[api] envoi web actif`

Scopes utilises : `identify` (ton pseudo) et `guilds` (la liste de tes serveurs). La liste des
serveurs proposee ne contient que ceux ou le bot est present **et** ou tu es administrateur.

### Depuis le site public en https

GitHub Pages est en https : l'API doit donc etre joignable en https.

- **Tunnel gratuit** : `cloudflared tunnel --url http://localhost:3000`, puis mets l'URL
  `https://....trycloudflare.com` dans `API_PUBLIC_URL`, ajoute `<url>/auth/discord/callback`
  aux Redirects du portail, et colle la meme URL dans le champ **Adresse de l'API du bot** du site.
  Relance le bot : tant que le tunnel et le bot tournent, le site public peut envoyer.
- **Hebergement permanent** : la VM de la section 8 (nginx + https), avec
  `API_PUBLIC_URL=https://bot.mondomaine.fr`.

En local, ouvre le site sur `http://localhost:8099` (ou `file://`) : pas besoin de https.

### Option C - payant mais sans prise de tete

Un VPS a 4-5 EUR/mois (Hetzner CX22, Contabo, OVH VPS) : memes etapes qu'en option B a partir
de l'etape 4. Aucune limite de RAM, pas de risque de fermeture de compte gratuit.

## Limites connues

- Les apercus sont stockes en memoire : un redemarrage les vide.
- Pas d'edition d'un embed deja publie.
- La modale d'import est limitee a 4000 caracteres par Discord : un JSON de 2-3 gros embeds peut
  depasser. Dans ce cas, importe le reste via un second `/embed import` ou allege les descriptions.
- Le bot doit tourner quelque part (PC allume, VM Oracle gratuite, VPS) ; GitHub Pages n'heberge que le site.
- L'envoi direct exige que le bot **et son API** tournent, et que `DISCORD_CLIENT_SECRET` soit
  rempli ; sinon la carte affiche l'erreur correspondante et le JSON reste disponible.
