/**
 * Verb dataset — present indicative tables.
 *
 * Every form is written out explicitly (never generated at runtime) and the
 * dataset validator checks completeness plus the regular-ending patterns for
 * -er / -ir / -re verbs. Irregular and stem-changing verbs are marked as such.
 */
import type { PronounKey, RawVerb, VerbGroup } from '@french-daily/learning-core';

function v(
  infinitive: string,
  english: string,
  group: VerbGroup,
  je: string,
  tu: string,
  il: string,
  nous: string,
  vous: string,
  ils: string,
  fillComplement: string,
  exampleFr: string,
  exampleEn: string,
  level: 'A1' | 'A2' | 'B1' = 'A1',
): RawVerb {
  const forms: Record<PronounKey, string> = { je, tu, il, nous, vous, ils };
  return { infinitive, english, group, forms, fillComplement, exampleFr, exampleEn, level };
}

export const rawVerbs: RawVerb[] = [
  // ---- regular -er ----
  v('parler', 'to speak', 'er', 'parle', 'parles', 'parle', 'parlons', 'parlez', 'parlent', 'français', 'Je parle français avec mes amis.', 'I speak French with my friends.'),
  v('aimer', 'to like, to love', 'er', 'aime', 'aimes', 'aime', 'aimons', 'aimez', 'aiment', 'la musique', 'J’aime la musique classique.', 'I like classical music.'),
  v('regarder', 'to watch, to look at', 'er', 'regarde', 'regardes', 'regarde', 'regardons', 'regardez', 'regardent', 'la télévision', 'Nous regardons un film ce soir.', 'We are watching a movie tonight.'),
  v('trouver', 'to find', 'er', 'trouve', 'trouves', 'trouve', 'trouvons', 'trouvez', 'trouvent', 'la solution', 'Je trouve la solution.', 'I find the solution.'),
  v('donner', 'to give', 'er', 'donne', 'donnes', 'donne', 'donnons', 'donnez', 'donnent', 'un livre', 'Elle donne un livre à son frère.', 'She gives a book to her brother.'),
  v('penser', 'to think', 'er', 'pense', 'penses', 'pense', 'pensons', 'pensez', 'pensent', 'à toi', 'Je pense à toi.', 'I am thinking of you.'),
  v('passer', 'to spend, to pass', 'er', 'passe', 'passes', 'passe', 'passons', 'passez', 'passent', 'les vacances', 'Nous passons les vacances en France.', 'We spend the holidays in France.'),
  v('arriver', 'to arrive', 'er', 'arrive', 'arrives', 'arrive', 'arrivons', 'arrivez', 'arrivent', 'à huit heures', 'J’arrive à huit heures.', 'I arrive at eight o’clock.'),
  v('rester', 'to stay', 'er', 'reste', 'restes', 'reste', 'restons', 'restez', 'restent', 'à la maison', 'Je reste à la maison aujourd’hui.', 'I am staying home today.'),
  v('monter', 'to go up', 'er', 'monte', 'montes', 'monte', 'montons', 'montez', 'montent', 'les escaliers', 'Nous montons les escaliers.', 'We go up the stairs.'),
  v('jouer', 'to play', 'er', 'joue', 'joues', 'joue', 'jouons', 'jouez', 'jouent', 'au football', 'Il joue au football le samedi.', 'He plays football on Saturday.'),
  v('travailler', 'to work', 'er', 'travaille', 'travailles', 'travaille', 'travaillons', 'travaillez', 'travaillent', 'le matin', 'Je travaille le matin.', 'I work in the morning.'),
  v('chercher', 'to look for', 'er', 'cherche', 'cherches', 'cherche', 'cherchons', 'cherchez', 'cherchent', 'mes clés', 'Je cherche mes clés.', 'I am looking for my keys.'),
  v('habiter', 'to live (somewhere)', 'er', 'habite', 'habites', 'habite', 'habitons', 'habitez', 'habitent', 'à Paris', 'J’habite à Paris.', 'I live in Paris.'),
  v('écouter', 'to listen to', 'er', 'écoute', 'écoutes', 'écoute', 'écoutons', 'écoutez', 'écoutent', 'la radio', 'J’écoute la radio.', 'I listen to the radio.'),
  v('demander', 'to ask', 'er', 'demande', 'demandes', 'demande', 'demandons', 'demandez', 'demandent', 'la réponse', 'Je demande la réponse.', 'I am asking for the answer.'),
  v('porter', 'to wear, to carry', 'er', 'porte', 'portes', 'porte', 'portons', 'portez', 'portent', 'un manteau', 'Elle porte un manteau rouge.', 'She wears a red coat.'),
  v('tomber', 'to fall', 'er', 'tombe', 'tombes', 'tombe', 'tombons', 'tombez', 'tombent', 'souvent', 'L’enfant tombe souvent.', 'The child often falls.'),
  v('laisser', 'to leave, to let', 'er', 'laisse', 'laisses', 'laisse', 'laissons', 'laissez', 'laissent', 'un message', 'Je laisse un message.', 'I leave a message.'),
  v('marcher', 'to walk', 'er', 'marche', 'marches', 'marche', 'marchons', 'marchez', 'marchent', 'au parc', 'Nous marchons au parc.', 'We walk in the park.'),
  v('fermer', 'to close', 'er', 'ferme', 'fermes', 'ferme', 'fermons', 'fermez', 'ferment', 'la porte', 'Ferme la porte, s’il te plaît.', 'Close the door, please.'),
  v('aider', 'to help', 'er', 'aide', 'aides', 'aide', 'aidons', 'aidez', 'aident', 'mes voisins', 'J’aide mes voisins.', 'I help my neighbors.'),
  v('préférer', 'to prefer', 'er', 'préfère', 'préfères', 'préfère', 'préférons', 'préférez', 'préfèrent', 'le thé', 'Je préfère le thé.', 'I prefer tea.', 'A2'),
  v('acheter', 'to buy', 'er', 'achète', 'achètes', 'achète', 'achetons', 'achetez', 'achètent', 'du pain', 'J’achète du pain.', 'I buy bread.', 'A2'),
  v('appeler', 'to call', 'er', 'appelle', 'appelles', 'appelle', 'appelons', 'appelez', 'appellent', 'ma mère', 'J’appelle ma mère.', 'I call my mother.', 'A2'),
  v('manger', 'to eat', 'er', 'mange', 'manges', 'mange', 'mangeons', 'mangez', 'mangent', 'une pomme', 'Je mange une pomme.', 'I eat an apple.'),
  v('commencer', 'to start, to begin', 'er', 'commence', 'commences', 'commence', 'commençons', 'commencez', 'commencent', 'le travail', 'Nous commençons le travail.', 'We start work.', 'A2'),
  v('essayer', 'to try', 'er', 'essaie', 'essaies', 'essaie', 'essayons', 'essayez', 'essaient', 'le gâteau', 'J’essaie le gâteau.', 'I try the cake.', 'A2'),
  v('payer', 'to pay', 'er', 'paie', 'paies', 'paie', 'payons', 'payez', 'paient', 'la note', 'Je paie la note.', 'I pay the bill.', 'A2'),
  v('expliquer', 'to explain', 'er', 'explique', 'expliques', 'explique', 'expliquons', 'expliquez', 'expliquent', 'la leçon', 'Le professeur explique la leçon.', 'The teacher explains the lesson.', 'A2'),

  // ---- reflexive verbs ----
  v('se lever', 'to get up', 'er', 'lève', 'lèves', 'lève', 'levons', 'levez', 'lèvent', 'à sept heures', 'Je me lève à sept heures.', 'I get up at seven o’clock.'),
  v('se laver', 'to wash (oneself)', 'er', 'lave', 'laves', 'lave', 'lavons', 'lavez', 'lavent', 'les mains', 'Je me lave les mains.', 'I wash my hands.'),
  v('se réveiller', 'to wake up', 'er', 'réveille', 'réveilles', 'réveille', 'réveillons', 'réveillez', 'réveillent', 'tôt', 'Elle se réveille tôt.', 'She wakes up early.'),
  v('s’habiller', 'to get dressed', 'er', 'habille', 'habilles', 'habille', 'habillons', 'habillez', 'habillent', 'vite', 'Il s’habille vite.', 'He gets dressed quickly.'),
  v('se promener', 'to take a walk', 'er', 'promène', 'promènes', 'promène', 'promenons', 'promenez', 'promènent', 'au bord de la rivière', 'Nous nous promenons au bord de la rivière.', 'We take a walk by the river.', 'A2'),
  v('se coucher', 'to go to bed', 'er', 'couche', 'couches', 'couche', 'couchons', 'couchez', 'couchent', 'à vingt-deux heures', 'Je me couche à vingt-deux heures.', 'I go to bed at ten o’clock.'),
  v('s’appeler', 'to be called', 'er', 'appelle', 'appelles', 'appelle', 'appelons', 'appelez', 'appellent', 'Marie', 'Je m’appelle Marie.', 'My name is Marie.'),
  v('se reposer', 'to rest', 'er', 'repose', 'reposes', 'repose', 'reposons', 'reposez', 'reposent', 'le dimanche', 'Je me repose le dimanche.', 'I rest on Sunday.'),
  v('se dépêcher', 'to hurry', 'er', 'dépêche', 'dépêches', 'dépêche', 'dépêchons', 'dépêchez', 'dépêchent', 'toujours', 'Elle se dépêche toujours.', 'She always hurries.', 'A2'),
  v('s’amuser', 'to have fun', 'er', 'amuse', 'amuses', 'amuse', 'amusons', 'amusez', 'amusent', 'beaucoup', 'Nous nous amusons beaucoup.', 'We have a lot of fun.', 'A2'),

  // ---- regular -ir ----
  v('finir', 'to finish', 'ir', 'finis', 'finis', 'finit', 'finissons', 'finissez', 'finissent', 'le travail', 'Je finis le travail.', 'I finish work.'),
  v('choisir', 'to choose', 'ir', 'choisis', 'choisis', 'choisit', 'choisissons', 'choisissez', 'choisissent', 'un livre', 'Je choisis un livre.', 'I choose a book.'),
  v('réfléchir', 'to think over', 'ir', 'réfléchis', 'réfléchis', 'réfléchit', 'réfléchissons', 'réfléchissez', 'réfléchissent', 'sérieusement', 'Je réfléchis sérieusement.', 'I think seriously.', 'A2'),
  v('réussir', 'to succeed', 'ir', 'réussis', 'réussis', 'réussit', 'réussissons', 'réussissez', 'réussissent', 'à l’examen', 'Elle réussit à l’examen.', 'She passes the exam.', 'A2'),
  v('grandir', 'to grow up', 'ir', 'grandis', 'grandis', 'grandit', 'grandissons', 'grandissez', 'grandissent', 'vite', 'Les enfants grandissent vite.', 'Children grow up fast.', 'A2'),
  v('obéir', 'to obey', 'ir', 'obéis', 'obéis', 'obéit', 'obéissons', 'obéissez', 'obéissent', 'aux règles', 'Nous obéissons aux règles.', 'We obey the rules.', 'A2'),
  v('remplir', 'to fill', 'ir', 'remplis', 'remplis', 'remplit', 'remplissons', 'remplissez', 'remplissent', 'le formulaire', 'Je remplis le formulaire.', 'I fill in the form.', 'A2'),
  v('bâtir', 'to build', 'ir', 'bâtis', 'bâtis', 'bâtit', 'bâtissons', 'bâtissez', 'bâtissent', 'une maison', 'Ils bâtissent une maison.', 'They are building a house.', 'A2'),
  v('réaliser', 'to achieve, to make', 'er', 'réalise', 'réalises', 'réalise', 'réalisons', 'réalisez', 'réalisent', 'un rêve', 'Elle réalise un rêve.', 'She achieves a dream.', 'B1'),

  // ---- regular -re ----
  v('vendre', 'to sell', 're', 'vends', 'vends', 'vend', 'vendons', 'vendez', 'vendent', 'sa voiture', 'Il vend sa voiture.', 'He sells his car.'),
  v('attendre', 'to wait', 're', 'attends', 'attends', 'attend', 'attendons', 'attendez', 'attendent', 'le bus', 'J’attends le bus.', 'I am waiting for the bus.'),
  v('entendre', 'to hear', 're', 'entends', 'entends', 'entend', 'entendons', 'entendez', 'entendent', 'la musique', 'J’entends la musique.', 'I hear the music.'),
  v('perdre', 'to lose', 're', 'perds', 'perds', 'perd', 'perdons', 'perdez', 'perdent', 'souvent', 'Je perds souvent mes clés.', 'I often lose my keys.'),
  v('répondre', 'to answer', 're', 'réponds', 'réponds', 'répond', 'répondons', 'répondez', 'répondent', 'à la question', 'Je réponds à la question.', 'I answer the question.', 'A2'),
  v('descendre', 'to go down', 're', 'descends', 'descends', 'descend', 'descendons', 'descendez', 'descendent', 'les escaliers', 'Nous descendons les escaliers.', 'We go down the stairs.', 'A2'),
  v('rendre', 'to give back', 're', 'rends', 'rends', 'rend', 'rendons', 'rendez', 'rendent', 'le livre', 'Je rends le livre.', 'I return the book.', 'A2'),
  v('défendre', 'to defend', 're', 'défends', 'défends', 'défend', 'défendons', 'défendez', 'défendent', 'ses idées', 'Il défend ses idées.', 'He defends his ideas.', 'B1'),

  // ---- irregular ----
  v('être', 'to be', 'irregular', 'suis', 'es', 'est', 'sommes', 'êtes', 'sont', 'à la maison', 'Je suis à la maison.', 'I am at home.'),
  v('avoir', 'to have', 'irregular', 'ai', 'as', 'a', 'avons', 'avez', 'ont', 'un frère', 'J’ai un frère.', 'I have a brother.'),
  v('aller', 'to go', 'irregular', 'vais', 'vas', 'va', 'allons', 'allez', 'vont', 'au cinéma', 'Nous allons au cinéma.', 'We are going to the cinema.'),
  v('faire', 'to do, to make', 'irregular', 'fais', 'fait', 'fait', 'faisons', 'faites', 'font', 'du sport', 'Je fais du sport.', 'I do sports.'),
  v('venir', 'to come', 'irregular', 'viens', 'viens', 'vient', 'venons', 'venez', 'viennent', 'de France', 'Je viens de France.', 'I come from France.'),
  v('prendre', 'to take', 'irregular', 'prends', 'prends', 'prend', 'prenons', 'prenez', 'prennent', 'le bus', 'Je prends le bus.', 'I take the bus.'),
  v('comprendre', 'to understand', 'irregular', 'comprends', 'comprends', 'comprend', 'comprenons', 'comprenez', 'comprennent', 'la question', 'Je comprends la question.', 'I understand the question.', 'A2'),
  v('apprendre', 'to learn', 'irregular', 'apprends', 'apprends', 'apprend', 'apprenons', 'apprenez', 'apprennent', 'le français', 'J’apprends le français.', 'I am learning French.', 'A2'),
  v('pouvoir', 'to be able to', 'irregular', 'peux', 'peux', 'peut', 'pouvons', 'pouvez', 'peuvent', 'venir demain', 'Je peux venir demain.', 'I can come tomorrow.'),
  v('vouloir', 'to want', 'irregular', 'veux', 'veux', 'veut', 'voulons', 'voulez', 'veulent', 'un café', 'Je veux un café.', 'I want a coffee.'),
  v('devoir', 'to have to, must', 'irregular', 'dois', 'dois', 'doit', 'devons', 'devez', 'doivent', 'partir', 'Je dois partir.', 'I have to leave.'),
  v('savoir', 'to know (a fact)', 'irregular', 'sais', 'sais', 'sait', 'savons', 'savez', 'savent', 'la réponse', 'Je sais la réponse.', 'I know the answer.'),
  v('voir', 'to see', 'irregular', 'vois', 'vois', 'voit', 'voyons', 'voyez', 'voient', 'un film', 'Nous voyons un film.', 'We see a movie.'),
  v('dire', 'to say', 'irregular', 'dis', 'dis', 'dit', 'disons', 'dites', 'disent', 'la vérité', 'Je dis la vérité.', 'I tell the truth.'),
  v('mettre', 'to put', 'irregular', 'mets', 'mets', 'met', 'mettons', 'mettez', 'mettent', 'la table', 'Je mets la table.', 'I set the table.'),
  v('partir', 'to leave', 'irregular', 'pars', 'pars', 'part', 'partons', 'partez', 'partent', 'en vacances', 'Nous partons en vacances.', 'We leave on vacation.'),
  v('sortir', 'to go out', 'irregular', 'sors', 'sors', 'sort', 'sortons', 'sortez', 'sortent', 'ce soir', 'Je sors ce soir.', 'I am going out tonight.'),
  v('dormir', 'to sleep', 'irregular', 'dors', 'dors', 'dort', 'dormons', 'dormez', 'dorment', 'bien', 'Je dors bien.', 'I sleep well.'),
  v('tenir', 'to hold', 'irregular', 'tiens', 'tiens', 'tient', 'tenons', 'tenez', 'tiennent', 'la porte', 'Il tient la porte.', 'He holds the door.', 'A2'),
  v('lire', 'to read', 'irregular', 'lis', 'lis', 'lit', 'lisons', 'lisez', 'lisent', 'un livre', 'Je lis un livre.', 'I read a book.'),
  v('écrire', 'to write', 'irregular', 'écris', 'écris', 'écrit', 'écrivons', 'écrivez', 'écrivent', 'une lettre', 'J’écris une lettre.', 'I write a letter.', 'A2'),
  v('boire', 'to drink', 'irregular', 'bois', 'bois', 'boit', 'buvons', 'buvez', 'boivent', 'de l’eau', 'Je bois de l’eau.', 'I drink water.'),
  v('croire', 'to believe', 'irregular', 'crois', 'crois', 'croit', 'croyons', 'croyez', 'croient', 'son histoire', 'Je crois son histoire.', 'I believe his story.', 'A2'),
  v('connaître', 'to know (be familiar with)', 'irregular', 'connais', 'connais', 'connaît', 'connaissons', 'connaissez', 'connaissent', 'cette ville', 'Je connais cette ville.', 'I know this city.', 'A2'),
  v('vivre', 'to live', 'irregular', 'vis', 'vis', 'vit', 'vivons', 'vivez', 'vivent', 'en France', 'Je vis en France.', 'I live in France.', 'A2'),
  v('suivre', 'to follow', 'irregular', 'suis', 'suis', 'suit', 'suivons', 'suivez', 'suivent', 'le chemin', 'Nous suivons le chemin.', 'We follow the path.', 'B1'),
  v('ouvrir', 'to open', 'irregular', 'ouvre', 'ouvres', 'ouvre', 'ouvrons', 'ouvrez', 'ouvrent', 'la fenêtre', 'J’ouvre la fenêtre.', 'I open the window.', 'A2'),
  v('offrir', 'to offer, to give (a gift)', 'irregular', 'offre', 'offres', 'offre', 'offrons', 'offrez', 'offrent', 'un cadeau', 'J’offre un cadeau.', 'I give a gift.', 'A2'),
  v('courir', 'to run', 'irregular', 'cours', 'cours', 'court', 'courons', 'courez', 'courent', 'tous les matins', 'Il court tous les matins.', 'He runs every morning.', 'A2'),
  v('recevoir', 'to receive', 'irregular', 'reçois', 'reçois', 'reçoit', 'recevons', 'recevez', 'reçoivent', 'un colis', 'Je reçois un colis.', 'I receive a package.', 'B1'),
  v('valoir', 'to be worth', 'irregular', 'vaux', 'vaux', 'vaut', 'valons', 'valez', 'valent', 'mille euros', 'Cette maison vaut mille euros.', 'This house is worth a thousand euros.', 'B1'),
  v('plaire', 'to please', 'irregular', 'plais', 'plais', 'plaît', 'plaisons', 'plaisez', 'plaisent', 'beaucoup', 'Ce film me plaît beaucoup.', 'I like this film a lot.', 'B1'),
];
