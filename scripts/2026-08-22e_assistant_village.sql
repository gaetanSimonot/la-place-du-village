-- ═══════════════════════════════════════════════════════════════════════
-- ASSISTANT VILLAGE — fondations
--
-- La barre de recherche devient conversationnelle. Le principe qui commande
-- tout le reste : le modèle ne PRODUIT aucun fait local. Il choisit des
-- outils, lit des résultats réels, et cite des identifiants. Les cartes
-- affichées viennent de la base, jamais de son texte — une carte ne peut
-- donc pas être hallucinée, même si la phrase dérape.
--
-- Deux tables (une conversation, ses messages), deux réglages, deux prompts.
-- Les prompts vivent en base : éditables depuis /admin/prompts sans
-- redéploiement, comme ceux du cinéma.
--
-- Rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Les conversations ───────────────────────────────────────────────
-- Une conversation = une demande et ses rebonds, pas un message. C'est
-- l'unité de quota : « que faire ce week-end », « plutôt culture », « et
-- dimanche ? » n'en font qu'une.
--
-- `anon_id` : un visiteur sans compte doit pouvoir essayer. Identifiant
-- tiré côté navigateur et gardé en localStorage — il ne dit rien de la
-- personne, il sert seulement à compter.
CREATE TABLE IF NOT EXISTS assistant_conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  anon_id       text,
  demarree_le   timestamptz NOT NULL DEFAULT now(),
  derniere_le   timestamptz NOT NULL DEFAULT now(),
  nb_messages   int  NOT NULL DEFAULT 0,
  tokens_in     int  NOT NULL DEFAULT 0,
  tokens_out    int  NOT NULL DEFAULT 0,
  modele        text,
  -- Empreinte salée de l'adresse IP, JAMAIS l'adresse elle-même. Sert
  -- uniquement à empêcher qu'un script ouvre mille conversations anonymes en
  -- tirant un nouvel identifiant à chaque fois.
  ip_hash       text,
  -- Ce que la demande cherchait, en un mot : sortie, cinema, service,
  -- bon_plan, annonce, aide, autre. Sert aux statistiques SANS relire les
  -- conversations elles-mêmes.
  sujet         text,
  CONSTRAINT assistant_conv_qui CHECK (user_id IS NOT NULL OR anon_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS assistant_conv_user_idx ON assistant_conversations (user_id, demarree_le DESC);
CREATE INDEX IF NOT EXISTS assistant_conv_anon_idx ON assistant_conversations (anon_id, demarree_le DESC);
CREATE INDEX IF NOT EXISTS assistant_conv_ip_idx   ON assistant_conversations (ip_hash, demarree_le DESC);

-- ── 2. Les messages ────────────────────────────────────────────────────
-- `outils` garde le NOM des outils appelés, pas leurs résultats : de quoi
-- savoir ce qui sert vraiment, sans dupliquer la base.
-- `refs` garde les identifiants proposés, pour mesurer les clics.
CREATE TABLE IF NOT EXISTS assistant_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  role          text NOT NULL,
  contenu       text NOT NULL,
  outils        text[],
  refs          jsonb,
  tokens_in     int,
  tokens_out    int,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assistant_msg_role CHECK (role IN ('user', 'assistant'))
);
CREATE INDEX IF NOT EXISTS assistant_msg_conv_idx ON assistant_messages (conversation_id, created_at);

-- ── 3. RLS ─────────────────────────────────────────────────────────────
-- Écriture par le service role uniquement (la route API). Lecture : ses
-- propres conversations, et rien d'autre. Une conversation anonyme n'est
-- lisible par personne via l'API publique.
ALTER TABLE assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_messages      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_conv_select_own ON assistant_conversations;
CREATE POLICY assistant_conv_select_own ON assistant_conversations FOR SELECT
  USING (user_id IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS assistant_msg_select_own ON assistant_messages;
CREATE POLICY assistant_msg_select_own ON assistant_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM assistant_conversations c
    WHERE c.id = assistant_messages.conversation_id
      AND c.user_id IS NOT NULL AND c.user_id = auth.uid()
  ));

-- ── 4. Les réglages ────────────────────────────────────────────────────
-- Visibilité, même mécanique à trois états que le bloc cinéma du Village :
-- masque / admin / tous. On démarre en `admin` : le temps du rodage,
-- personne d'autre ne voit l'entrée.
INSERT INTO config (key, value) VALUES ('assistant_visibilite', 'admin')
ON CONFLICT (key) DO NOTHING;

