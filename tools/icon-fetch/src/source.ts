/**
 * Where the icons come from, and who to credit for them.
 *
 * game-icons.net publishes its set from the `game-icons/icons` GitHub repository, one folder
 * per author. CC BY 3.0 requires naming the author, so the folder name is load-bearing data,
 * not an implementation detail — it travels all the way into `ATTRIBUTION.md`.
 */

export const REPO_OWNER = 'game-icons';
export const REPO_NAME = 'icons';
export const REPO_REF = 'master';
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;

export const SITE_URL = 'https://game-icons.net';
export const LICENSE = 'CC BY 3.0';
export const LICENSE_URL = 'https://creativecommons.org/licenses/by/3.0/';
/** The canonical page that lists every author of the set. */
export const AUTHORS_URL = `${SITE_URL}/about.html#authors`;

export const TREE_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${REPO_REF}?recursive=1`;

/** Raw URL of one icon's SVG in the mirror. */
export function rawUrlFor(author: string, name: string): string {
  return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_REF}/${author}/${name}.svg`;
}

/** Human-facing page for one icon on game-icons.net — the link we credit in ATTRIBUTION.md. */
export function pageUrlFor(author: string, name: string): string {
  return `${SITE_URL}/1x1/${author}/${name}.html`;
}

/**
 * Author folders, most-populated first. Used only by the fallback resolver: when the GitHub
 * tree API is unavailable we probe raw URLs in this order, so the common case costs one probe.
 * A folder missing from this list still resolves via the API path.
 */
export const AUTHOR_FOLDERS: readonly string[] = [
  'delapouite',
  'lorc',
  'skoll',
  'caro-asercion',
  'viscious-speed',
  'sbed',
  'aussiesim',
  'darkzaitzev',
  'cathelineau',
  'quoting',
  'lord-berandas',
  'faithtoken',
  'willdabeast',
  'priorblue',
  'carl-olsen',
  'seregacthtuf',
  'lucasms',
  'felbrigg',
  'rihlsul',
  'pierre-leducq',
  'kier-heyl',
  'john-redman',
  'guard13007',
  'zeromancer',
  'zajkonur',
  'various-artists',
  'heavenly-dog',
  'generalace135',
  'andymeneely',
  'starseeker',
  'spencerdub',
  'sparker',
  'pepijn-poolman',
  'john-colburn',
  'irongamer',
  'catsu',
];

/**
 * `badges/` holds a separate 256×256 badge set with a different SVG shape (no background rect).
 * It is deliberately excluded: several of its filenames collide with real icons (`shield`,
 * `cog`), and picking one by accident would silently ship the wrong art.
 */
export const EXCLUDED_FOLDERS: ReadonlySet<string> = new Set(['badges']);

const AUTHOR_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  'caro-asercion': 'Caro Asercion',
  'carl-olsen': 'Carl Olsen',
  darkzaitzev: 'DarkZaitzev',
  generalace135: 'GeneralAce135',
  guard13007: 'Guard13007',
  'heavenly-dog': 'Heavenly Dog',
  'john-colburn': 'John Colburn',
  'john-redman': 'John Redman',
  'kier-heyl': 'Kier Heyl',
  'lord-berandas': 'Lord Berandas',
  'pepijn-poolman': 'Pepijn Poolman',
  'pierre-leducq': 'Pierre Leducq',
  sbed: 'Sbed',
  seregacthtuf: 'SeregaCHTUF',
  'various-artists': 'Various Artists',
  'viscious-speed': 'Viscious Speed',
};

/** Display name for an author folder; falls back to title-casing the folder name. */
export function authorDisplayName(folder: string): string {
  const known = AUTHOR_DISPLAY_NAMES[folder];
  if (known !== undefined) return known;
  return folder
    .split('-')
    .map((part) => (part.length === 0 ? part : part[0]?.toUpperCase() + part.slice(1)))
    .join(' ');
}
