/**
 * French (fr) localization dictionary and pattern translator for Earth Talk Web.
 */

export const WEB_FR_DICTIONARY: Record<string, string> = {
  // Navigation & Shell
  Explore: 'Explorer',
  'Your Earth Talk': 'Votre Earth Talk',
  Community: 'Communauté',
  'Research & governance': 'Recherche et gouvernance',
  'Learn & support': 'Apprendre et assistance',
  'Explore map': 'Explorer la carte',
  Observations: 'Observations',
  'Geoscience sites': 'Sites géoscientifiques',
  'My Earth Talk': 'Mon Earth Talk',
  History: 'Historique',
  'Expert reviews': 'Revues d’experts',
  'How it works': 'Comment ça marche',
  'About Earth Talk': 'À propos d’Earth Talk',
  'About & Guide': 'À propos et guide',
  'Legal & Transparency': 'Mentions légales et transparence',
  'Get app': 'Télécharger l’application',
  'Upload photo & media': 'Téléverser photo et médias',
  'Upload Photo & Supporting Media on Web': 'Téléverser une photo et des médias sur le Web',
  'Start on WhatsApp': 'Démarrer sur WhatsApp',
  'My Earth Talk on WhatsApp': 'Mon Earth Talk sur WhatsApp',
  Language: 'Langue',
  'Community sections': 'Sections de la communauté',
  Sites: 'Sites',
  Investigations: 'Enquêtes',
  Questions: 'Questions',
  'My questions': 'Mes questions',
  'My contributions': 'Mes contributions',
  'Sign in': 'Se connecter',
  'Submit Field Observation': 'Soumettre une observation de terrain',
  'Earth Talk Contributor': 'Contributeur Earth Talk',
  'Contributor · Earth Talk': 'Contributeur · Earth Talk',
  'Continue as Earth Talk Contributor': 'Continuer comme Contributeur Earth Talk',
  'Sign in with my account': 'Me connecter à mon compte',
  'Contributing as Guest (Anonymous)': 'Contribution en tant qu’invité (anonyme)',
  'Sign in to associate this observation with your account and earn reputation.': 'Connectez-vous pour associer cette observation à votre compte et gagner de la réputation.',
  'Associated with your account. View your contributions in My Earth Talk.': 'Associé à votre compte. Voir vos contributions dans Mon Earth Talk.',
  'Contributing as': 'Contribution en tant que',
  'Sign in to save to your account': 'Se connecter pour enregistrer sur votre compte',
  'Guest Contributor (Anonymous)': 'Contributeur invité (anonyme)',
  'Contributor:': 'Contributeur :',
  'Super Admin': 'Super Administrateur',
  'Contributor': 'Contributeur',
  'Earth Talk member': 'Membre Earth Talk',
  'Log out': 'Se déconnecter',
  'Show the full sidebar': 'Afficher la barre latérale complète',
  'Close sidebar': 'Fermer la barre latérale',
  'Collapse sidebar': 'Réduire la barre latérale',
  'Primary navigation': 'Navigation principale',
  'Open navigation sidebar': 'Ouvrir la barre latérale de navigation',

  // Map & Search & Filters
  'Search rocks, passports, districts': 'Rechercher roches, passeports, districts',
  'Search sites, districts or posts': 'Rechercher sites, districts ou publications',
  'Search by Passport ID, rock name, or district...': 'Rechercher par ID de passeport, nom de roche ou district...',
  'Search your history': 'Rechercher dans l’historique',
  'Recent searches': 'Recherches récentes',
  'Clear all': 'Tout effacer',
  'Popular districts': 'Districts populaires',
  'Districts & Locations': 'Districts et localités',
  'Geological Sites': 'Sites géologiques',
  'Matching Recent Searches': 'Recherches récentes correspondantes',
  'No results found': 'Aucun résultat trouvé',
  Filters: 'Filtres',
  Reset: 'Réinitialiser',
  District: 'District',
  'All Districts in Rwanda': 'Tous les districts du Rwanda',
  'What was observed': 'Ce qui a été observé',
  'All Categories': 'Toutes les catégories',
  'Rock type': 'Type de roche',
  'All Rock Types': 'Tous les types de roches',
  'Evidence state': 'État de preuve',
  'Any Evidence State': 'Tout état de preuve',
  'AI confidence': 'Confiance IA',
  'All Confidence Levels': 'Tous les niveaux de confiance',
  'Verification state': 'État de vérification',
  'All Records': 'Tous les enregistrements',
  'Scientific note:': 'Note scientifique :',

  // Map controls & panels
  'Map': 'Carte',
  'Satellite': 'Satellite',
  'Streets': 'Rues',
  'Terrain': 'Relief',
  'Map type': 'Type de carte',
  'Map style': 'Style de carte',
  'Map Legend': 'Légende de la carte',
  'Site evidence': 'Preuve du site',
  'Cluster (zoom to expand)': 'Groupe (zoomer pour développer)',
  'Nothing established': 'Rien d’établi',
  'A stronger colour means more evidence, not a better answer. Community agreement is not scientific confirmation.': 'Une couleur plus intense indique plus de preuves, pas une meilleure réponse. L’accord communautaire ne constitue pas une confirmation scientifique.',
  'Posts without a published location': 'Publications sans position publiée',
  'Published field posts that have no public map coordinate.': 'Publications de terrain sans coordonnée cartographique publique.',
  'No published post is missing a location.': 'Aucune publication publiée ne manque de localisation.',
  'Loading published posts…': 'Chargement des publications…',

  // View Info Panel notes
  'Grouping and evidence': 'Regroupement et preuves',
  'Every site states its grouping basis: admin curated, observation cluster, or community suggested.': 'Chaque site indique sa base de regroupement : sélection administrative, groupe d’observations ou suggestion communautaire.',
  'Observations are never silently clustered by a distance threshold.': 'Les observations ne sont jamais regroupées silencieusement par un seuil de distance.',
  'The evidence ladder is enforced server-side: community activity alone can never reach expert reviewed or scientifically confirmed.': 'L’échelle des preuves est appliquée côté serveur : l’activité communautaire seule ne peut jamais atteindre le statut d’examiné par un expert ou confirmé scientifiquement.',
  'Research analytics': 'Analyse de recherche',
  'Dataset summaries, dataset versions, CSV and GeoJSON exports.': 'Résumés de jeux de données, versions et exportations CSV et GeoJSON.',
  'Every export and every authoritative verification writes a compliance audit record.': 'Chaque exportation et chaque vérification officielle consigne un enregistrement d’audit de conformité.',
  'Operational metrics that are not instrumented are reported as unavailable, never as plausible constants.': 'Les métriques opérationnelles non instrumentées sont signalées comme indisponibles, jamais comme des constantes plausibles.',
  'Field validation': 'Validation de terrain',
  'Labelled datasets, sample management, dataset locking and reference labels.': 'Jeux de données étiquetés, gestion des échantillons, verrouillage et étiquettes de référence.',
  'Runs are scored against expert reference labels only.': 'Les exécutions sont évaluées uniquement par rapport aux étiquettes de référence d’experts.',
  'Predictions call the real Gemini model. When image bytes cannot be retrieved the run fails honestly rather than returning a simulated result.': 'Les prédictions appellent le véritable modèle Gemini. Si les octets d’image ne peuvent être récupérés, l’exécution échoue honnêtement au lieu de renvoyer un résultat simulé.',
  'Expert verification': 'Vérification par expert',
  'Super Admin only. There is no expert account system and no passwordless path.': 'Super Administrateur uniquement. Il n’y a pas de système de compte d’expert ni de parcours sans mot de passe.',
  'Every review names its reviewer as an attribute of the review itself.': 'Chaque avis nomme son réviseur en tant qu’attribut de l’avis lui-même.',
  'Community agreement never counts as expert verification.': 'L’accord communautaire ne vaut jamais vérification d’expert.',
  'The pipeline': 'Le pipeline',
  'A WhatsApp photo is downloaded over an authenticated connection and validated before analysis.': 'Une photo WhatsApp est téléchargée via une connexion authentifiée et validée avant analyse.',
  'Gemini returns a structured interpretation against a strict runtime schema.': 'Gemini renvoie une interprétation structurée conforme à un schéma strict d’exécution.',
  'The record is persisted and a Geoscience Passport is returned to the sender.': 'L’enregistrement est persisté et un passeport géoscientifique est renvoyé à l’expéditeur.',
  'Data honesty': 'Intégrité des données',
  'No fabricated observations, users, experts, votes, visits, locations or metrics.': 'Aucune observation, utilisateur, expert, vote, visite, emplacement ou métrique fabriqués.',
  'Production repositories hold no seed data; they return empty results or an explicit unavailable.': 'Les dépôts de production ne contiennent pas de données initiales ; ils renvoient des résultats vides ou une indisponibilité explicite.',
  'An unconfigured database yields an honest empty read, never a fake success.': 'Une base de données non configurée produit une lecture vide honnête, jamais un faux succès.',
  'Super Admin session required': 'Session Super Administrateur requise',
  'This view calls an authenticated route. Sign in to open it; nothing is faked without a session.': 'Cette vue appelle une route authentifiée. Connectez-vous pour l’ouvrir ; rien n’est simulé sans session.',

  // Dialogs & Modals & Actions
  'Cancel': 'Annuler',
  'Close': 'Fermer',
  'Save': 'Enregistrer',
  'Submit': 'Soumettre',
  'Retry': 'Réessayer',
  'Back': 'Retour',
  'Loading': 'Chargement…',
  'Offline Mode': 'Mode hors ligne',
  'Save current area': 'Enregistrer la zone actuelle',
  'Clear cached tiles and observations': 'Effacer les tuiles et observations en cache',
  'Install Earth Talk App': 'Installer l’application Earth Talk',
  'Install on iOS Home Screen': 'Installer sur l’écran d’accueil iOS',
  'Install on iPhone / iPad': 'Installer sur iPhone / iPad',
  'Got it': 'Compris',
  'Sign in to continue': 'Se connecter pour continuer',
  'Expert verification portal': 'Portail de vérification par les experts',
  'This portal is restricted to the Super Admin. There is no expert account system and no passwordless path: a review can only be attributed to a named, authenticated reviewer.': 'Ce portail est réservé au Super Administrateur. Il n’y a pas de système de compte d’expert ni de parcours sans mot de passe : un avis ne peut être attribué qu’à un réviseur nommé et authentifié.',
  'Moderation': 'Modération',
  'The abuse-report queue is restricted to the Super Admin, because every decision is attributed to the reviewer who made it.': 'La file d’attente des signalements d’abus est réservée au Super Administrateur, car chaque décision est attribuée au réviseur qui l’a prise.',
  'Field validation and model evaluation': 'Validation de terrain et évaluation du modèle',
  'Every validation route requires an authenticated Super Admin session. Nothing on this screen is simulated, so there is nothing to show without a session.': 'Chaque route de validation nécessite une session Super Administrateur authentifiée. Rien sur cet écran n’est simulé, il n’y a donc rien à afficher sans session.',
};