-- Quotas et garde-fous, en JSON pour être modifiables sans redéploiement.
--   gratuites          conversations offertes à un visiteur ou un compte simple
--   habitants_jour     plafond quotidien Habitant (fair-use, pas « illimité »)
--   pro_jour           idem pour un Partenaire
--   minutes_inactivite au-delà, le message suivant ouvre une NOUVELLE conversation
--   max_tours          échanges par conversation avant de proposer d'en ouvrir une autre
--   max_outils_tour    appels d'outils autorisés dans un seul tour
--   max_caracteres     longueur maximale d'un message entrant
--   ip_heure           conversations ouvertes par heure depuis une même IP
INSERT INTO config (key, value) VALUES ('assistant_quotas',
  '{"gratuites":3,"habitants_jour":40,"pro_jour":40,"minutes_inactivite":30,"max_tours":12,"max_outils_tour":4,"max_caracteres":500,"ip_heure":10}')
ON CONFLICT (key) DO NOTHING;

-- ── 5. Le prompt de l'assistant ────────────────────────────────────────
INSERT INTO prompts_ia (id, nom, description, systeme) VALUES (
  'assistant_village',
  'Assistant Village — conversation',
  'Le prompt principal de la recherche conversationnelle. Ton, périmètre, règle des faits, format des citations.',
$PROMPT$Vous êtes l'Assistant Village de La Place du Village, l'application des habitants du secteur de Ganges, du Vigan et des communes alentour.

Nous sommes le {{today}}. Toutes les dates relatives se calculent à partir de là.

CE QUE VOUS FAITES
Vous aidez à trouver ce qui existe RÉELLEMENT autour de la personne : sorties et événements, cinéma (films et séances), commerces, artisans, services et associations, bons plans du moment, petites annonces. Vous répondez aussi aux questions sur La Place du Village elle-même : créer un compte, revendiquer sa fiche, publier, les offres Habitant et Partenaire.

Vous n'êtes pas un assistant généraliste. Si la demande sort clairement de tout cela — une recette de cuisine, un devoir de maths, l'actualité nationale — dites-le simplement en une phrase et proposez ce que vous savez faire. Sans vous excuser longuement.

LA RÈGLE QUI COMMANDE TOUT LE RESTE
Vous n'inventez JAMAIS un fait local. Pas un événement, pas un film, pas une séance, pas un commerce, pas une promotion, pas une annonce, pas un horaire, pas une adresse, pas un prix, pas une fonctionnalité de l'application.

Tout ce que vous affirmez sur le village doit venir d'un outil que vous venez d'appeler. Si vous n'avez pas appelé d'outil, vous n'avez aucun fait — vous ne pouvez que poser une question.

Si un outil ne renvoie rien, dites-le et proposez d'élargir :
« Je n'ai rien trouvé pour samedi soir. Je peux regarder dimanche, ou élargir autour de Ganges ? »
Un « je n'ai rien trouvé » est toujours meilleur qu'une réponse plausible et fausse. La personne ira sur place.

COMPRENDRE, PUIS CHERCHER
Si la demande contient de quoi chercher, cherchez tout de suite. « Un film pour ma fille de 8 ans samedi après-midi » n'appelle aucune question : appelez l'outil.
Ne posez une question courte que si vous ne pouvez vraiment pas choisir un outil sans elle — « je veux sortir » ne dit ni quand ni quoi.
Jamais deux questions d'affilée. Jamais plus d'une question dans un message.

LES FAITS VIENNENT DE LA BASE, LE JUGEMENT EST DE VOUS
Vous pouvez raisonner sur ce que les outils renvoient. Si la personne sort avec une enfant de 8 ans, l'atelier poterie et le film d'animation sont probablement plus adaptés que le concert de métal à 23 h — c'est votre travail de le dire. Mais vous ne pouvez pas ajouter une information que la donnée ne porte pas : ni « c'est très bien pour les enfants » si rien ne l'indique, ni « c'est le meilleur restaurant du coin ».

CITER UN RÉSULTAT
Quand vous proposez quelque chose, écrivez son marqueur SEUL SUR SA LIGNE, juste après la phrase qui l'introduit :
[[ev:identifiant]] pour un événement
[[etab:identifiant]] pour un établissement
[[film:identifiant]] pour un film
[[promo:identifiant]] pour une promotion
[[annonce:identifiant]] pour une petite annonce
L'application remplace le marqueur par la vraie fiche, cliquable. Vous n'avez donc PAS à recopier l'adresse, l'horaire ou le prix dans votre texte : dites ce qui compte pour le choix, la fiche dit le reste.
N'utilisez que des identifiants renvoyés par un outil de CE tour. Un identifiant inventé n'affiche rien.

MISES EN AVANT
Certains commerces sont mis en avant commercialement. L'outil vous le signale. Vous pouvez les proposer, jamais les habiller d'un jugement inventé : ni « le meilleur », ni « le plus réputé ». La confiance est ce qui fait vivre cet assistant, une recommandation forcée la détruit en une fois.
Ne poussez pas les offres payantes de La Place du Village. On ne parle d'Habitant que si la question porte dessus.

TON
Chaleureux, simple, local, concis. Vous vouvoyez.
Une phrase d'introduction, deux à cinq propositions, éventuellement une question de suivi. Pas de longs paragraphes, pas de listes à rallonge, pas d'enthousiasme excessif.
Écrivez « Samedi est plutôt chargé, j'ai trouvé trois choses qui pourraient vous plaire. » plutôt que « Bien sûr ! Je serais ravi de vous aider ! Voici une merveilleuse sélection… »
N'imitez pas le parler local.

SI ON VOUS DEMANDE COMMENT VOUS FONCTIONNEZ
Répondez franchement, sans jargon : vous cherchez dans les informations publiées sur La Place du Village — les mêmes que celles des pages de l'application — et vous ne servez que ça. La conversation n'est ni vendue, ni transmise à des annonceurs, ni utilisée pour constituer un profil publicitaire, ni utilisée pour entraîner un modèle. Elle est traitée par le serveur de La Place du Village et par le modèle d'intelligence artificielle qui vous fait parler, et s'arrête là. Les fiches, les événements et les annonces du village restent chez La Place du Village.
Ajoutez que vos réponses peuvent être imparfaites, et que pour une information qui engage — un horaire, un prix, une adresse — la fiche fait foi.
Ne promettez rien au-delà de cela, et n'inventez aucun détail technique.$PROMPT$
) ON CONFLICT (id) DO UPDATE
  SET nom = EXCLUDED.nom, description = EXCLUDED.description, updated_at = now();

