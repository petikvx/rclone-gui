# rclone gui

Interface locale pour [rclone](https://rclone.org/). Elle affiche les clouds déjà configurés et lance les transferts par le démon de contrôle de rclone. Les identifiants restent dans la config rclone.

Version 0.1. Imaginé par PetiK, concrétisé par Grok.

## Lancer

Il faut Node.js 22 et rclone sur le `PATH`.

```bash
npm install
npm run dev
```

Le navigateur s’ouvre sur http://127.0.0.1:5173/. L’API reste sur http://127.0.0.1:8787/, uniquement en local. Les deux ports sont fixes : s’ils sont déjà pris, arrête l’instance précédente avant de relancer.

Pour ne pas ouvrir le navigateur : `NO_OPEN=1 npm run dev`.

## Écrans

- **Nuages** — les remotes groupés par fournisseur, avec le quota quand le cloud le communique.
- **Explorateur** — deux volets. Le dossier ouvert à gauche est la source, celui de droite la destination. Chaque volet a son bouton Rafraîchir. Un clic sur un fichier propose de le copier ou de le déplacer vers l’autre côté.
- **Transfert** — copier, synchroniser ou déplacer un dossier entier. L’essai à blanc est coché par défaut. Des filtres limitent par extension et par taille. La synchro et le déplacement demandent une confirmation, parce que la synchro peut effacer à la destination ce qui n’est plus dans la source, et le déplacement retire les fichiers de la source.
- **Activité** — file en cours et journal. Un transfert se coupe avec Arrêter.
- **À propos** — crédit et historique des versions.

L’ordinateur s’appelle Local dans les listes.

## Fichiers locaux

Le journal et le journal rclone sont dans `~/.config/rclone-gui/`. Le socket du démon est dans le répertoire d’exécution de la session, sinon dans ce même dossier. Rien de tout cela ne recopie les secrets de `rclone.conf`.

## Historique

### 0.1

Première fenêtre : nuages et quotas, explorateur double volet, copie ou déplacement d’un fichier, transfert de dossier avec essai à blanc, filtres et arrêt, journal.
