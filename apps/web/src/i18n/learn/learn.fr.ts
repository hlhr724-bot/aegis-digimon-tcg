import type { learnEn } from "@/i18n/learn/learn.en";
import type { learnLessonsEn } from "@/i18n/learn/lessons.en";

export const learnFr = {
  "learn.eyebrow": "Apprendre",
  "learn.title": "Nouveau sur Digimon TCG ?",
  "learn.lede": "Jouez de courtes leçons contre un bot guidé, ou lisez les règles à votre rythme.",
  "learn.startLesson": "Commencer la leçon {number}",
  "learn.replayLessons": "Rejouer les leçons",
  "learn.readRules": "Lire Comment jouer",
  "learn.progress": "{completed} leçons terminées sur {total}",
  "learn.guestNote":
    "Vous jouez en tant qu'invité. Votre progression reste dans ce navigateur. Connectez-vous pour la retrouver sur tous vos appareils.",
  "learn.lessonsHeading": "Leçons",
  "learn.lessonNumber": "Leçon {number}",
  "learn.minutes": "{minutes} min",
  "learn.status.done": "Terminée",
  "learn.status.next": "Suivante",
  "learn.status.ready": "Prête",
  "learn.status.locked": "Verrouillée",
  "learn.lockedReason": "Terminez d'abord la leçon 1",
  "learn.start": "Commencer",
  "learn.replay": "Rejouer",
  "learn.rulesHeading": "Comment jouer",
  "learn.rulesLede": "Les règles en mots simples, un sujet à la fois.",

  "learn.briefing.counter": "Leçon {number} sur {total}",
  "learn.briefing.goals": "Vous allez apprendre :",
  "learn.briefing.note": "Votre deck et le plateau sont prêts. Le bot joue une partie simple et fixe.",
  "learn.briefing.drill": "Exercice de mot-clé",
  "learn.briefing.notNow": "Pas maintenant",
  "learn.briefing.start": "Commencer la leçon",

  "learn.coach.region": "Guide de la leçon",
  "learn.coach.counter": "Étape {current} sur {total}",
  "learn.coach.next": "Suivant",
  "learn.coach.hint": "Indice",
  "learn.coach.hideHint": "Masquer l'indice",
  "learn.coach.skip": "Passer l'étape",
  "learn.coach.restart": "Recommencer",
  "learn.coach.done": "Bravo !",
  "learn.coach.collapse": "Réduire le guide",
  "learn.coach.expand": "Afficher le guide",
  "learn.coach.move": "Déplacer le guide de la leçon",
  "learn.coach.moveHelp":
    "Faites glisser ou utilisez les flèches pour déplacer le guide. Appuyez sur Début pour rétablir sa position.",
  "learn.coach.finished": "Vous savez tout pour cette leçon. Terminez la partie pour la valider.",
  "learn.coach.chip": "Étape {current} sur {total}",

  "learn.complete.title": "Leçon terminée",
  "learn.complete.learned": "Vous avez appris :",
  "learn.complete.next": "Leçon suivante",
  "learn.complete.back": "Retour à Apprendre",
  "learn.complete.readMore": "En savoir plus : {chapter}",
  "learn.complete.failedTitle": "Leçon non terminée",
  "learn.complete.failedBody": "Aucun problème. Recommencez la leçon. Le plateau est réinitialisé à chaque fois.",
  "learn.complete.tryAgain": "Réessayer",

  "learn.lobbyButton": "Apprendre à jouer",

  "learn.rules.back": "Apprendre",
  "learn.rules.contents": "Sommaire",
  "learn.rules.previous": "Précédent : {chapter}",
  "learn.rules.nextChapter": "Suivant : {chapter}",
  "learn.rules.tryIt": "Essayer",
  "learn.rules.tryItLesson": "Leçon {number} : {title}",
  "learn.rules.tryDrillLabel": "Essayer un exercice sur <{keyword}>",
  "learn.rules.officialRules": "Règles complètes officielles (PDF)",
  "learn.rules.keywordFilter": "Filtrer les mots-clés",
  "learn.rules.keywordEmpty": "Aucun mot-clé ne correspond à votre filtre.",
  "learn.rules.keywordRule": "Règle {rule}",

  "learn.rules.goal.title": "Objectif",
  "learn.rules.goal.p1": "Chaque joueur a une pile de cartes face cachée appelée sécurité. Elle vous protège.",
  "learn.rules.goal.p2":
    "Attaquez pour retirer les cartes de sécurité de l'adversaire. Quand il n'en a plus, attaquez-le une dernière fois pour gagner.",
  "learn.rules.goal.p3": "Vous gagnez aussi si l'adversaire doit piocher une carte alors que son deck est vide.",

  "learn.rules.deck.title": "Votre deck",
  "learn.rules.deck.p1": "Vous jouez avec deux decks.",
  "learn.rules.deck.p2": "Le deck principal contient exactement 50 cartes : Digimon, Tamers et Options.",
  "learn.rules.deck.p3":
    "Le deck Digi-Œuf contient jusqu'à 5 Digi-Œufs. Vous les faites éclore dans la zone d'élevage.",
  "learn.rules.deck.p4": "Vous pouvez avoir jusqu'à 4 exemplaires d'une carte portant le même numéro.",

  "learn.rules.setup.title": "Mise en place",
  "learn.rules.setup.p1": "Les deux joueurs mélangent leur deck et piochent 5 cartes.",
  "learn.rules.setup.p2":
    "Si votre main ne vous plaît pas, vous pouvez la remélanger et piocher 5 nouvelles cartes, une seule fois.",
  "learn.rules.setup.p3": "Ensuite, chaque joueur place face cachée les 5 cartes du dessus de son deck comme sécurité.",
  "learn.rules.setup.p4": "Le premier joueur ne pioche pas lors de son premier tour.",

  "learn.rules.turn.title": "Un tour",
  "learn.rules.turn.p1": "Chaque tour comporte quatre phases, toujours dans le même ordre.",
  "learn.rules.turn.p2": "Réactivation : vos cartes suspendues se redressent.",
  "learn.rules.turn.p3": "Pioche : piochez 1 carte.",
  "learn.rules.turn.p4":
    "Élevage : faites éclore un Digi-Œuf, sortez un Digimon de la zone d'élevage, ou ne faites rien.",
  "learn.rules.turn.p5":
    "Principal : jouez des cartes, digivolvez et attaquez. Votre tour se termine quand la mémoire passe du côté de l'adversaire.",
  "learn.rules.turn.phaseUnsuspend": "Réactivation",
  "learn.rules.turn.phaseDraw": "Pioche",
  "learn.rules.turn.phaseBreeding": "Élevage",
  "learn.rules.turn.phaseMain": "Principal",

  "learn.rules.breeding.title": "Zone d'élevage",
  "learn.rules.breeding.p1": "La zone d'élevage accueille un Digimon. C'est un endroit protégé pour le faire grandir.",
  "learn.rules.breeding.p2":
    "Si la zone est vide, vous pouvez faire éclore : retournez la carte du dessus de votre deck Digi-Œuf dans la zone.",
  "learn.rules.breeding.p3": "Vous pouvez faire digivolver ce Digimon comme n'importe quel autre Digimon.",
  "learn.rules.breeding.p4":
    "Un Digimon dans la zone d'élevage ne peut pas attaquer ni être attaqué. Quand il est de niveau 3 ou plus, déplacez-le dans la zone de combat pendant votre phase d'élevage.",

  "learn.rules.memory.title": "Mémoire",
  "learn.rules.memory.p1":
    "Les deux joueurs partagent une seule jauge de mémoire. Elle va de 10 de votre côté à 10 du côté de l'adversaire.",
  "learn.rules.memory.p2":
    "Pour jouer ou faire digivolver une carte, payez son coût en déplaçant le compteur vers l'adversaire.",
  "learn.rules.memory.p3":
    "Votre tour continue tant que le compteur est de votre côté ou sur 0. Quand il atteint le côté de l'adversaire, votre tour se termine et l'adversaire commence avec cette mémoire.",
  "learn.rules.memory.p4":
    "Vous pouvez aussi terminer votre tour plus tôt. Le compteur passe alors à 3 du côté de l'adversaire.",
  "learn.rules.memory.example":
    "Mémoire 3. Vous jouez un Digimon qui coûte 5. Le compteur passe à 2 du côté de l'adversaire.",

  "learn.rules.digivolve.title": "Digivolver",
  "learn.rules.digivolve.p1":
    "Placez un Digimon de votre main sur l'un de vos Digimon d'un niveau inférieur et de la même couleur.",
  "learn.rules.digivolve.p2": "Payez le coût de digivolution. Il est en général plus bas que le coût de jeu.",
  "learn.rules.digivolve.p3": "Chaque fois que vous digivolvez, vous piochez 1 carte.",
  "learn.rules.digivolve.p4":
    "Les cartes en dessous restent comme cartes de digivolution. Leurs effets hérités, imprimés en bas de la carte, fonctionnent toujours.",
  "learn.rules.digivolve.p5":
    "La digivolution conserve l'état du Digimon. Un Digimon qui pouvait attaquer peut toujours attaquer après sa digivolution.",

  "learn.rules.attack.title": "Attaque et sécurité",
  "learn.rules.attack.p1":
    "Suspendez l'un de vos Digimon pour attaquer. Il peut attaquer l'adversaire ou l'un de ses Digimon suspendus.",
  "learn.rules.attack.p2": "Un Digimon ne peut pas attaquer le tour où vous le jouez, sauf s'il a <Rush>.",
  "learn.rules.attack.p3":
    "Quand vous attaquez l'adversaire, il révèle la carte du dessus de sa sécurité. Si c'est un Digimon, les deux Digimon combattent : celui qui a le moins de DP est supprimé. En cas d'égalité, les deux sont supprimés.",
  "learn.rules.attack.p4":
    "Si c'est un Tamer ou une Option, son effet [Security] s'active. La carte va ensuite dans la défausse.",
  "learn.rules.attack.p5":
    "Quand l'adversaire n'a plus de cartes de sécurité, votre attaque suivante contre lui gagne la partie.",
  "learn.rules.attack.flowAttack": "Attaque",
  "learn.rules.attack.flowCheck": "Vérifier la carte du dessus de la sécurité",
  "learn.rules.attack.flowBattle": "Digimon : comparer les DP",
  "learn.rules.attack.flowEffect": "Tamer ou Option : effet [Security]",
  "learn.rules.attack.flowWin": "Plus de sécurité : vous gagnez",

  "learn.rules.blocking.title": "Bloquer",
  "learn.rules.blocking.p1": "Certains Digimon ont <Blocker>.",
  "learn.rules.blocking.p2":
    "Quand l'adversaire attaque, vous pouvez suspendre un Digimon actif avec <Blocker>. L'attaque vise alors ce Digimon.",
  "learn.rules.blocking.p3": "Les deux Digimon combattent. Votre sécurité ne subit pas cette attaque.",

  "learn.rules.cardTypes.title": "Types de cartes",
  "learn.rules.cardTypes.p1": "Digi-Œuf : niveau 2. Il est dans votre deck Digi-Œuf et éclot dans la zone d'élevage.",
  "learn.rules.cardTypes.p2":
    "Digimon : a un niveau, des DP, un coût de jeu et en général un coût de digivolution. Les Digimon attaquent et combattent.",
  "learn.rules.cardTypes.p3":
    "Tamer : reste sur votre terrain et donne un effet permanent. Les Tamers ne peuvent pas attaquer.",
  "learn.rules.cardTypes.p4":
    "Option : payez son coût, utilisez son effet une fois, puis défaussez-la. Vous devez avoir un Digimon ou un Tamer de la même couleur sur votre terrain.",
  "learn.rules.cardTypes.p5":
    "Effet hérité : le texte en bas d'une carte Digimon. Il fonctionne tant que la carte est sous un autre Digimon.",

  "learn.rules.keywords.title": "Mots-clés",
  "learn.rules.keywords.p1":
    "Les mots-clés sont des noms courts pour des effets courants, écrits entre chevrons comme <Blocker>. Le texte des cartes est imprimé en anglais, cette liste l'est donc aussi.",

  "learn.rules.levels.egg": "Lv.2 Digi-Œuf",
  "learn.rules.levels.rookie": "Lv.3 Rookie",
  "learn.rules.levels.champion": "Lv.4 Champion",
  "learn.rules.levels.ultimate": "Lv.5 Ultimate",
  "learn.rules.levels.mega": "Lv.6 Mega",
  "learn.rules.levels.draw": "+1 carte",
  "learn.rules.memory.you": "Vous",
  "learn.rules.memory.opponent": "Adversaire",

  "learn.lesson.tutorial-attack-security.title": "Attaquer et gagner",
  "learn.lesson.tutorial-attack-security.summary":
    "Utilisez vos Digimon pour briser la dernière carte de sécurité et attaquer le joueur.",
  "learn.lesson.tutorial-attack-security.goal1": "Comment attaquer la sécurité de l'adversaire",
  "learn.lesson.tutorial-attack-security.goal2": "Comment une attaque directe gagne la partie",
  "learn.lesson.tutorial-attack-security.done":
    "Vous avez gagné en brisant la dernière carte de sécurité, puis en attaquant directement le joueur.",
  "learn.lesson.tutorial-attack-security.step.intro":
    "Vous gagnez quand l'adversaire n'a plus de cartes de sécurité et que l'un de vos Digimon l'attaque. L'adversaire a 1 carte de sécurité.",
  "learn.lesson.tutorial-attack-security.step.intro.hint":
    "Vos Digimon sont sur le terrain, en bas. La pile de sécurité de l'adversaire est en haut.",
  "learn.lesson.tutorial-attack-security.step.attack-security":
    "Attaquez avec Birdramon. Cliquez sur Birdramon, choisissez Attaque, puis cliquez sur la pile de sécurité de l'adversaire pour attaquer.",
  "learn.lesson.tutorial-attack-security.step.attack-security.hint":
    "Chaque attaque contre le joueur vérifie 1 carte de sécurité. Un Digimon en sécurité combat l'attaquant, et celui qui a le plus de DP gagne.",
  "learn.lesson.tutorial-attack-security.step.security-gone":
    "Birdramon avait plus de DP que le Gomamon en sécurité, donc la carte est allée dans la défausse. Birdramon est maintenant suspendu : il est tourné sur le côté.",
  "learn.lesson.tutorial-attack-security.step.security-gone.hint":
    "Un Digimon suspendu ne peut plus attaquer ce tour-ci. Il se réactive au début de votre prochain tour.",
  "learn.lesson.tutorial-attack-security.step.attack-player":
    "L'adversaire n'a plus de sécurité. Attaquez avec Dracomon pour gagner. Cliquez sur Dracomon, choisissez Attaque, puis cliquez sur la pile de sécurité de l'adversaire.",
  "learn.lesson.tutorial-attack-security.step.attack-player.hint":
    "Une attaque contre un joueur sans cartes de sécurité termine la partie. C'est la principale façon de gagner.",

  "learn.lesson.tutorial-hatch.title": "Zone d'élevage",
  "learn.lesson.tutorial-hatch.summary":
    "Faites grandir des Digimon dans votre zone d'élevage et découvrez quand un nouveau Digimon peut attaquer.",
  "learn.lesson.tutorial-hatch.goal1": "Comment faire éclore un Digi-Œuf et sortir un Digimon de la zone d'élevage",
  "learn.lesson.tutorial-hatch.goal2": "Pourquoi un Digimon que vous venez de jouer ne peut pas attaquer",
  "learn.lesson.tutorial-hatch.done":
    "Vous avez utilisé la zone d'élevage, attendu le premier tour d'un nouveau Digimon et gagné avec lui.",
  "learn.lesson.tutorial-hatch.step.intro":
    "La zone d'élevage est un endroit protégé pour faire grandir des Digimon. L'adversaire ne peut ni l'attaquer ni la cibler. Vous pouvez faire 1 action d'élevage par tour.",
  "learn.lesson.tutorial-hatch.step.intro.hint":
    "L'action d'élevage a lieu avant votre phase principale : faites éclore un Digi-Œuf, sortez un Digimon, ou ne faites rien.",
  "learn.lesson.tutorial-hatch.step.move-out":
    "Dracomon est prêt dans votre zone d'élevage. Cliquez sur Dracomon dans la zone d'élevage, puis déplacez-le sur le terrain.",
  "learn.lesson.tutorial-hatch.step.move-out.hint":
    "Seuls les Digimon de niveau 3 ou plus peuvent quitter la zone d'élevage. Un Digimon que vous sortez peut attaquer le même tour.",
  "learn.lesson.tutorial-hatch.step.play-biyomon":
    "Jouez Biyomon. Faites glisser Biyomon de votre main sur le terrain. Il coûte 2 mémoire.",
  "learn.lesson.tutorial-hatch.step.play-biyomon.hint":
    "Un Digimon joué depuis votre main ne peut pas attaquer le tour où vous le jouez. C'est le mal d'invocation.",
  "learn.lesson.tutorial-hatch.step.attack-security":
    "Biyomon doit attendre, mais Dracomon peut attaquer. Cliquez sur Dracomon, choisissez Attaque, puis cliquez sur la pile de sécurité de l'adversaire.",
  "learn.lesson.tutorial-hatch.step.attack-security.hint":
    "Dracomon a 4000 DP, donc il bat le Gomamon à 3000 DP en sécurité.",
  "learn.lesson.tutorial-hatch.step.end-turn":
    "Vous n'avez plus rien à faire. Cliquez sur Terminer le tour pour passer la main au bot.",
  "learn.lesson.tutorial-hatch.step.end-turn.hint": "Quand vous passez, le bot commence son tour avec 3 mémoire.",
  "learn.lesson.tutorial-hatch.step.hatch":
    "Votre zone d'élevage est de nouveau vide. Cliquez sur votre deck Digi-Œuf pour faire éclore Koromon.",
  "learn.lesson.tutorial-hatch.step.hatch.hint":
    "Faire éclore place la carte du dessus de votre deck Digi-Œuf dans la zone d'élevage. Vous ne pouvez faire éclore que si la zone d'élevage est vide.",
  "learn.lesson.tutorial-hatch.step.attack-player":
    "Biyomon n'est plus nouveau, il peut donc attaquer. Cliquez sur Biyomon, choisissez Attaque, puis cliquez sur la pile de sécurité de l'adversaire pour gagner.",
  "learn.lesson.tutorial-hatch.step.attack-player.hint":
    "Le mal d'invocation ne dure que le tour où vous jouez un Digimon.",

  "learn.lesson.tutorial-memory.title": "Mémoire",
  "learn.lesson.tutorial-memory.summary":
    "Payez de la mémoire pour jouer des Digimon et voyez comment la mémoire décide de la fin de votre tour.",
  "learn.lesson.tutorial-memory.goal1": "Comment payer de la mémoire pour jouer des cartes",
  "learn.lesson.tutorial-memory.goal2": "Pourquoi votre tour se termine quand la mémoire passe du côté de l'adversaire",
  "learn.lesson.tutorial-memory.done":
    "Vous avez payé de la mémoire, donné votre tour au bot et gagné avec le Digimon que vous avez joué.",
  "learn.lesson.tutorial-memory.step.intro":
    "La mémoire est le compteur entre vous et l'adversaire. Vous avez 3 mémoire. Chaque carte que vous jouez déplace le compteur vers l'adversaire.",
  "learn.lesson.tutorial-memory.step.intro.hint":
    "Quand le compteur dépasse 0 et passe du côté de l'adversaire, votre tour se termine et le sien commence.",
  "learn.lesson.tutorial-memory.step.play-biyomon":
    "Jouez Biyomon. Faites glisser Biyomon de votre main sur le terrain. Il coûte 2 mémoire.",
  "learn.lesson.tutorial-memory.step.play-biyomon.hint": "Le coût de jeu est le nombre en haut à gauche de la carte.",
  "learn.lesson.tutorial-memory.step.play-birdramon":
    "Il vous reste 1 mémoire. Jouez quand même Birdramon. Faites glisser Birdramon de votre main sur le terrain. Il coûte 4 mémoire.",
  "learn.lesson.tutorial-memory.step.play-birdramon.hint":
    "Vous pouvez payer plus de mémoire que vous n'en avez. Le compteur passe à 3 du côté de l'adversaire et votre tour se termine.",
  "learn.lesson.tutorial-memory.step.attack-security":
    "Le bot passe son tour, donc vous commencez avec 3 mémoire. Attaquez avec Birdramon. Cliquez sur Birdramon, choisissez Attaque, puis cliquez sur la pile de sécurité de l'adversaire.",
  "learn.lesson.tutorial-memory.step.attack-security.hint":
    "Vos Digimon ont été joués au tour précédent, donc les deux peuvent attaquer maintenant.",
  "learn.lesson.tutorial-memory.step.attack-player":
    "L'adversaire n'a plus de sécurité. Cliquez sur Biyomon, choisissez Attaque, puis cliquez sur la pile de sécurité de l'adversaire pour gagner.",
  "learn.lesson.tutorial-memory.step.attack-player.hint":
    "Les attaques ne coûtent pas de mémoire. Seuls jouer et faire digivolver des cartes en coûtent.",

  "learn.lesson.tutorial-digivolve.title": "Digivolver",
  "learn.lesson.tutorial-digivolve.summary":
    "Faites digivolver un Rookie en un Champion plus fort et attaquez avec lui.",
  "learn.lesson.tutorial-digivolve.goal1": "Comment digivolver et payer le coût de digivolution",
  "learn.lesson.tutorial-digivolve.goal2": "Comment fonctionnent les cartes de digivolution et les effets hérités",
  "learn.lesson.tutorial-digivolve.done":
    "Vous avez fait digivolver Agumon en Greymon, pioché une carte bonus et gagné avec un Digimon plus fort.",
  "learn.lesson.tutorial-digivolve.step.intro":
    "Agumon est un Rookie de niveau 3. Vous pouvez le faire digivolver en Greymon, un Champion de niveau 4, pour moins de mémoire que si vous jouiez Greymon.",
  "learn.lesson.tutorial-digivolve.step.intro.hint":
    "Une carte peut digivolver depuis un Digimon de la bonne couleur et du bon niveau. Le coût de digivolution est imprimé sur la carte.",
  "learn.lesson.tutorial-digivolve.step.digivolve":
    "Faites glisser Greymon de votre main sur Agumon. Digivolver coûte 2 mémoire.",
  "learn.lesson.tutorial-digivolve.step.digivolve.hint":
    "Jouer Greymon coûterait 5 mémoire. Digivolver coûte moins cher et garde Agumon prêt à attaquer.",
  "learn.lesson.tutorial-digivolve.step.bonus":
    "Vous avez pioché 1 carte en bonus de digivolution. Agumon est maintenant sous Greymon comme carte de digivolution.",
  "learn.lesson.tutorial-digivolve.step.bonus.hint":
    "Les cartes sous un Digimon donnent leurs effets hérités. Agumon donne +1000 DP à Greymon pendant votre tour, donc Greymon a 5000 DP.",
  "learn.lesson.tutorial-digivolve.step.attack-security":
    "Attaquez avec Greymon. Cliquez sur Greymon, choisissez Attaque, puis cliquez sur la pile de sécurité de l'adversaire.",
  "learn.lesson.tutorial-digivolve.step.attack-security.hint":
    "Un Digimon qui digivolve reste le même Digimon, il peut donc attaquer ce tour-ci.",
  "learn.lesson.tutorial-digivolve.step.attack-player":
    "L'adversaire n'a plus de sécurité. Cliquez sur Biyomon, choisissez Attaque, puis cliquez sur la pile de sécurité de l'adversaire pour gagner.",
  "learn.lesson.tutorial-digivolve.step.attack-player.hint":
    "Digivolver rend vos Digimon plus forts sans le mal d'invocation d'une nouvelle carte.",

  "learn.lesson.tutorial-block.title": "Bloquer",
  "learn.lesson.tutorial-block.summary":
    "Utilisez un <Blocker> pour arrêter une attaque, puis gagnez pendant votre tour.",
  "learn.lesson.tutorial-block.goal1": "Comment un Digimon avec <Blocker> vous protège",
  "learn.lesson.tutorial-block.goal2": "Comment se déroule un combat entre deux Digimon",
  "learn.lesson.tutorial-block.done": "Vous avez bloqué l'attaque du bot avec Monochromon et gagné au tour suivant.",
  "learn.lesson.tutorial-block.step.intro":
    "C'est le tour du bot. Votre Monochromon a <Blocker>. Il peut intervenir quand un Digimon adverse attaque.",
  "learn.lesson.tutorial-block.step.intro.hint":
    "<Blocker> fonctionne pendant le tour de l'adversaire. Le Digimon doit être actif pour bloquer.",
  "learn.lesson.tutorial-block.step.incoming-attack":
    "Le Gomamon du bot va vous attaquer. Attendez la demande de blocage.",
  "learn.lesson.tutorial-block.step.incoming-attack.hint":
    "Sans blocage, Gomamon vérifierait 1 de vos cartes de sécurité.",
  "learn.lesson.tutorial-block.step.block":
    "Bloquez avec Monochromon. Choisissez Monochromon dans la demande de blocage.",
  "learn.lesson.tutorial-block.step.block.hint":
    "Monochromon a 5000 DP et Gomamon a 3000 DP. Le Digimon qui a le moins de DP est supprimé.",
  "learn.lesson.tutorial-block.step.your-turn":
    "Monochromon a gagné le combat et il est maintenant suspendu. Attendez que le bot termine son tour.",
  "learn.lesson.tutorial-block.step.your-turn.hint":
    "Bloquer suspend votre Digimon. Il se réactive au début de votre tour, il peut donc encore attaquer.",
  "learn.lesson.tutorial-block.step.attack-security":
    "C'est votre tour. Attaquez avec Monochromon. Cliquez sur Monochromon, choisissez Attaque, puis cliquez sur la pile de sécurité de l'adversaire.",
  "learn.lesson.tutorial-block.step.attack-security.hint":
    "Monochromon a 5000 DP, donc il bat le Bearmon à 4000 DP en sécurité.",
  "learn.lesson.tutorial-block.step.attack-player":
    "L'adversaire n'a plus de sécurité. Cliquez sur Birdramon, choisissez Attaque, puis cliquez sur la pile de sécurité de l'adversaire pour gagner.",
  "learn.lesson.tutorial-block.step.attack-player.hint":
    "Le bot n'a plus de Digimon pour bloquer, donc votre attaque passe.",

  "learn.lesson.tutorial-tamers.title": "Tamers",
  "learn.lesson.tutorial-tamers.summary":
    "Jouez un Tamer pour renforcer vos Digimon et utilisez un effet hérité pour gagner.",
  "learn.lesson.tutorial-tamers.goal1": "Comment les Tamers restent sur le terrain et aident vos Digimon",
  "learn.lesson.tutorial-tamers.goal2": "Comment un effet hérité vous permet de vérifier plus de sécurité",
  "learn.lesson.tutorial-tamers.done":
    "Vous avez joué Tai Kamiya, vérifié 2 cartes de sécurité avec Garudamon et gagné avec Dracomon.",
  "learn.lesson.tutorial-tamers.step.intro":
    "L'adversaire a 2 cartes de sécurité. Garudamon peut briser les deux en 1 attaque s'il a assez de DP.",
  "learn.lesson.tutorial-tamers.step.intro.hint":
    "Les Tamers sont des cartes qui restent sur le terrain. Ils n'attaquent pas, mais leurs effets aident vos Digimon.",
  "learn.lesson.tutorial-tamers.step.play-tamer":
    "Jouez Tai Kamiya. Faites glisser Tai Kamiya de votre main sur le terrain. Il coûte 2 mémoire.",
  "learn.lesson.tutorial-tamers.step.play-tamer.hint":
    "Tai Kamiya donne +1000 DP à tous vos Digimon pendant votre tour. Garudamon a maintenant 8000 DP.",
  "learn.lesson.tutorial-tamers.step.inherited":
    "Greymon est sous Garudamon. Son effet hérité donne <Security Attack +1> à Garudamon, qui vérifie donc 2 cartes de sécurité.",
  "learn.lesson.tutorial-tamers.step.inherited.hint":
    "Ouvrez Garudamon pour voir ses cartes de digivolution. Chacune peut donner un effet hérité.",
  "learn.lesson.tutorial-tamers.step.attack-security":
    "Attaquez avec Garudamon. Cliquez sur Garudamon, choisissez Attaque, puis cliquez sur la pile de sécurité de l'adversaire.",
  "learn.lesson.tutorial-tamers.step.attack-security.hint":
    "La deuxième carte de sécurité est un WereGarurumon à 7000 DP. Sans Tai Kamiya, le combat serait une égalité et les deux Digimon seraient supprimés.",
  "learn.lesson.tutorial-tamers.step.attack-player":
    "L'adversaire n'a plus de sécurité. Cliquez sur Dracomon, choisissez Attaque, puis cliquez sur la pile de sécurité de l'adversaire pour gagner.",
  "learn.lesson.tutorial-tamers.step.attack-player.hint":
    "Les effets des Tamers continuent tant que le Tamer reste sur le terrain.",
} satisfies Record<keyof typeof learnEn | keyof typeof learnLessonsEn, string>;