export const WEB_FR_ENUM_DICTIONARY: Record<string, string> = {
  rock: 'roche',
  rocks: 'roches',
  mineral: 'minéral',
  minerals: 'minéraux',
  soil: 'sol',
  sediment: 'sédiment',
  water: 'eau',
  outcrop: 'affleurement',
  landform: 'relief',
  hazard: 'aléa',
  fossil: 'fossile',
  other: 'autre',
  unknown: 'inconnu',
  insufficient_evidence: 'preuves insuffisantes',
  ai_assisted: 'assisté par IA',
  community_supported: 'soutenu par la communauté',
  community_investigated: 'enquêté par la communauté',
  expert_reviewed: 'examiné par un expert',
  expert_verified: 'vérifié par un expert',
  scientifically_confirmed: 'confirmé scientifiquement',
  unresolved: 'non résolu',
  rejected: 'rejeté',
  unverified: 'non vérifié',
  verified: 'vérifié',
  pending: 'en attente',
  approved: 'approuvé',
  published: 'publié',
  draft: 'brouillon',
  exact: 'exacte',
  approximate: 'approximative',
  district: 'district',
  private: 'privée',
  open: 'ouverte',
  active: 'active',
  high: 'élevée',
  moderate: 'modérée',
  medium: 'moyenne',
  low: 'faible',
  igneous: 'ignée',
  sedimentary: 'sédimentaire',
  metamorphic: 'métamorphique',
  unclassified: 'non classée',
};