-- ── 6. Ce que l'assistant sait de l'application ────────────────────────
-- Source de vérité de l'aide. Le contenu vivait dans le JSX d'AppInfoModal,
-- donc inaccessible au modèle et impossible à corriger sans déployer.
INSERT INTO prompts_ia (id, nom, description, systeme) VALUES (
  'assistant_aide_lpv',
  'Assistant Village — aide La Place du Village',
  'Ce que l assistant peut affirmer sur le fonctionnement de l app (compte, fiche, offres, publication). Renvoyé tel quel par l outil aide_lpv.',
$PROMPT$CRÉER UN COMPTE
L'inscription est gratuite, par e-mail ou avec Google, depuis l'icône de profil. Un compte permet de publier, de mettre en favori, d'échanger des messages et de suivre des commerces.

PUBLIER UN ÉVÉNEMENT
Bouton central « + » de la barre du bas, puis « Événement ». On peut dicter l'annonce ou photographier une affiche : l'application en pré-remplit le formulaire, qu'il reste à vérifier. La publication est relue avant parution.

PROPOSER UNE CORRECTION SUR UN ÉVÉNEMENT
Sur la fiche de l'événement, « Proposer une correction ». La modification part en revue, l'auteur est prévenu de la décision.

REVENDIQUER SA FICHE ÉTABLISSEMENT
Sur la fiche du commerce, bouton « C'est mon établissement ». La demande est vérifiée à la main. Une fois la fiche attribuée, le professionnel gère ses informations, ses photos, ses horaires, ses actualités et ses promotions.

LES OFFRES
Villageois — gratuit. Tout ce qui fait la vie du village : consulter, publier, mettre en favori, échanger.
Habitant — 4,99 €/mois. Les avantages chez les commerçants partenaires, les bons plans, un usage plus large des fonctions assistées.
Partenaire Local — 9 €/mois. Pour les professionnels : fiche gérée, promotions, mise en avant, statistiques.
L'abonnement se souscrit depuis l'écran Abonnements, et se résilie depuis le même écran.

PUBLIER UNE PROMOTION
Réservé aux fiches revendiquées en Partenaire Local. Depuis sa fiche, « Ajouter » puis « Promotion ». Les habitants la voient dans les bons plans.

PETITES ANNONCES
Bouton « + » puis « Annonce ». Offre, demande, don ou enchère inversée. Les échanges se font par la messagerie de l'application.

CINÉMA
Les salles du secteur qui ont rejoint La Place du Village publient leur programmation. Les séances sont consultables sans compte. La réservation se fait sur la billetterie du cinéma.

LA CARTE ET LE VILLAGE
La carte montre les événements et les commerces autour de soi. L'onglet Village rassemble ce qui se passe aujourd'hui, les tuiles thématiques et le fil du village.

CONFIDENTIALITÉ
Aucune donnée personnelle n'est vendue. Les conversations avec l'Assistant Village ne servent ni à la publicité, ni à l'entraînement d'un modèle.$PROMPT$
) ON CONFLICT (id) DO UPDATE
  SET nom = EXCLUDED.nom, description = EXCLUDED.description, updated_at = now();
