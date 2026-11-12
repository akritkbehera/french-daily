/**
 * Sentence bank — deterministic translation pairs with curated alternatives.
 *
 * Sentence exercises never rely on an LLM for grading: the expected answer and
 * every accepted alternative are written here. `note` explains the grammar.
 */
import type { SentencePair } from '@french-daily/learning-core';

function s(
  id: string,
  en: string,
  fr: string,
  alternatives: string[],
  topic: SentencePair['topic'],
  level: SentencePair['level'],
  note: string,
): SentencePair {
  return { id: `sent:${id}`, en, fr, alternatives, topic, level, note };
}

export const rawSentences: SentencePair[] = [
  s('breakfast-eight', 'I eat breakfast at eight.', 'Je prends mon petit-déjeuner à huit heures.',
    ['Je prends mon petit déjeuner à huit heures.', 'Je mange mon petit-déjeuner à huit heures.'],
    'food', 'A1', 'Meals use the verb prendre (to take): on prend un repas.'),

  s('coffee-please', 'A coffee, please.', 'Un café, s’il vous plaît.',
    ['Un café, s’il vous plait.', 'Un café, sil vous plaît.'],
    'food', 'A1', 's’il vous plaît = please (literally "if it pleases you").'),

  s('live-paris', 'I live in Paris.', 'J’habite à Paris.',
    [], 'city', 'A1', 'Use à with cities: j’habite à Paris, à Lyon, à Marseille.'),

  s('name-marie', 'My name is Marie.', 'Je m’appelle Marie.',
    ['Je me nomme Marie.'], 'family', 'A1', 'Reflexive verb s’appeler: je me + appelle.'),

  s('like-music', 'I like music.', 'J’aime la musique.',
    ["J'aime la musique."], 'leisure', 'A1', 'Aimer takes the definite article for general tastes.'),

  s('go-school', 'We go to school by bus.', 'Nous allons à l’école en bus.',
    ['Nous allons à l’école en autobus.', 'Nous prenons le bus pour aller à l’école.'], 'school', 'A1',
    'Transport uses en (en bus, en voiture) but à vélo / à pied.'),

  s('where-station', 'Where is the train station?', 'Où est la gare ?',
    ['Où est la gare?'], 'travel', 'A1', 'French questions can be formed with rising intonation: Où est… ?'),

  s('speak-french', 'Do you speak English?', 'Parlez-vous anglais ?',
    ['Parlez vous anglais ?', 'Est-ce que vous parlez anglais ?'], 'travel', 'A1',
    'Inversion forms questions: parlez-vous… ?'),

  s('big-house', 'The house is big.', 'La maison est grande.',
    [], 'home', 'A1', 'Adjectives agree with the noun: grand (m) → grande (f).'),

  s('small-cat', 'The cat is small.', 'Le chat est petit.',
    [], 'nature', 'A1', 'Petit agrees with the masculine noun chat.'),

  s('hungry', 'I am hungry.', 'J’ai faim.',
    ["J'ai faim."], 'food', 'A1', 'French uses avoir for hunger/thirst: avoir faim, avoir soif.'),

  s('thirsty', 'I am thirsty.', 'J’ai soif.',
    [], 'food', 'A1', 'Avoir soif = to be thirsty.'),

  s('see-tonight', 'I see my friends tonight.', 'Je vois mes amis ce soir.',
    [], 'leisure', 'A1', 'The present tense can express the near future with a time marker.'),

  s('work-nine', 'He starts work at nine.', 'Il commence le travail à neuf heures.',
    ['Il commence le travail à 9 heures.'], 'work', 'A2', 'Numbers take à: à neuf heures.'),

  s('want-tea', 'I would like a tea.', 'Je voudrais un thé.',
    [], 'food', 'A2', 'Je voudrais = I would like (conditional of vouloir).'),

  s('need-help', 'I need help.', "J'ai besoin d'aide.",
    ["J’ai besoin d’aide.", "J'ai besoin d'aide s'il vous plaît."], 'city', 'A2',
    'Avoir besoin de = to need (de contracts to d’ before a vowel).'),

  s('bus-late', 'The bus is late.', 'Le bus a du retard.',
    [], 'travel', 'A2', 'Avoir du retard = to be delayed.'),

  s('open-sunday', 'The museum is open on Sunday.', 'Le musée est ouvert le dimanche.',
    [], 'city', 'A2', 'Days of the week take le for habitual actions.'),

  s('family-lyon', 'My family lives in Lyon.', 'Ma famille habite à Lyon.',
    [], 'family', 'A1', 'Habiter à + city.'),

  s('read-evening', 'I read in the evening.', 'Je lis le soir.',
    [], 'leisure', 'A1', 'Time of day uses le: le matin, le soir.'),

  s('cold-today', 'It is cold today.', "Il fait froid aujourd'hui.",
    ['Il fait froid aujourd’hui.'], 'nature', 'A1', 'Weather expressions use il fait…'),

  s('hot-summer', 'It is hot in summer.', 'Il fait chaud en été.',
    [], 'nature', 'A2', 'Seasons take en: en été, en hiver.'),

  s('study-french', 'I study French every day.', "J'étudie le français tous les jours.",
    ['J’étudie le français tous les jours.', "J'apprends le français tous les jours."], 'school', 'A2',
    'Tous les jours = every day.'),

  s('call-mother', 'I call my mother on Sunday.', 'J’appelle ma mère le dimanche.',
    ["J'appelle ma mère le dimanche."], 'family', 'A2', 'Appeler doubles the l before a mute e: j’appelle.'),

  s('buy-bread', 'I buy bread at the bakery.', 'J’achète du pain à la boulangerie.',
    ["J'achète du pain à la boulangerie."], 'food', 'A1', 'Partitive article: du pain (some bread).'),

  s('drink-water', 'She drinks water.', 'Elle boit de l’eau.',
    ['Elle boit de l eau.'], 'food', 'A1', 'De l’ before a vowel for the partitive.'),

  s('sleep-early', 'I go to bed early.', 'Je me couche tôt.',
    [], 'time', 'A2', 'Se coucher = to go to bed (reflexive).'),

  s('wake-seven', 'He wakes up at seven.', 'Il se réveille à sept heures.',
    [], 'time', 'A1', 'Reflexive verbs: subject + reflexive pronoun + verb.'),

  s('understand-now', 'I understand now.', 'Je comprends maintenant.',
    [], 'school', 'A2', 'Maintenant = now.'),

  s('lost-keys', 'I lost my keys.', "J'ai perdu mes clés.",
    ['J’ai perdu mes clés.', "J'ai perdu ma clé."], 'home', 'A2', 'Passé composé: avoir + past participle (perdu).'),

  s('very-beautiful', 'This church is very beautiful.', 'Cette église est très belle.',
    [], 'city', 'A2', 'Ce/Cet/Cette demonstrative adjective agrees with the noun.'),

  s('how-much', 'How much does it cost?', 'Ça coûte combien ?',
    ['Combien ça coûte ?', 'Combien coûte-t-il ?'], 'shopping', 'A2', 'Combien = how much.'),

  s('try-dress', 'I am trying on this dress.', 'J’essaie cette robe.',
    ["J'essaie cette robe."], 'clothing', 'A2', 'Essayer → essaie (y → i before a mute e).'),

  s('wait-friend', 'I am waiting for a friend.', 'J’attends un ami.',
    ["J'attends un ami."], 'family', 'A2', 'Attendre quelqu’un = to wait for someone (no preposition).'),

  s('sell-car', 'He sells his car.', 'Il vend sa voiture.',
    [], 'work', 'A2', 'Possessive agrees with the thing possessed: sa voiture (f).'),

  s('finish-work', 'I finish work at six.', 'Je finis le travail à six heures.',
    ['Je finis le travail à 18 heures.'], 'work', 'A1', 'Finir → je finis (regular -ir).'),

  s('sell-house', 'We sell the house.', 'Nous vendons la maison.',
    [], 'home', 'A2', 'Vendre → nous vendons (regular -re).'),

  s('take-metro', 'I take the metro every morning.', 'Je prends le métro tous les matins.',
    [], 'travel', 'A1', 'Prendre → je prends; tous les matins = every morning.'),

  s('must-leave', 'We must leave now.', 'Nous devons partir maintenant.',
    ['Il faut partir maintenant.'], 'travel', 'A2', 'Devoir + infinitive expresses obligation.'),

  s('can-speak', 'I can speak French.', 'Je peux parler français.',
    ["Je sais parler français."], 'school', 'A2', 'Pouvoir = to be able to; savoir = to know how to.'),

  s('want-travel', 'They want to travel.', 'Ils veulent voyager.',
    ['Elles veulent voyager.'], 'travel', 'A2', 'Vouloir + infinitive; ils/elles both use veulent.'),

  s('know-answer', 'I know the answer.', 'Je sais la réponse.',
    [], 'school', 'A2', 'Savoir for facts; connaître for people and places.'),

  s('like-cooking', 'She likes cooking.', 'Elle aime cuisiner.',
    [], 'food', 'A2', 'Aimer + infinitive = to like doing something.'),

  s('friends-tonight', 'We are going out with friends tonight.', 'Nous sortons avec des amis ce soir.',
    [], 'leisure', 'A2', 'Sortir = to go out; avec = with.'),

  s('new-computer', 'My computer is new.', 'Mon ordinateur est neuf.',
    [], 'technology', 'A1', 'Neuf = brand new; nouveau = new to someone.'),

  s('send-email', 'I send an email.', "J'envoie un email.",
    ['J’envoie un e-mail.', "J'envoie un e-mail."], 'technology', 'A2', 'Envoyer → j’envoie (y → i).'),

  s('weather-nice', 'The weather is nice today.', "Il fait beau aujourd'hui.",
    ['Il fait beau aujourd’hui.'], 'nature', 'A1', 'Il fait beau = the weather is nice.'),

  s('meet-ten', 'I meet my friends at ten.', 'Je retrouve mes amis à dix heures.',
    ['Je vois mes amis à dix heures.'], 'leisure', 'A2', 'Retrouver = to meet up with.'),

  s('always-late', 'He is always late.', 'Il est toujours en retard.',
    [], 'work', 'A2', 'Toujours = always; en retard = late.'),

  s('buy-cheese', 'I am buying some cheese.', "J'achète du fromage.",
    ['J’achète du fromage.'], 'shopping', 'A1', 'Du = de + le, partitive "some".'),

  s('doctor-tomorrow', 'I have a doctor appointment tomorrow.', "J'ai rendez-vous chez le médecin demain.",
    ['J’ai rendez-vous chez le médecin demain.', 'J\'ai un rendez-vous chez le médecin demain.'], 'health', 'A2', 'Avoir rendez-vous = to have an appointment.'),

  s('wear-jacket', 'She is wearing a jacket.', 'Elle porte une veste.',
    [], 'clothing', 'A1', 'Porter = to wear (also "to carry").'),

  s('hands-cold', 'My hands are cold.', "J'ai froid aux mains.",
    ['J’ai froid aux mains.'], 'body', 'A2', 'Avoir froid à + body part — not "mes mains sont froides".'),

  s('bus-ten-minutes', 'The bus arrives in ten minutes.', 'Le bus arrive dans dix minutes.',
    ['L\'autobus arrive dans dix minutes.', 'L’autobus arrive dans dix minutes.'], 'city', 'A1', 'Dans + duration = "in" (from now).'),
];