type PatternReplacer = [RegExp, (...matches: string[]) => string];

const WEB_FR_PATTERNS: PatternReplacer[] = [
  [/^(\d+)\s+records?$/i, (n) => `${n} ${Number(n) === 1 ? 'enregistrement' : 'enregistrements'}`],
  [/^(\d+)\s+listed$/i, (n) => `${n} ${Number(n) === 1 ? 'affiché' : 'affichés'}`],
  [/^(\d+)\s+observations?$/i, (n) => `${n} ${Number(n) === 1 ? 'observation' : 'observations'}`],
  [/^(\d+)\s+posts?$/i, (n) => `${n} ${Number(n) === 1 ? 'publication' : 'publications'}`],
  [/^(\d+)\s+sites?$/i, (n) => `${n} ${Number(n) === 1 ? 'site' : 'sites'}`],
  [/^(\d+)\s+districts?$/i, (n) => `${n} ${Number(n) === 1 ? 'district' : 'districts'}`],
  [/^Confidence:\s*(.+)$/i, (c) => `Confiance : ${WEB_FR_ENUM_DICTIONARY[c.toLowerCase()] ?? c}`],
  [/^(.+)\s+District$/i, (d) => `District de ${d}`],
];

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`
  );
}

export function lookupWebFrench(
  raw: string,
  vars?: Record<string, string | number>
): string {
  if (!raw) return raw;

  const exact = WEB_FR_DICTIONARY[raw];
  if (exact !== undefined) return interpolate(exact, vars);

  const trimmed = raw.trim();
  if (!trimmed) return raw;

  const leading = raw.slice(0, raw.indexOf(trimmed));
  const trailing = raw.slice(raw.indexOf(trimmed) + trimmed.length);

  if (WEB_FR_DICTIONARY[trimmed] !== undefined) {
    return `${leading}${interpolate(WEB_FR_DICTIONARY[trimmed], vars)}${trailing}`;
  }

  const lower = trimmed.toLowerCase();
  if (WEB_FR_ENUM_DICTIONARY[lower] !== undefined) {
    const mapped = WEB_FR_ENUM_DICTIONARY[lower];
    const capitalized =
      trimmed[0] && trimmed[0] === trimmed[0].toUpperCase() && trimmed[0] !== trimmed[0].toLowerCase()
        ? mapped.charAt(0).toUpperCase() + mapped.slice(1)
        : mapped;
    return `${leading}${interpolate(capitalized, vars)}${trailing}`;
  }

  for (const [pattern, replacer] of WEB_FR_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return `${leading}${interpolate(replacer(...match.slice(1)), vars)}${trailing}`;
    }
  }

  return interpolate(raw, vars);
}
