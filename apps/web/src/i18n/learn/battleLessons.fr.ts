import type { newDrillsEn } from "@/i18n/learn/newDrills.en";
import { buildRulePracticeTranslations } from "@/i18n/learn/buildRulePracticeTranslations";
import { learnFr } from "@/i18n/learn/learn.fr";

export const battleLessonsFr = {
  ...buildRulePracticeTranslations({ dictionary: learnFr }),
  "learn.lesson.drill-retaliation.title": "Retaliation : éliminer un Digimon plus fort",
  "learn.lesson.drill-retaliation.summary":
    "Battez un Blocker plus fort en perdant une bataille avec Retaliation, puis gagnez.",
  "learn.lesson.drill-retaliation.goal1": "Comment Retaliation supprime le Digimon qui a gagné la bataille",
  "learn.lesson.drill-retaliation.goal2": "Pourquoi un petit attaquant peut éliminer un défenseur beaucoup plus fort",
  "learn.lesson.drill-retaliation.done":
    "Candlemon a perdu la bataille, supprimé Monochromon avec Retaliation et ouvert l'attaque gagnante.",
  "learn.lesson.drill-retaliation.step.intro":
    "Candlemon a 1000 DP et Retaliation. Le Monochromon du bot est suspendu, possède Blocker et a 5000 DP. Perdre cette bataille peut vous permettre de supprimer ce bloqueur.",
  "learn.lesson.drill-retaliation.step.intro.hint":
    "Retaliation se déclenche lorsque ce Digimon est supprimé après avoir perdu une bataille contre un autre Digimon.",
  "learn.lesson.drill-retaliation.step.retaliate":
    "Cliquez sur Candlemon, choisissez Attaque, puis choisissez le Monochromon suspendu. Laissez la bataille et Retaliation se résoudre.",
  "learn.lesson.drill-retaliation.step.retaliate.hint":
    "Candlemon perd sur DP. Retaliation supprime ensuite Monochromon ; il s'agit d'une suppression par effet, pas d'une seconde bataille.",
  "learn.lesson.drill-retaliation.step.win":
    "Monochromon a disparu et le bot n'a aucune sécurité. Attaquez le joueur avec Birdramon pour gagner.",
  "learn.lesson.drill-retaliation.step.win.hint":
    "Conservez Birdramon pour cette attaque finale plutôt que de le sacrifier lors de la première bataille.",
  "learn.lesson.drill-blitz.title": "Blitz : attaque après que la mémoire dépasse zéro",
  "learn.lesson.drill-blitz.summary":
    "Digivolvez en faisant passer la mémoire chez l’adversaire, puis utilisez Blitz avant la fin du tour.",
  "learn.lesson.drill-blitz.goal1":
    "Pourquoi franchir zéro lors du paiement n’interrompt pas les effets de digivolution",
  "learn.lesson.drill-blitz.goal2": "Comment Blitz accorde une attaque alors que l'adversaire a de la mémoire",
  "learn.lesson.drill-blitz.done":
    "BetelGammamon a digivolvé en faisant passer la mémoire chez l’adversaire, puis son attaque Blitz a gagné la partie.",
  "learn.lesson.drill-blitz.step.intro":
    "Vous avez 1 mémoire et Biyomon sur le terrain. BetelGammamon coûte 2 pour digivolver et possède [When Digivolving] Blitz.",
  "learn.lesson.drill-blitz.step.intro.hint":
    "Le bot n'a aucune sécurité. Vous devez utiliser l'invite Blitz après le paiement ; une nouvelle action ordinaire en phase principale arriverait trop tard.",
  "learn.lesson.drill-blitz.step.digivolve":
    "Digivolvez Biyomon en BetelGammamon depuis votre main. Le paiement donne au bot 1 mémoire.",
  "learn.lesson.drill-blitz.step.digivolve.hint":
    "La digivolution transforme le Digimon existant et ne réinitialise pas son autorisation d’attaquer.",
  "learn.lesson.drill-blitz.step.blitz-attack":
    "Acceptez l'effet Blitz. Attaquez ensuite le joueur avec BetelGammamon pour gagner avant que le tour ne passe.",
  "learn.lesson.drill-blitz.step.blitz-attack.hint":
    "Blitz permet cette attaque alors que le bot a de la mémoire. Il n’accorde pas Rush et ne réactive pas l’attaquant.",
  "learn.lesson.drill-raid.title": "Raid : défiez le Digimon prêt le plus fort",
  "learn.lesson.drill-raid.summary": "Redirigez une attaque sur un Blocker non suspendu à l'aide de Raid.",
  "learn.lesson.drill-raid.goal1": "Comment Raid modifie une cible d'attaque déclarée",
  "learn.lesson.drill-raid.goal2":
    "Pourquoi la cible doit être un Digimon adverse non suspendu avec le DP le plus élevé",
  "learn.lesson.drill-raid.done":
    "Grizzlymon a utilisé Raid pour supprimer Monochromon, et Birdramon a lancé l'attaque gagnante.",
  "learn.lesson.drill-raid.step.intro":
    "Grizzlymon a Raid et obtient +1000 DP de l’Agumon en dessous. Le bot dispose d’un Monochromon de 5000 DP non suspendu.",
  "learn.lesson.drill-raid.step.intro.hint":
    "Vous ne pouvez normalement pas déclarer une attaque sur un Digimon non suspendu. Raid modifie la cible après la déclaration.",
  "learn.lesson.drill-raid.step.raid":
    "Attaquez le joueur avec Grizzlymon. Dans la sélection Raid, choisissez Monochromon comme nouvelle cible.",
  "learn.lesson.drill-raid.step.raid.hint":
    "Grizzlymon a 6000 DP, il remporte donc cette bataille. Monochromon est la cible non suspendue éligible au DP le plus élevé.",
  "learn.lesson.drill-raid.step.win": "Le bloqueur a disparu. Attaquez le joueur avec Birdramon pour gagner.",
  "learn.lesson.drill-raid.step.win.hint":
    "La modification de la cible via Raid n'a pas généré de contrôle de sécurité ; Birdramon effectue une attaque distincte.",
  "learn.lesson.drill-collision.title": "Collision : faire bloquer le bot",
  "learn.lesson.drill-collision.summary":
    "Forcer un Digimon sans Blocker imprimé à se défendre, puis percer sa sécurité.",
  "learn.lesson.drill-collision.goal1": "Comment Collision accorde Blocker au Digimon adverse tout en attaquant",
  "learn.lesson.drill-collision.goal2": "Pourquoi le défenseur doit bloquer s'il le peut",
  "learn.lesson.drill-collision.done":
    "Proganomon a forcé Gomamon à bloquer, a percé la dernière carte de sécurité et Birdramon a gagné.",
  "learn.lesson.drill-collision.step.intro":
    "Proganomon possède Collision et Piercing. Le bot possède Gomamon, dont la carte ne possède pas Blocker, et 1 carte de sécurité.",
  "learn.lesson.drill-collision.step.intro.hint":
    "Collision donne au Digimon adverse Blocker lors de cette attaque et fait bloquer le bot s'il le peut.",
  "learn.lesson.drill-collision.step.collision":
    "Attaquez le joueur avec Proganomon. Le bot doit bloquer avec Gomamon, qui perd le combat. Proganomon effectue ensuite une vérification de sécurité grâce à Piercing.",
  "learn.lesson.drill-collision.step.collision.hint":
    "Le bot ne peut pas refuser le bloc disponible. Le Proganomon a 7000 DP contre 3000 DP pour le Gomamon.",
  "learn.lesson.drill-collision.step.win":
    "Le bot n'a ni sécurité ni défenseur. Attaquez le joueur avec Birdramon pour gagner.",
  "learn.lesson.drill-collision.step.win.hint":
    "Collision a forcé la bataille ; Piercing a fourni le contrôle de sécurité après la victoire de Proganomon.",
  "learn.lesson.drill-vortex.title": "Vortex : une bataille finale en fin de tour",
  "learn.lesson.drill-vortex.summary":
    "Jouez Galemon et utilisez Vortex pour attaquer un Digimon pendant le même tour.",
  "learn.lesson.drill-vortex.goal1": "Comment Vortex crée une attaque de fin de tour",
  "learn.lesson.drill-vortex.goal2":
    "Pourquoi Vortex peut attaquer au tour où le Digimon a été joué mais cible normalement uniquement les Digimon",
  "learn.lesson.drill-vortex.done":
    "Galemon a utilisé Vortex pour effacer Monochromon lors de son premier tour de jeu, puis a gagné au tour suivant.",
  "learn.lesson.drill-vortex.step.intro":
    "Galemon a Vortex. Le bot a un Monochromon suspendu et aucune sécurité. Galemon peut éliminer ce bloqueur à la fin de votre tour.",
  "learn.lesson.drill-vortex.step.intro.hint":
    "Un Digimon normal fraîchement joué ne peut pas attaquer ce tour-ci. Vortex fournit une exception spécifique à la fin du tour.",
  "learn.lesson.drill-vortex.step.play": "Jouez Galemon depuis votre main pour 6 mémoires.",
  "learn.lesson.drill-vortex.step.play.hint":
    "Votre mémoire devient nulle. N'essayez pas une attaque normale ; Galemon vient d'être joué.",
  "learn.lesson.drill-vortex.step.vortex":
    "Cliquez sur Fin du tour, acceptez Vortex et choisissez le Monochromon suspendu comme cible de l'attaque.",
  "learn.lesson.drill-vortex.step.vortex.hint":
    "Vortex ne vous permet normalement pas de cibler le joueur. Les 6000 DP du Galemon battent les 5000 DP du Monochromon.",
  "learn.lesson.drill-vortex.step.opponent-turn":
    "Que le traitement de fin de tour se termine et que le tour du robot commence.",
  "learn.lesson.drill-vortex.step.opponent-turn.hint":
    "L'attaque par mot-clé se produit avant que le tour ne change réellement. Le bot passera alors.",
  "learn.lesson.drill-vortex.step.your-turn":
    "Attendez que le bot passe et que votre prochaine phase principale commence.",
  "learn.lesson.drill-vortex.step.your-turn.hint":
    "Galemon se réactive au début de votre tour et n’est plus un Digimon joué pendant ce tour-ci.",
  "learn.lesson.drill-vortex.step.win": "Attaquez le joueur normalement avec Galemon pour gagner.",
  "learn.lesson.drill-vortex.step.win.hint":
    "Il s’agit d’une attaque normale en phase principale. Il n'utilise pas la restriction Vortex réservée aux Digimon.",
  "learn.lesson.drill-overclock.title": "Overclock : attaque à nouveau sans se lever",
  "learn.lesson.drill-overclock.summary":
    "Sacrifiez un Puppet pour que ShoeShoemon, déjà suspendu, attaque à nouveau à la fin du tour.",
  "learn.lesson.drill-overclock.goal1": "Comment Overclock paie en supprimant un autre Digimon spécifié",
  "learn.lesson.drill-overclock.goal2": "Pourquoi une attaque sans suspension peut provenir d'un Digimon suspendu",
  "learn.lesson.drill-overclock.done":
    "ShoeShoemon a vérifié la sécurité, supprimé Shoemon pour payer Overclock et attaqué à nouveau sans se réactiver.",
  "learn.lesson.drill-overclock.step.intro":
    "ShoeShoemon a Overclock pour le trait Puppet. Shoemon est un autre Puppet et a été joué ce tour-ci, alors gardez-le comme paiement.",
  "learn.lesson.drill-overclock.step.intro.hint":
    "Overclock attaque un joueur sans suspension, même si ShoeShoemon est déjà suspendu.",
  "learn.lesson.drill-overclock.step.clear-security":
    "Attaquez le joueur avec ShoeShoemon pour supprimer la dernière carte de sécurité.",
  "learn.lesson.drill-overclock.step.clear-security.hint":
    "ShoeShoemon reste suspendu après cette attaque. Ne négligez pas l'invite de mot clé suivante.",
  "learn.lesson.drill-overclock.step.overclock":
    "Cliquez sur Fin de tour et acceptez Overclock. Votre seul Puppet éligible, Shoemon, est supprimé en tant que paiement. Choisissez ensuite le joueur comme cible d'attaque pour gagner.",
  "learn.lesson.drill-overclock.step.overclock.hint":
    "Payez avec Shoemon, et non avec ShoeShoemon. Après ce paiement, l’attaque Overclock contre le joueur est obligatoire et n’exige pas de réactiver l’attaquant.",
  "learn.lesson.drill-iceclad.title": "Iceclad : gagnez avec plus de sources",
  "learn.lesson.drill-iceclad.summary": "Battez un Digimon à 12000 DP en comparant le nombre de cartes digivolution.",
  "learn.lesson.drill-iceclad.goal1": "Comment Iceclad remplace la comparaison DP dans une bataille Digimon",
  "learn.lesson.drill-iceclad.goal2": "Pourquoi les batailles de sécurité sont toujours comparables à DP",
  "learn.lesson.drill-iceclad.done":
    "Les deux sources de PolarBearmon ont battu le zéro de WarGreymon malgré son DP inférieur, et Birdramon a gagné.",
  "learn.lesson.drill-iceclad.step.intro":
    "PolarBearmon dispose de 7000 DP, Iceclad et 2 cartes digivolution. Le WarGreymon suspendu dispose de 12000 DP mais pas de cartes digivolution.",
  "learn.lesson.drill-iceclad.step.intro.hint":
    "Iceclad compare les sources au lieu des DP dans des batailles autres que les batailles de sécurité. Plus de sources gagnent ; un nombre égal fait perdre les deux.",
  "learn.lesson.drill-iceclad.step.iceclad":
    "Attaquez le WarGreymon suspendu avec PolarBearmon. Laissez la bataille Iceclad se résoudre.",
  "learn.lesson.drill-iceclad.step.iceclad.hint":
    "Comparez 2 sources contre 0, et non 7000 DP contre 12000 DP. PolarBearmon survit à la bataille gagnante.",
  "learn.lesson.drill-iceclad.step.win":
    "WarGreymon a disparu et le bot n'a aucune sécurité. Attaquez le joueur avec Birdramon pour gagner.",
  "learn.lesson.drill-iceclad.step.win.hint":
    "Un Digimon de sécurité combattrait toujours en utilisant DP ; La comparaison des sources de Iceclad ne s’y applique pas.",
  "learn.lesson.drill-execute.title": "Execute : dépensez votre attaquant pour briser une défense",
  "learn.lesson.drill-execute.summary":
    "Attaquez un Blocker non suspendu à la fin du tour, puis acceptez la suppression de votre attaquant.",
  "learn.lesson.drill-execute.goal1": "Comment Execute permet une attaque de fin de tour sur un Digimon non suspendu",
  "learn.lesson.drill-execute.goal2": "Pourquoi l'attaquant est supprimé à la fin de cette attaque",
  "learn.lesson.drill-execute.done":
    "Phantomon a vaincu Monochromon avec Execute et a été supprimé ; Birdramon a alors gagné à votre tour suivant.",
  "learn.lesson.drill-execute.step.intro":
    "Phantomon a Execute et 7000 DP. Le Monochromon non suspendu du bot a 5000 DP et bloquerait Birdramon.",
  "learn.lesson.drill-execute.step.intro.hint":
    "Execute permet à Phantomon d'attaquer à la fin de votre tour, y compris un Digimon adverse non suspendu. Il sera supprimé à la fin de l'attaque.",
  "learn.lesson.drill-execute.step.execute":
    "Cliquez sur Fin du tour, acceptez Execute et choisissez Monochromon comme cible. Que la bataille et la suppression de Phantomon se terminent.",
  "learn.lesson.drill-execute.step.execute.hint":
    "Ne choisissez pas le joueur : retirer le bloqueur est le but. La suppression retardée de Execute se produit toujours après que Phantomon ait remporté la bataille.",
  "learn.lesson.drill-execute.step.opponent-turn":
    "Que le traitement de fin de tour se termine et que le tour du robot commence.",
  "learn.lesson.drill-execute.step.opponent-turn.hint":
    "L'attaque par mot-clé se produit avant que le tour ne change réellement. Le bot passera alors.",
  "learn.lesson.drill-execute.step.your-turn":
    "Attendez que le bot passe et votre prochain tour pour atteindre la phase principale.",
  "learn.lesson.drill-execute.step.your-turn.hint": "Birdramon est resté prêt et il ne reste plus aucun bloqueur.",
  "learn.lesson.drill-execute.step.win": "Attaquez le joueur avec Birdramon pour gagner.",
  "learn.lesson.drill-execute.step.win.hint":
    "Le bot n'a aucune sécurité. Le sacrifice de Phantomon a supprimé la défense qui le protégeait.",
  "learn.lesson.drill-progress.title": "Progress : résiste à un effet de sécurité en attaquant",
  "learn.lesson.drill-progress.summary": "Attaquez via Cocytus Breath et gardez votre Digimon avec Progress.",
  "learn.lesson.drill-progress.goal1": "Comment Progress empêche les effets adverses d'affecter un attaquant",
  "learn.lesson.drill-progress.goal2": "Pourquoi Progress n'empêche pas toutes les pertes de bataille",
  "learn.lesson.drill-progress.done":
    "Dimetromon a ignoré l'effet de sécurité lors de l'attaque et est revenu au tour suivant pour gagner.",
  "learn.lesson.drill-progress.step.intro":
    "Dimetromon a Progress : les effets adverses ne l'affectent pas tant qu'il attaque. La dernière carte de sécurité du bot est Cocytus Breath.",
  "learn.lesson.drill-progress.step.intro.hint":
    "Cocytus Breath renvoie normalement un Digimon adverse à la main. Progress protège cet attaquant pendant cet effet.",
  "learn.lesson.drill-progress.step.progress":
    "Attaquez le joueur avec Dimetromon. Regardez Cocytus Breath se résoudre sans remettre votre attaquant sous la main.",
  "learn.lesson.drill-progress.step.progress.hint":
    "La protection concerne les effets adverses pendant l’attaque. Elle n’empêche pas la suppression par combat contre un Digimon de sécurité plus fort.",
  "learn.lesson.drill-progress.step.end-turn": "Dimetromon est resté sur le terrain. Cliquez sur Fin du tour.",
  "learn.lesson.drill-progress.step.end-turn.hint": "Le bot n'a pas de Digimon pour vous attaquer.",
  "learn.lesson.drill-progress.step.your-turn": "Attendez votre prochaine phase principale.",
  "learn.lesson.drill-progress.step.your-turn.hint": "Dimetromon se réactive au début de votre tour.",
  "learn.lesson.drill-progress.step.win": "Attaquez le joueur avec Dimetromon pour gagner.",
  "learn.lesson.drill-progress.step.win.hint":
    "Sans la protection Progress, votre seul attaquant aurait été remis en main.",
  "learn.lesson.drill-engage.title": "Engage : attaque pendant le traitement de fin de tour",
  "learn.lesson.drill-engage.summary": "Gardez votre Digimon prêt et acceptez une attaque Engage après son passage.",
  "learn.lesson.drill-engage.goal1": "Comment Engage se déclenche à la fin de votre tour",
  "learn.lesson.drill-engage.goal2": "Pourquoi l'attaque se résout avant que l'adversaire ne commence son tour",
  "learn.lesson.drill-engage.done":
    "WarGrowlmon a utilisé Engage pour attaquer pendant le traitement de fin de tour et gagner.",
  "learn.lesson.drill-engage.step.intro":
    "WarGrowlmon a Engage et le bot n'a aucune sécurité. Vous gagnerez en utilisant son mot-clé de fin de tour au lieu d'une attaque normale en phase principale.",
  "learn.lesson.drill-engage.step.intro.hint":
    "Engage est facultatif. Son attaque doit être autorisée par les règles au moment où l’effet se résout.",
  "learn.lesson.drill-engage.step.keep-ready":
    "Gardez WarGrowlmon non suspendu pour pouvoir utiliser Engage. Continuez lorsque vous êtes prêt à passer.",
  "learn.lesson.drill-engage.step.keep-ready.hint":
    "Engage ne réactive pas lui-même un Digimon et ne permet pas à un Digimon nouvellement joué d'ignorer l'attente normale pour attaquer.",
  "learn.lesson.drill-engage.step.engage":
    "Cliquez sur Fin du tour, acceptez Engage et choisissez le joueur comme cible d'attaque pour gagner.",
  "learn.lesson.drill-engage.step.engage.hint":
    "Passer donne au bot 3 mémoire, mais Engage et son attaque se résolvent avant le début du tour du bot.",
  "learn.lesson.drill-barrier.title": "Barrier : payez une sécurité pour garder votre Digimon",
  "learn.lesson.drill-barrier.summary":
    "Protégez Angemon d'une bataille de sécurité perdue, puis utilisez-la pour gagner.",
  "learn.lesson.drill-barrier.goal1": "Comment Barrier remplace la suppression de bataille",
  "learn.lesson.drill-barrier.goal2": "Pourquoi payer une carte de sécurité est différent de la vérifier",
  "learn.lesson.drill-barrier.done":
    "Angemon a payé une sécurité pour Barrier, a survécu à la bataille et a gagné au tour suivant.",
  "learn.lesson.drill-barrier.step.intro":
    "Angemon a 4000 DP et Barrier. La dernière carte de sécurité du bot est une Ikkakumon de 5000 DP, donc Angemon perdra cette bataille.",
  "learn.lesson.drill-barrier.step.intro.hint":
    "Vous disposez d’une carte de sécurité pour payer Barrier et empêcher la suppression du combat de Angemon.",
  "learn.lesson.drill-barrier.step.barrier":
    "Attaquez le joueur avec Angemon. À l’invite Barrier, acceptez de défausser la carte du dessus de votre sécurité pour conserver Angemon.",
  "learn.lesson.drill-barrier.step.barrier.hint":
    "Barrier empêche cette suppression par combat. La carte de sécurité défaussée est un paiement ; son effet de sécurité ne s’active pas.",
  "learn.lesson.drill-barrier.step.end-turn":
    "Angemon a survécu et les deux joueurs n'ont aucune sécurité. Cliquez sur Fin du tour.",
  "learn.lesson.drill-barrier.step.end-turn.hint":
    "Le bot n'a pas de Digimon sur le terrain, donc les passes sont sûres ici.",
  "learn.lesson.drill-barrier.step.your-turn": "Attendez votre prochaine phase principale.",
  "learn.lesson.drill-barrier.step.your-turn.hint": "Angemon se réactive au début de votre tour.",
  "learn.lesson.drill-barrier.step.win": "Attaquez le joueur avec Angemon pour gagner.",
  "learn.lesson.drill-barrier.step.win.hint":
    "Barrier a conservé le seul attaquant dont vous aviez besoin pour ce coup final.",
  "learn.lesson.drill-training.title": "Training : créez la source qui gagne une bataille",
  "learn.lesson.drill-training.summary":
    "Entraînez Greymon pour que sa prochaine attaque gagne suffisamment de DP pour battre un Blocker.",
  "learn.lesson.drill-training.goal1":
    "Comment Training suspend un Digimon et place le dessus du deck face cachée en dessous",
  "learn.lesson.drill-training.goal2":
    "Comment des sources supplémentaires face cachée peuvent renforcer les autres effets d'une carte",
  "learn.lesson.drill-training.done":
    "Greymon a entraîné une source face cachée, en a ajouté une autre en attaquant et a battu le bloqueur avec 7000 DP. Dracomon a gagné.",
  "learn.lesson.drill-training.step.intro":
    "Greymon a Training et 5000 DP. Le Grizzlymon du bot a 6000 DP et le Blocker. Training peut créer la source supplémentaire dont Greymon a besoin pour gagner cette bataille.",
  "learn.lesson.drill-training.step.intro.hint":
    "L'effet d'attaque de Greymon donne +1000 DP pour chacune de ses sources face cachée. Une carte entraînée face cachée ne fournit pas son effet hérité imprimé.",
  "learn.lesson.drill-training.step.train":
    "Cliquez sur Greymon et activez Training. Il suspend et place la carte du dessus de votre deck face cachée au bas de ses cartes digivolution.",
  "learn.lesson.drill-training.step.train.hint":
    "Training ne coûte pas de mémoire. Gardez la carte ajoutée face cachée ; son nom imprimé, sa couleur et ses effets ne peuvent pas être référencés.",
  "learn.lesson.drill-training.step.end-turn":
    "Cliquez sur Fin du tour pour que Greymon soit prêt lors de votre prochain tour.",
  "learn.lesson.drill-training.step.end-turn.hint": "Le bot passera sans attaquer dans cet exercice.",
  "learn.lesson.drill-training.step.your-turn":
    "Attendez votre phase principale. Greymon se réactive et conserve la source ajoutée par Training.",
  "learn.lesson.drill-training.step.your-turn.hint":
    "La source de Training reste dans la pile pendant les tours ; ce n'est pas un bonus DP temporaire.",
  "learn.lesson.drill-training.step.battle":
    "Attaquez le joueur avec Greymon. Acceptez son effet [When Attacking] pour placer une autre carte du deck face cachée et gagner des DP. Le bot bloquera avec Grizzlymon.",
  "learn.lesson.drill-training.step.battle.hint":
    "Deux sources face cachée donnent +2000 DP, donc 7000 battent 6000. Sans le Training précédent, une seule source donnerait 6000 DP et les deux Digimon perdraient.",
  "learn.lesson.drill-training.step.win": "Attaquez le joueur avec Dracomon pour gagner une fois le bloqueur supprimé.",
  "learn.lesson.drill-training.step.win.hint":
    "Gardez Dracomon pour l'attaque finale. Training a construit la source supplémentaire qui a permis à Greymon de dégager la défense.",
  "learn.lesson.drill-decoy.title": "Decoy : sauvegarder un coéquipier",
  "learn.lesson.drill-decoy.summary": "Sacrifiez Machmon pour protéger BigMamemon du Gaia Force du bot.",
  "learn.lesson.drill-decoy.goal1": "Quel Digimon Decoy peut protéger",
  "learn.lesson.drill-decoy.goal2": "Payez avec le détenteur Decoy, puis contre-attaquez",
  "learn.lesson.drill-decoy.done": "Machmon a payé pour Decoy, BigMamemon a survécu et le Digimon sauvé a gagné.",
  "learn.lesson.drill-decoy.step.intro":
    "Decoy (Noir) permet à Machmon de se supprimer lorsqu'un autre de vos Digimon noir serait supprimé par un effet opposé. Le bot est sur le point de cibler votre seul autre Digimon, BigMamemon, avec Gaia Force.",
  "learn.lesson.drill-decoy.step.intro.hint":
    "Règle 16-18. Le mot-clé protège un autre Digimon correspondant ; Machmon ne peut pas l'utiliser pour se sauvegarder.",
  "learn.lesson.drill-decoy.step.react":
    "Lorsque l'offre Decoy apparaît, acceptez la protection de Machmon. Si un choix de protection s'affiche, choisissez le Decoy de Machmon.",
  "learn.lesson.drill-decoy.step.react.hint":
    "Machmon va à la défausse en guise de paiement. BigMamemon reste en combat au lieu d'être supprimé.",
  "learn.lesson.drill-decoy.step.your-turn":
    "Attendez que le bot termine son tour. Votre BigMamemon survivant sera prêt à attaquer.",
  "learn.lesson.drill-decoy.step.your-turn.hint":
    "Le Agumon opposé n'est qu'une source de couleur pour Gaia Force ; ce bot scripté va maintenant réussir.",
  "learn.lesson.drill-decoy.step.attack-player":
    "Cliquez sur BigMamemon, choisissez Attaque et ciblez la pile de sécurité vide de l'adversaire pour gagner.",
  "learn.lesson.drill-decoy.step.attack-player.hint": "Il s’agit du même BigMamemon que celui protégé par Decoy.",
  "learn.lesson.drill-armor-purge.title": "Armor Purge : jeter la carte supérieure",
  "learn.lesson.drill-armor-purge.summary":
    "Gardez Gabumon en jeu en éliminant Quetzalmon au lieu de perdre tout le Digimon.",
  "learn.lesson.drill-armor-purge.goal1": "Supprimez la carte du dessus pour empêcher sa suppression.",
  "learn.lesson.drill-armor-purge.goal2": "Attaque avec le Digimon laissé en dessous",
  "learn.lesson.drill-armor-purge.done":
    "Quetzalmon a été purgé, Gabumon a survécu à la suppression et Gabumon a gagné.",
  "learn.lesson.drill-armor-purge.step.intro":
    "Quetzalmon contient Armor Purge et Gabumon en dessous. Lorsque Gaia Force la supprime, Armor Purge peut supprimer uniquement la carte du dessus pour empêcher cette suppression.",
  "learn.lesson.drill-armor-purge.step.intro.hint":
    "Règle 16-19. Cela détruit la carte d'armure ; cela ne supprime pas les deux cartes de la pile.",
  "learn.lesson.drill-armor-purge.step.react": "Acceptez Armor Purge lorsque le Gaia Force du bot menace Quetzalmon.",
  "learn.lesson.drill-armor-purge.step.react.hint":
    "Quetzalmon va à la défausse. Le Gabumon exposé reste le même Digimon sur le terrain.",
  "learn.lesson.drill-armor-purge.step.your-turn":
    "Attendez votre phase principale. Gabumon a survécu et pourra attaquer.",
  "learn.lesson.drill-armor-purge.step.your-turn.hint":
    "Armor Purge a empêché cette suppression ; il n'accorde pas de protection permanente contre les effets ultérieurs.",
  "learn.lesson.drill-armor-purge.step.attack-player":
    "Cliquez sur Gabumon, choisissez Attaque et ciblez la pile de sécurité vide de l'adversaire.",
  "learn.lesson.drill-armor-purge.step.attack-player.hint":
    "La carte survivante en dessous fournit votre attaque gagnante.",
  "learn.lesson.drill-save.title": "Save : conserver une ressource sous un Tamer",
  "learn.lesson.drill-save.summary":
    "Save Shoutmon, puis réutilisez cette carte exacte pour créer un Digimon Rush gagnant.",
  "learn.lesson.drill-save.goal1": "Placer la carte supprimée sous votre Tamer avec Save",
  "learn.lesson.drill-save.goal2": "Réutiliser une carte sauvée comme matériau DigiXros",
  "learn.lesson.drill-save.done":
    "Le Shoutmon sauvé est devenu la source de King Version et lui a donné le Rush nécessaire pour gagner.",
  "learn.lesson.drill-save.step.intro":
    "Gaia Force va supprimer Shoutmon. Son effet On Deletion avec Save peut placer cette carte sous Taiki au lieu de la laisser dans la défausse. Shoutmon (King Version), dans votre main, pourra l’utiliser pour DigiXros.",
  "learn.lesson.drill-save.step.intro.hint":
    "Règle 16-20. Save préserve la carte en tant que ressource ; cela n’empêche pas la suppression de Shoutmon.",
  "learn.lesson.drill-save.step.react":
    "Résolvez l’effet On Deletion de Shoutmon et acceptez Save. Choisissez Taiki Kudo comme Tamer recevant la carte si nécessaire.",
  "learn.lesson.drill-save.step.react.hint":
    "Shoutmon devrait désormais se trouver sous Taiki, sans aucun Digimon dans votre zone de combat.",
  "learn.lesson.drill-save.step.your-turn":
    "Attendez votre phase principale. Vous disposerez de 3 mémoires pour réutiliser le Shoutmon sauvé.",
  "learn.lesson.drill-save.step.your-turn.hint":
    "Taiki peut être suspendu pour permettre à un DigiXros d'utiliser les cartes situées sous vos Tamers.",
  "learn.lesson.drill-save.step.reuse":
    "Choisissez Shoutmon (King Version) dans votre main, puis DigiXros. Sélectionnez Taiki comme Tamer à suspendre et le Shoutmon sauvé sous lui comme matériau, puis confirmez.",
  "learn.lesson.drill-save.step.reuse.hint":
    "Un matériau réduit le coût de 5 à 3. L'effet hérité de Shoutmon accorde Rush à ce Digimon avec Shoutmon dans son nom.",
  "learn.lesson.drill-save.step.attack-player":
    "Attaquez la pile de sécurité vide de l'adversaire avec Shoutmon (King Version).",
  "learn.lesson.drill-save.step.attack-player.hint":
    "Sans la source sauvée, ce Digimon nouvellement joué n'aurait pas hérité du Rush nécessaire pour attaquer maintenant.",
  "learn.lesson.drill-material-save.title": "Material Save : sauver les sources",
  "learn.lesson.drill-material-save.summary":
    "Save les deux matériaux DigiXros, puis reconstruisez MetalGreymon pour une attaque Rush gagnante.",
  "learn.lesson.drill-material-save.goal1": "Récupérez les matériaux spécifiés à partir d'une pile supprimée",
  "learn.lesson.drill-material-save.goal2": "Payez moins en réutilisant les deux cartes récupérées",
  "learn.lesson.drill-material-save.done":
    "Les deux matériaux sauvés ont reconstruit MetalGreymon pour 3 mémoires et son attaque Rush a gagné.",
  "learn.lesson.drill-material-save.step.intro":
    "MetalGreymon contient Greymon et MailBirdramon en dessous. Gaia Force est sur le point de le supprimer. Material Save 2 peut placer les matériaux DigiXros spécifiés sous Kiriha.",
  "learn.lesson.drill-material-save.step.intro.hint":
    "Règle 16-21. Cette capacité sauve les sources éligibles, pas le MetalGreymon supprimé lui-même.",
  "learn.lesson.drill-material-save.step.react":
    "Acceptez Material Save 2. Choisissez Greymon et MailBirdramon et placez-les sous Kiriha Aonuma lorsque vous y êtes invité.",
  "learn.lesson.drill-material-save.step.react.hint":
    "Utilisez les deux sources éligibles. MetalGreymon va à la défausse tandis que ses matériaux survivent sous Kiriha.",
  "learn.lesson.drill-material-save.step.your-turn":
    "Attendez votre phase principale. Vous avez un MetalGreymon de remplacement en main et 3 mémoires.",
  "learn.lesson.drill-material-save.step.your-turn.hint":
    "Kiriha peut se suspendre pour autoriser l’utilisation des cartes sous vos Tamers comme matériaux de DigiXros.",
  "learn.lesson.drill-material-save.step.reuse":
    "Choisissez MetalGreymon dans votre main, puis DigiXros. Sélectionnez Kiriha comme Tamer à suspendre et les deux matériaux sauvés sous lui, puis confirmez. Résolvez les choix de son effet On Play.",
  "learn.lesson.drill-material-save.step.reuse.hint":
    "Deux matériaux réduisent de 7 à 3 la mémoire. Son On Play accorde Rush, afin que le Digimon reconstruit puisse attaquer immédiatement.",
  "learn.lesson.drill-material-save.step.attack-player":
    "Attaquez la pile de sécurité vide de l'adversaire avec votre MetalGreymon reconstruit.",
  "learn.lesson.drill-material-save.step.attack-player.hint":
    "Les deux cartes que vous avez récupérées ont rendu cela abordable. Rush permet à ce nouveau Digimon de terminer le jeu.",
  "learn.lesson.drill-evade.title": "Evade : suspendre pour survivre",
  "learn.lesson.drill-evade.summary":
    "Utilisez Evade contre Gaia Force, puis réactivez Syakomon et gagnez à votre tour.",
  "learn.lesson.drill-evade.goal1": "Payez en suspendant le Digimon menacé",
  "learn.lesson.drill-evade.goal2": "Gardez votre attaquant en vous opposant au retrait",
  "learn.lesson.drill-evade.done":
    "Syakomon s’est suspendu pour éviter la suppression, puis s’est réactivé et a gagné.",
  "learn.lesson.drill-evade.step.intro":
    "Syakomon possède Evade. Lorsque Gaia Force est sur le point de le supprimer, vous pouvez suspendre Syakomon pour empêcher cette suppression. Il doit pouvoir se suspendre pour payer ce coût.",
  "learn.lesson.drill-evade.step.intro.hint":
    "Règle 16-22. Syakomon n'est actuellement pas suspendu et est votre seul attaquant.",
  "learn.lesson.drill-evade.step.react":
    "Lorsque l'invite Evade apparaît, acceptez-la. Syakomon suspend et survit à Gaia Force.",
  "learn.lesson.drill-evade.step.react.hint":
    "Un Digimon suspendu ne pouvait plus payer cette condition. Il s’agit d’une prévention de cette suppression, et non d’une immunité.",
  "learn.lesson.drill-evade.step.your-turn":
    "Attendez que le bot passe. Syakomon se réactive pendant votre prochaine phase de réactivation.",
  "learn.lesson.drill-evade.step.your-turn.hint":
    "Gaia Force est désormais dans la défausse adverse et Syakomon est toujours sur le terrain.",
  "learn.lesson.drill-evade.step.attack-player":
    "Cliquez sur Syakomon, choisissez Attaque et ciblez la pile de sécurité vide de l'adversaire.",
  "learn.lesson.drill-evade.step.attack-player.hint":
    "Le Digimon qui a échappé à la suppression est votre attaquant gagnant.",
  "learn.lesson.drill-fortitude.title": "Fortitude : retour après suppression",
  "learn.lesson.drill-fortitude.summary": "Rejouez Aquilamon après Gaia Force et gagnez avec sa nouvelle vie.",
  "learn.lesson.drill-fortitude.goal1": "Fortitude nécessite une source lors de la suppression",
  "learn.lesson.drill-fortitude.goal2": "Un Digimon rejoué est un nouveau Digimon",
  "learn.lesson.drill-fortitude.done": "Aquilamon est revenu sans sa source et a gagné lors de votre tour suivant.",
  "learn.lesson.drill-fortitude.step.intro":
    "Aquilamon possède Fortitude et Kunemon en dessous. Lorsqu’Aquilamon est supprimé alors qu’il possède une source, Fortitude le joue à nouveau sans payer son coût.",
  "learn.lesson.drill-fortitude.step.intro.hint":
    "Règle 16-27. Cela n'empêche pas la suppression. Le Digimon rejoué est neuf et ses anciennes sources restent à la défausse.",
  "learn.lesson.drill-fortitude.step.react":
    "Laissez Gaia Force supprimer Aquilamon. Résolvez son déclencheur Fortitude ; confirmez l’effet obligatoire si le panneau de déclenchement le demande.",
  "learn.lesson.drill-fortitude.step.react.hint":
    "Aquilamon revient sans source et constitue un nouveau Digimon sur le terrain. Kunemon reste dans la défausse.",
  "learn.lesson.drill-fortitude.step.your-turn":
    "Attendez votre tour. Aquilamon est revenu pendant le tour du bot et pourra donc attaquer pendant le vôtre.",
  "learn.lesson.drill-fortitude.step.your-turn.hint":
    "Sans source, une suppression ultérieure ne déclencherait pas à nouveau ce Fortitude.",
  "learn.lesson.drill-fortitude.step.attack-player":
    "Attaquez la pile de sécurité vide de l'adversaire avec le Aquilamon rejoué.",
  "learn.lesson.drill-fortitude.step.attack-player.hint":
    "Vous avez gagné avec la carte Fortitude ramenée, pas le permanent d'origine.",
  "learn.lesson.drill-partition.title": "Partition : divisé en deux Digimon",
  "learn.lesson.drill-partition.summary": "Transformez une suppression adverse en deux Digimon de niveau 4 jouables.",
  "learn.lesson.drill-partition.goal1": "Les deux sources spécifiées sont requises",
  "learn.lesson.drill-partition.goal2": "Jouez les deux parties avant que la carte du dessus ne parte",
  "learn.lesson.drill-partition.done": "Paildramon divisé en Ikkakumon et Togemon, et Ikkakumon a gagné.",
  "learn.lesson.drill-partition.step.intro":
    "Paildramon a Partition (bleu Lv.4 et vert Lv.4). Ikkakumon et Togemon répondent aux exigences en dessous. Gaia Force tentera de supprimer Paildramon.",
  "learn.lesson.drill-partition.step.intro.hint":
    "Règle 16-29. Partition fonctionne pour les effets opposés, pas pour la suppression de combat ou pour vos propres effets.",
  "learn.lesson.drill-partition.step.react":
    "Acceptez Partition. Choisissez Ikkakumon bleu et Togemon vert pour les jouer tous les deux sans payer leurs coûts.",
  "learn.lesson.drill-partition.step.react.hint":
    "Vous devez jouer un Digimon de chaque catégorie requise. Paildramon quitte quand même la zone de combat : Partition n’empêche pas sa suppression.",
  "learn.lesson.drill-partition.step.your-turn":
    "Attendez votre phase principale. Les deux cartes sources sont désormais des Digimon distincts.",
  "learn.lesson.drill-partition.step.your-turn.hint":
    "Ils sont entrés pendant le tour de l’adversaire et peuvent attaquer lorsque votre tour arrive.",
  "learn.lesson.drill-partition.step.attack-player":
    "Attaquez la pile de sécurité vide de l'adversaire avec Ikkakumon.",
  "learn.lesson.drill-partition.step.attack-player.hint":
    "Vous pouvez aussi inspecter Togemon : les deux sources spécifiées ont été jouées par la même capacité Partition.",
  "learn.lesson.drill-scapegoat.title": "Scapegoat : sacrifiez un coéquipier",
  "learn.lesson.drill-scapegoat.summary": "Supprimez Agumon pour conserver Bastemon via le Gaia Force du bot.",
  "learn.lesson.drill-scapegoat.goal1": "Choisissez un autre Digimon comme paiement",
  "learn.lesson.drill-scapegoat.goal2": "Empêcher la suppression du Digimon menacé",
  "learn.lesson.drill-scapegoat.done": "Agumon a payé pour Scapegoat et le Bastemon survivant a gagné.",
  "learn.lesson.drill-scapegoat.step.intro":
    "Bastemon a Scapegoat. Lorsqu'il serait supprimé autrement que par vos propres effets, il pourra supprimer un autre de vos Digimon pour empêcher cette suppression. Agumon est disponible pour payer.",
  "learn.lesson.drill-scapegoat.step.intro.hint": "Règle 16-32. Vous sauvez Bastemon en sacrifiant un autre Digimon.",
  "learn.lesson.drill-scapegoat.step.react": "Acceptez Scapegoat et choisissez votre Agumon comme Digimon à supprimer.",
  "learn.lesson.drill-scapegoat.step.react.hint":
    "Agumon va à la défausse et Bastemon reste. Ne refusez pas la protection.",
  "learn.lesson.drill-scapegoat.step.your-turn":
    "Attendez votre tour, une fois que le bot a résolu Gaia Force et passé.",
  "learn.lesson.drill-scapegoat.step.your-turn.hint": "Bastemon reste le même Digimon et pourra attaquer.",
  "learn.lesson.drill-scapegoat.step.attack-player": "Attaquez la pile de sécurité vide de l'adversaire avec Bastemon.",
  "learn.lesson.drill-scapegoat.step.attack-player.hint":
    "Le sacrifice a permis à votre Digimon le plus fort de rester disponible pour gagner.",
  "learn.lesson.drill-decode.title": "Decode : jouer une source avant de quitter le terrain",
  "learn.lesson.drill-decode.summary":
    "Sauvez Sistermon Blanc de la pile lorsque sa forme éveillée est renvoyée en main.",
  "learn.lesson.drill-decode.goal1": "Decode peut répondre à un départ hors combat",
  "learn.lesson.drill-decode.goal2": "Jouer la source spécifiée sans payer",
  "learn.lesson.drill-decode.done": "Sistermon Blanc a quitté la pile via Decode et a effectué l'attaque gagnante.",
  "learn.lesson.drill-decode.step.intro":
    "Sistermon Blanc (Awakened) a Decode (Sistermon Blanc), avec cette carte exactement nommée en dessous. Le Cocytus Breath du bot renverra la carte éveillée dans votre main.",
  "learn.lesson.drill-decode.step.intro.hint":
    "Règle 16-36. Decode peut répondre à ce retour car il ne s'agit pas d'une suppression de combat.",
  "learn.lesson.drill-decode.step.react":
    "Acceptez Decode et choisissez Sistermon Blanc parmi les sources. Résolvez son effet On Play avec Draw 1 si vous y êtes invité.",
  "learn.lesson.drill-decode.step.react.hint":
    "Blanc est joué comme un Digimon séparé. La carte éveillée revient toujours dans votre main ; Decode n’arrête pas ce départ.",
  "learn.lesson.drill-decode.step.your-turn":
    "Attendez votre phase principale. Le Sistermon Blanc décodé est désormais votre seul Digimon.",
  "learn.lesson.drill-decode.step.your-turn.hint":
    "Il a été joué pendant le tour du robot, il peut donc attaquer pendant le vôtre.",
  "learn.lesson.drill-decode.step.attack-player":
    "Attaquez la pile de sécurité vide de l'adversaire avec Sistermon Blanc.",
  "learn.lesson.drill-decode.step.attack-player.hint":
    "Sans Decode, cette source aurait été défaussée lorsque la pile a quitté le terrain.",
  "learn.lesson.drill-fragment.title": "Fragment : payez avec vos sources",
  "learn.lesson.drill-fragment.summary": "Défaussez deux sources pour protéger Giromon de Gaia Force.",
  "learn.lesson.drill-fragment.goal1": "Fragment nécessite le nombre complet de sources indiqué",
  "learn.lesson.drill-fragment.goal2": "Empêcher la suppression en payant exactement deux cartes",
  "learn.lesson.drill-fragment.done": "Giromon a payé Fragment 2 avec les deux sources, a survécu et a gagné.",
  "learn.lesson.drill-fragment.step.intro":
    "Giromon possède Fragment (2), avec Jazamon et Jazardmon en dessous. Lorsque Gaia Force est sur le point de le supprimer, Fragment peut défausser deux de ses sources pour empêcher cette suppression.",
  "learn.lesson.drill-fragment.step.intro.hint":
    "Règle 16-37. Payer une seule source n’est pas suffisant ; Giromon contient exactement les deux éléments nécessaires.",
  "learn.lesson.drill-fragment.step.react":
    "Acceptez Fragment et sélectionnez Jazamon et Jazardmon comme les deux sources à défausser.",
  "learn.lesson.drill-fragment.step.react.hint":
    "Giromon reste en jeu sans sources. Les deux cartes sélectionnées partent à la défausse.",
  "learn.lesson.drill-fragment.step.your-turn": "Attendez votre phase principale après le passage du bot.",
  "learn.lesson.drill-fragment.step.your-turn.hint":
    "Giromon a survécu à cette suppression, mais n'a plus aucune source pour payer à nouveau Fragment.",
  "learn.lesson.drill-fragment.step.attack-player": "Attaquez la pile de sécurité vide de l'adversaire avec Giromon.",
  "learn.lesson.drill-fragment.step.attack-player.hint":
    "Le même Giromon qui a payé Fragment fournit l'attaque gagnante.",
  "learn.lesson.drill-guard.title": "Guard : protection contre un retour",
  "learn.lesson.drill-guard.summary":
    "Sacrifiez Gladimon afin que Cocytus Breath ne puisse pas renvoyer BigMamemon dans la main.",
  "learn.lesson.drill-guard.goal1": "Guard protège un autre Digimon contre le retrait opposé",
  "learn.lesson.drill-guard.goal2": "Un retour en main peut également être évité",
  "learn.lesson.drill-guard.done": "Gladimon a payé Guard pour arrêter le retour, et BigMamemon est resté pour gagner.",
  "learn.lesson.drill-guard.step.intro":
    "Gladimon a Guard. Lorsqu'un autre de vos Digimon quitterait la bataille par un effet adverse, Gladimon pourra se supprimer pour empêcher ce départ. Le bot ciblera BigMamemon avec Cocytus Breath.",
  "learn.lesson.drill-guard.step.intro.hint":
    "Règle 16-45. Contrairement à une protection limitée à la suppression, Guard peut également stopper ce retour en main.",
  "learn.lesson.drill-guard.step.react":
    "Acceptez le Guard de Gladimon lorsque la protection est offerte. Si un ordre de réaction est demandé, choisissez Guard.",
  "learn.lesson.drill-guard.step.react.hint":
    "Gladimon est supprimé à titre de paiement. BigMamemon reste en bataille au lieu d'entrer dans votre main.",
  "learn.lesson.drill-guard.step.your-turn":
    "Attendez votre tour après le passage du bot. Résolvez toute invite Gladimon lors de la suppression si elle apparaît.",
  "learn.lesson.drill-guard.step.your-turn.hint":
    "Le Gabumon du bot est déjà de niveau 3 sans sources, donc Gladimon ne peut pas en retirer une carte supérieure.",
  "learn.lesson.drill-guard.step.attack-player": "Attaquez la pile de sécurité vide de l'adversaire avec BigMamemon.",
  "learn.lesson.drill-guard.step.attack-player.hint": "Guard a gardé votre seul attaquant restant sur le terrain.",
  "learn.lesson.drill-digisorption.title": "Digisorption : suspendre pour économiser de la mémoire",
  "learn.lesson.drill-digisorption.summary":
    "Faites digivolver Pistmon pour 1 mémoire en suspendant Kunemon, puis attaquez avec Pistmon.",
  "learn.lesson.drill-digisorption.goal1": "Payer la suspension exigée par Digisorption",
  "learn.lesson.drill-digisorption.goal2": "Gardez le Digimon en évolution prêt à attaquer",
  "learn.lesson.drill-digisorption.done":
    "Vous avez payé le coût du Digisorption et avez gagné avec le Pistmon non suspendu.",
  "learn.lesson.drill-digisorption.step.intro":
    "Vous disposez d’une seule mémoire. Pistmon a Digisorption -2 : sa digivolution normale coûte 3, mais suspendre un autre Digimon réduit ce montant à 1 et vous permet de conserver votre tour.",
  "learn.lesson.drill-digisorption.step.intro.hint":
    "Suspendez Kunemon plutôt que Lighdramon afin que votre attaquant reste prêt.",
  "learn.lesson.drill-digisorption.step.digivolve":
    "Digivolvez Pistmon sur Lighdramon. Acceptez Digisorption et choisissez Kunemon comme Digimon à suspendre.",
  "learn.lesson.drill-digisorption.step.digivolve.hint":
    "Payez votre 1 mémoire pour atteindre 0 et gardez Pistmon non suspendu. Sans la réduction, payer 3 transmettrait de la mémoire à l'adversaire avant votre attaque.",
  "learn.lesson.drill-digisorption.step.attack-player": "Attaquez le joueur avec Pistmon pour gagner.",
  "learn.lesson.drill-digisorption.step.attack-player.hint":
    "L'adversaire n'a aucune sécurité et Pistmon était déjà en jeu sous le nom de Lighdramon.",
  "learn.lesson.drill-digi-burst.title": "Digi-Burst : dépensez vos sources",
  "learn.lesson.drill-digi-burst.summary": "Défaussez deux sources pour suspendre le bloqueur avant vos attaques.",
  "learn.lesson.drill-digi-burst.goal1": "Activer un effet principal Digi-Burst",
  "learn.lesson.drill-digi-burst.goal2": "Payez avec exactement deux cartes digivolution",
  "learn.lesson.drill-digi-burst.done":
    "HerculesKabuterimon a dépensé deux sources, désactivé le bloqueur et ouvert une attaque gagnante.",
  "learn.lesson.drill-digi-burst.step.intro":
    "HerculesKabuterimon a un effet Main avec Digi-Burst 2. Défausser deux de ses cartes de digivolution permet de suspendre un Digimon adverse.",
  "learn.lesson.drill-digi-burst.step.intro.hint":
    "Monochromon peut bloquer tant qu’il n’est pas suspendu. Suspendez-le d’abord.",
  "learn.lesson.drill-digi-burst.step.burst":
    "Sélectionnez HerculesKabuterimon et activez son effet Digi-Burst. Choisissez Kunemon et Kabuterimon comme sources à défausser, puis Monochromon comme Digimon à suspendre.",
  "learn.lesson.drill-digi-burst.step.burst.hint":
    "Le top HerculesKabuterimon n'est pas une source que vous pouvez dépenser.",
  "learn.lesson.drill-digi-burst.step.attack-security":
    "Attaquez le joueur avec HerculesKabuterimon pour vérifier la dernière carte de sécurité.",
  "learn.lesson.drill-digi-burst.step.attack-security.hint": "Le Monochromon suspendu ne peut pas bloquer.",
  "learn.lesson.drill-digi-burst.step.attack-player": "Attaquez le joueur avec Birdramon pour gagner.",
  "learn.lesson.drill-digi-burst.step.attack-player.hint":
    "Retirer la dernière carte de sécurité ne suffit pas à gagner.",
  "learn.lesson.drill-delay.title": "Delay : utiliser une Option préparée",
  "learn.lesson.drill-delay.summary":
    "Utilisez Reinforcing Memory Boost! pour obtenir la mémoire nécessaire à une attaque Rush gagnante.",
  "learn.lesson.drill-delay.goal1": "Activez Delay après le tour de placement",
  "learn.lesson.drill-delay.goal2": "Transformer une Option conservée en trois mémoire",
  "learn.lesson.drill-delay.done": "Delay a payé pour BushiAgumon, qui a gagné avec Rush.",
  "learn.lesson.drill-delay.step.intro":
    "Reinforcing Memory Boost! a été placé dans la zone de combat lors d'un tour précédent. Son Delay est prêt maintenant. Vous n'avez que 2 mémoires.",
  "learn.lesson.drill-delay.step.intro.hint":
    "Vous ne pouvez pas utiliser Delay au cours du même tour où sa carte est placée.",
  "learn.lesson.drill-delay.step.delay":
    "Sélectionnez Reinforcing Memory Boost! et activez Delay. Défaussez cette carte pour gagner 3 mémoire.",
  "learn.lesson.drill-delay.step.delay.hint": "Votre mémoire passe de 2 à 5.",
  "learn.lesson.drill-delay.step.play-rush": "Jouez BushiAgumon depuis votre main pour 5 mémoires.",
  "learn.lesson.drill-delay.step.play-rush.hint": "Le gain Delay permet de payer en gardant la mémoire à 0.",
  "learn.lesson.drill-delay.step.attack-player": "Attaquez le joueur avec BushiAgumon pour gagner.",
  "learn.lesson.drill-delay.step.attack-player.hint": "Rush permet à ce Digimon nouvellement joué d'attaquer.",
  "learn.lesson.drill-blast-digivolve.title": "Blast Digivolve : évoluer lors d'une attaque",
  "learn.lesson.drill-blast-digivolve.summary":
    "Contrez l'attaque du robot avec WarGreymon, bloquez, puis gagnez le tour suivant.",
  "learn.lesson.drill-blast-digivolve.goal1": "Utiliser le moment Counter pour digivolver gratuitement",
  "learn.lesson.drill-blast-digivolve.goal2": "Obtenir Blocker avant le moment où les blocs sont déclarés",
  "learn.lesson.drill-blast-digivolve.done":
    "Blast Digivolve a créé WarGreymon à temps pour bloquer une attaque mortelle et gagner par la suite.",
  "learn.lesson.drill-blast-digivolve.step.intro":
    "Le bot va attaquer alors que vous avez 0 carte de sécurité. MetalGreymon ne possède pas Blocker, mais WarGreymon dans votre main peut utiliser Blast Digivolve pour devenir votre bloqueur.",
  "learn.lesson.drill-blast-digivolve.step.intro.hint":
    "Le moment Counter précède le moment où les blocs sont déclarés.",
  "learn.lesson.drill-blast-digivolve.step.counter":
    "À l’invite Counter, sélectionnez WarGreymon dans votre main et utilisez Blast Digivolve sur MetalGreymon.",
  "learn.lesson.drill-blast-digivolve.step.counter.hint":
    "Cette digivolution réglementaire ne coûte aucune mémoire et vous fait quand même piocher une carte.",
  "learn.lesson.drill-blast-digivolve.step.block": "Bloquez le Ikkakumon entrant avec votre nouveau WarGreymon.",
  "learn.lesson.drill-blast-digivolve.step.block.hint": "WarGreymon a 11000 DP contre Ikkakumon avec 5000 DP.",
  "learn.lesson.drill-blast-digivolve.step.your-turn":
    "Vous avez survécu. Attendez que le bot passe : votre Digimon se réactivera au début de votre tour.",
  "learn.lesson.drill-blast-digivolve.step.your-turn.hint": "Counter n’a pas commencé votre propre tour.",
  "learn.lesson.drill-blast-digivolve.step.attack-player": "Attaquez le joueur avec WarGreymon pour gagner.",
  "learn.lesson.drill-blast-digivolve.step.attack-player.hint": "Le bot n'a plus de sécurité ni de bloqueur.",
  "learn.lesson.drill-mind-link.title": "Mind Link : transformez un Tamer en source",
  "learn.lesson.drill-mind-link.summary":
    "Utilisez Mind Link pour placer Eiji sous Loogarmon, profitez de l’Alliance obtenue, puis gagnez la partie.",
  "learn.lesson.drill-mind-link.goal1": "Placer un Tamer compatible parmi les cartes de digivolution",
  "learn.lesson.drill-mind-link.goal2": "Utiliser un effet hérité obtenu via Mind Link",
  "learn.lesson.drill-mind-link.done":
    "Eiji est devenu une source, a accordé Alliance et a aidé Loogarmon à effacer les deux cartes de sécurité.",
  "learn.lesson.drill-mind-link.step.intro":
    "Eiji Nagasumi peut Mind Link avec un Digimon Dark Animal ou SoC qui n'a pas de sources Tamer. Loogarmon est éligible.",
  "learn.lesson.drill-mind-link.step.intro.hint":
    "Une fois lié, Eiji accorde Alliance et Blocker grâce à son effet hérité.",
  "learn.lesson.drill-mind-link.step.mind-link":
    "Sélectionnez Eiji et activez son effet principal Mind Link. Choisissez Loogarmon comme destination.",
  "learn.lesson.drill-mind-link.step.mind-link.hint":
    "Eiji se déplace sous Loogarmon ; ce n'est plus un Tamer distinct au combat.",
  "learn.lesson.drill-mind-link.step.alliance":
    "Attaquez le joueur avec Loogarmon. Résolvez ses déclenchements d’attaque dans l’ordre de votre choix. Pour Alliance, acceptez et suspendez Birdramon comme soutien. Vous pouvez refuser l’effet optionnel de Loogarmon qui demande de défausser une carte de votre main, ou défausser 1 carte pour le résoudre. Terminez les deux déclenchements avant de vérifier les 2 cartes de sécurité.",
  "learn.lesson.drill-mind-link.step.alliance.hint":
    "Choisissez Birdramon pour Alliance et laissez Dracomon non suspendu pour l'attaque finale.",
  "learn.lesson.drill-mind-link.step.attack-player": "Attaquez le joueur avec Dracomon pour gagner.",
  "learn.lesson.drill-mind-link.step.attack-player.hint":
    "Dracomon est toujours prêt car Birdramon a payé pour Alliance.",
  "learn.lesson.drill-blast-dna-digivolve.title": "Blast DNA Digivolve : combiner terrain et main",
  "learn.lesson.drill-blast-dna-digivolve.summary":
    "Créez RagnaLoardmon au moment Counter à partir d’un Digimon sur le terrain et d’un matériau dans votre main.",
  "learn.lesson.drill-blast-dna-digivolve.goal1": "Fournir les deux matériaux DNA spécifiés au moment Counter",
  "learn.lesson.drill-blast-dna-digivolve.goal2":
    "Résoudre la suppression réservée à une digivolution DNA avant que l’attaque continue",
  "learn.lesson.drill-blast-dna-digivolve.done":
    "RagnaLoardmon a combiné les deux matériaux gratuitement, a éliminé l'attaquant et a gagné le tour suivant.",
  "learn.lesson.drill-blast-dna-digivolve.step.intro":
    "Le bot attaque alors que vous avez 0 sécurité. Durandamon est au combat et BryweLudramon plus RagnaLoardmon sont dans votre main.",
  "learn.lesson.drill-blast-dna-digivolve.step.intro.hint":
    "Blast DNA Digivolve exige le Digimon spécifié sur le terrain et l’autre carte spécifiée dans votre main.",
  "learn.lesson.drill-blast-dna-digivolve.step.counter":
    "Au moment Counter, utilisez RagnaLoardmon. Choisissez Durandamon dans la zone de combat et BryweLudramon dans votre main pour Blast DNA Digivolve. Résolvez ses effets et choisissez le Plesiomon attaquant pour la suppression.",
  "learn.lesson.drill-blast-dna-digivolve.step.counter.hint":
    "Sa digivolution défausse la dernière carte de sécurité adverse. Son effet réservé à une digivolution DNA supprime ensuite l’attaquant avant qu’il ne puisse vous toucher.",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn":
    "Attendez que le bot passe. Votre nouveau RagnaLoardmon est prêt pour votre tour.",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn.hint":
    "DNA crée un nouveau Digimon et combine les deux matériaux dans ses sources.",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player": "Attaquez le joueur avec RagnaLoardmon pour gagner.",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player.hint":
    "L'attaquant a été supprimé lors du Counter, vous avez donc survécu sans aucune sécurité.",
  "learn.lesson.drill-link.title": "Link + : conserver un lien supplémentaire",
  "learn.lesson.drill-link.summary": "Donnez à Deusmon un deuxième lien sans remplacer le premier.",
  "learn.lesson.drill-link.goal1": "Liez une carte main en payant son coût de liaison",
  "learn.lesson.drill-link.goal2": "Utilisez Link +1 pour conserver deux cartes de liaison",
  "learn.lesson.drill-link.done":
    "Deusmon a conservé les deux liens Navimon, vérifié la sécurité et laissé Birdramon comme attaque gagnante.",
  "learn.lesson.drill-link.step.intro":
    "Un Digimon ne conserve normalement qu'une seule carte de liaison. Deusmon a Link +1, sa limite est donc 2. Il a déjà un Navimon lié.",
  "learn.lesson.drill-link.step.intro.hint":
    "Les cartes de liaison sont placées sur le côté et ne sont pas des sources de digivolution.",
  "learn.lesson.drill-link.step.link":
    "Choisissez Navimon dans votre main, sélectionnez Lien et choisissez Deusmon. Payez son coût de liaison de 1 mémoire.",
  "learn.lesson.drill-link.step.link.hint": "Les deux cartes Navimon restent liées car Deusmon a de la place pour 2.",
  "learn.lesson.drill-link.step.attack-security":
    "Attaquez le joueur avec Deusmon pour vérifier la dernière carte de sécurité.",
  "learn.lesson.drill-link.step.attack-security.hint":
    "Ses bonus de lien DP restent actifs tant que les deux liens sont attachés.",
  "learn.lesson.drill-link.step.attack-player": "Attaquez le joueur avec Birdramon pour gagner.",
  "learn.lesson.drill-link.step.attack-player.hint": "L'attaque finale est distincte des contrôles de sécurité.",
  "learn.lesson.drill-use-req.title": "Use Req. : satisfaire un trait au lieu d'une couleur",
  "learn.lesson.drill-use-req.summary": "Utilisez un e-Pulse blanc alors que votre champ ne fournit que du jaune.",
  "learn.lesson.drill-use-req.goal1": "Lire la condition Use Req. spécifiée",
  "learn.lesson.drill-use-req.goal2": "Payez le coût de l'option en ignorant uniquement les exigences de couleur",
  "learn.lesson.drill-use-req.done":
    "Liollmon a rempli Use Req., e-Pulse a recruté un autre Digimon et votre Liollmon d'origine a gagné.",
  "learn.lesson.drill-use-req.step.intro":
    "e-Pulse est blanc, mais vous n’avez que Liollmon, jaune, dans la zone de combat. Son effet Use Req. accepte une carte BEATBREAK sur votre terrain.",
  "learn.lesson.drill-use-req.step.intro.hint":
    "Liollmon a BEATBREAK, vous pouvez donc ignorer l'exigence de couleur blanche.",
  "learn.lesson.drill-use-req.step.use-option":
    "Utilisez e-Pulse de votre main pour 3 mémoires. Acceptez son effet et jouez l'autre Liollmon de votre main sans payer son coût de jeu.",
  "learn.lesson.drill-use-req.step.use-option.hint":
    "Use Req. renonce à la couleur, et non au coût d'utilisation de 3 mémoires. e-Pulse reste alors au combat.",
  "learn.lesson.drill-use-req.step.attack-player":
    "Attaquez le joueur avec le Liollmon qui était déjà en bataille pour gagner.",
  "learn.lesson.drill-use-req.step.attack-player.hint":
    "Le Liollmon nouvellement joué ne peut pas attaquer ce tour-ci ; choisissez celui d'origine.",
  "learn.lesson.drill-ascension.title": "Ascension : transformez la suppression en sécurité",
  "learn.lesson.drill-ascension.summary":
    "Laissez ScourgeChiropmon devenir la sécurité afin que vous puissiez survivre au bot et gagner par la suite.",
  "learn.lesson.drill-ascension.goal1": "Résoudre Ascension après une suppression de bataille réelle",
  "learn.lesson.drill-ascension.goal2": "Utilisez la sécurité supplémentaire pour survivre à un tour",
  "learn.lesson.drill-ascension.done":
    "ScourgeChiropmon est monté en sécurité, a absorbé l'attaque du robot et a laissé Birdramon gagner.",
  "learn.lesson.drill-ascension.step.intro":
    "Vous disposez de 0 sécurité. Birdramon a été joué ce tour-ci et doit attendre. ScourgeChiropmon a Ascension et peut devenir votre sécurité après suppression.",
  "learn.lesson.drill-ascension.step.intro.hint":
    "Le bot attaquera à son tour, vous avez donc besoin d'une carte de sécurité avant de passer.",
  "learn.lesson.drill-ascension.step.ascend":
    "Attaquez le Plesiomon suspendu avec ScourgeChiropmon. Il perd la bataille. Acceptez Ascension et placez ScourgeChiropmon au-dessus de votre sécurité.",
  "learn.lesson.drill-ascension.step.ascend.hint":
    "ScourgeChiropmon a 8000 DP contre Plesiomon avec 12000 DP. Aucun paiement Tamer n'est disponible pour son autre effet de suppression.",
  "learn.lesson.drill-ascension.step.end-turn": "Votre nouvelle carte de sécurité est prête. Terminez votre tour.",
  "learn.lesson.drill-ascension.step.end-turn.hint":
    "Birdramon ne peut toujours pas attaquer pendant le tour où il a été joué.",
  "learn.lesson.drill-ascension.step.your-turn":
    "Laissez le bot attaquer votre nouvelle carte de sécurité, puis attendez votre tour.",
  "learn.lesson.drill-ascension.step.your-turn.hint": "Sans Ascension, cette attaque vous aurait battu à 0 sécurité.",
  "learn.lesson.drill-ascension.step.attack-player": "Attaquez le joueur avec Birdramon pour gagner.",
  "learn.lesson.drill-ascension.step.attack-player.hint":
    "Birdramon peut attaquer maintenant et le bot n'a aucune sécurité.",
  "learn.lesson.drill-detach.title": "Detach : dépensez un lien pour rester en jeu",
  "learn.lesson.drill-detach.summary": "Empêchez Cocytus Breath en détachant un lien Seven Code correspondant.",
  "learn.lesson.drill-detach.goal1":
    "Utiliser Detach lorsqu’un effet adverse ferait quitter la zone de combat à votre Digimon",
  "learn.lesson.drill-detach.goal2": "Payez avec un lien correspondant plutôt qu'avec une source",
  "learn.lesson.drill-detach.done":
    "Weatherdramon a perdu son lien mais est resté dans la bataille et a gagné à votre tour.",
  "learn.lesson.drill-detach.step.intro":
    "Le bot est sur le point d'utiliser Cocytus Breath pour ramener Weatherdramon dans votre main. Weatherdramon a Detach pour les liens Seven Code.",
  "learn.lesson.drill-detach.step.intro.hint": "Son lien Roleplaymon possède le trait Seven Code requis.",
  "learn.lesson.drill-detach.step.detach":
    "Lorsque l’invite de protection apparaît, acceptez Detach et défaussez le Roleplaymon lié. Weatherdramon reste dans la zone de combat.",
  "learn.lesson.drill-detach.step.detach.hint":
    "Le link est envoyé à la défausse. Weatherdramon perd le bonus de DP et les effets de ce link, mais ne retourne pas dans votre main.",
  "learn.lesson.drill-detach.step.your-turn": "Le bot a dépensé son option. Attendez que ça passe.",
  "learn.lesson.drill-detach.step.your-turn.hint":
    "Detach empêche le départ initial ; il ne joue pas Weatherdramon à nouveau.",
  "learn.lesson.drill-detach.step.attack-player": "Attaquez le joueur avec Weatherdramon pour gagner.",
  "learn.lesson.drill-detach.step.attack-player.hint":
    "Sa présence sur le terrain préservée lui permet d'attaquer pendant votre tour.",
  "learn.lesson.drill-succession.title": "Succession : utiliser l'effet normal d'une carte source",
  "learn.lesson.drill-succession.summary":
    "Utilisez le texte source normal de Ceresmon via Succession pour supprimer un bloqueur lors de l'attaque Palmon.",
  "learn.lesson.drill-succession.goal1": "Lire la source correspondante la plus élevée sélectionnée par Succession",
  "learn.lesson.drill-succession.goal2": "Résoudre un effet normal copié plutôt qu'une boîte héritée",
  "learn.lesson.drill-succession.done":
    "Succession a copié la réaction de suspension normale de Ceresmon, supprimé Monmon et laissé Palmon effacer la sécurité avant que Dracomon ne gagne.",
  "learn.lesson.drill-succession.step.intro":
    "Votre Ceresmon du dessus possède Succession (Ceresmon). La carte Ceresmon en dessous possède un effet normal All Turns : lorsqu’un Digimon se suspend, il donne -3000 DP à un Digimon adverse pour chaque Digimon suspendu à ce moment. Succession obtient cet effet normal.",
  "learn.lesson.drill-succession.step.intro.hint":
    "Ce texte se trouve dans la zone d'effet normale de la source, et non dans sa zone héritée. Monmon n'a que 1000 DP. Le 2000 DP du Palmon bat également le Digimon de sécurité 1000 DP.",
  "learn.lesson.drill-succession.step.copy-effect":
    "Attaquez le joueur avec Palmon. Sa suspension déclenche l’effet obtenu par Ceresmon grâce à Succession. Donnez -3000 DP à Monmon : il est supprimé avant de bloquer. Palmon vérifie ensuite la dernière carte de sécurité et survit.",
  "learn.lesson.drill-succession.step.copy-effect.hint":
    "Résolvez la réaction Ceresmon copiée avant de passer au timing de bloc.",
  "learn.lesson.drill-succession.step.attack-player":
    "Une fois que Palmon a terminé son contrôle de sécurité, attaquez le joueur avec Dracomon pour gagner.",
  "learn.lesson.drill-succession.step.attack-player.hint":
    "La dernière vérification de sécurité ne suffisait pas à gagner. Dracomon effectue l’attaque gagnante distincte.",
  "learn.lesson.practice-game-preparation.title": "De la main d'ouverture à une bataille gagnante",
  "learn.lesson.practice-game-preparation.summary":
    "Commencez à 0 mémoire avec des decks réglementaires, des mains de 5 cartes et 5 cartes de sécurité, puis développez votre Digimon et gagnez.",
  "learn.lesson.practice-game-preparation.goal1":
    "Reconnaître la main initiale, la pile de sécurité, le deck Digi-Œuf et l’exception de pioche au premier tour",
  "learn.lesson.practice-game-preparation.goal2":
    "Développer un Digimon et retirer les 5 cartes de sécurité sur plusieurs tours avant l’attaque finale",
  "learn.lesson.practice-game-preparation.done":
    "Vous avez joué depuis une mise en place normale, en passant par l’élevage, la digivolution, les changements de tour liés à la mémoire et l’attaque finale.",
  "learn.lesson.practice-game-preparation.step.intro":
    "Ce match commence avec des decks de 50 cartes, 5 cartes dans chaque main, 5 cartes de sécurité et 0 mémoire. Vous jouez en premier et ne piochez pas pendant votre première phase de pioche normale. Le bot passe pour vous permettre de pratiquer toute la séquence.",
  "learn.lesson.practice-game-preparation.step.intro.hint":
    "Il reste quarante cartes dans chaque deck principal après en avoir mis de côté cinq pour la main et cinq pour la sécurité. Votre deck Digi-Œuf est séparé.",
  "learn.lesson.practice-game-preparation.step.hatch":
    "Faites éclore Koromon de votre deck Digi-Œuf dans la zone d’élevage vide.",
  "learn.lesson.practice-game-preparation.step.hatch.hint":
    "L'éclosion ne coûte pas de mémoire et ne pioche pas de carte. Cela met fin à l'action d’élevage de ce tour.",
  "learn.lesson.practice-game-preparation.step.rookie":
    "Faites digivolver Koromon en Agumon dans la zone d’élevage. Cette voie coûte 0 mémoire et vous fait piocher 1 carte.",
  "learn.lesson.practice-game-preparation.step.rookie.hint":
    "Utilisez Agumon ST1-03 de votre main et sélectionnez Koromon comme base.",
  "learn.lesson.practice-game-preparation.step.champion":
    "Faites digivolver l’Agumon élevé en Greymon. Payez 2 mémoire ; le tour passe au bot une fois toutes les résolutions terminées.",
  "learn.lesson.practice-game-preparation.step.champion.hint":
    "La digivolution fait aussi piocher dans la zone d’élevage, même lors du premier tour. La mémoire passe de 0 à 2 du côté de l’adversaire.",
  "learn.lesson.practice-game-preparation.step.move":
    "Attendez que le bot passe. Lors de votre prochaine phase d’élevage, déplacez Greymon vers la zone de combat.",
  "learn.lesson.practice-game-preparation.step.move.hint":
    "Bouger, ce n'est pas jouer à un nouveau Digimon. Greymon peut attaquer ce tour-ci après s'être déplacé.",
  "learn.lesson.practice-game-preparation.step.ultimate":
    "Faites digivolver Greymon en Garudamon pour 3 mémoire. L’effet hérité Security Attack +1 de Greymon donnera deux vérifications à Garudamon.",
  "learn.lesson.practice-game-preparation.step.ultimate.hint":
    "L'effet normal d'une carte source est différent de son effet hérité. Lisez la boîte d'effets inférieure de Greymon.",
  "learn.lesson.practice-game-preparation.step.first-checks":
    "Attaquez le joueur avec Garudamon. Il vérifie une à une deux des cinq cartes de sécurité du robot.",
  "learn.lesson.practice-game-preparation.step.first-checks.hint":
    "Le DP du Garudamon est suffisamment élevé pour survivre à ces batailles de sécurité. Le bot aura trois cartes de sécurité.",
  "learn.lesson.practice-game-preparation.step.second-attacker":
    "Jouez Biyomon pour 2 mémoire. Le tour passe au bot ; gardez Biyomon pour l’attaque finale qui vous fera gagner.",
  "learn.lesson.practice-game-preparation.step.second-attacker.hint":
    "Un Digimon nouvellement joué ne peut normalement pas attaquer ce tour-ci. Biyomon sera prêt après le passage du bot.",
  "learn.lesson.practice-game-preparation.step.clear-security":
    "À vos tours, attaquez avec Garudamon et passez lorsqu'il est suspendu. Répétez jusqu'à ce que le bot n'ait aucune sécurité ; gardez Biyomon prêt pour l'attaque finale.",
  "learn.lesson.practice-game-preparation.step.clear-security.hint":
    "Passez la phase d’élevage si aucune action n’est disponible. Garudamon vérifie deux cartes par attaque. Une vérification inutilisée ne devient jamais une attaque directe supplémentaire après la dernière carte de sécurité.",
  "learn.lesson.practice-game-preparation.step.win":
    "Le bot n'a aucune sécurité. Attaquez le joueur avec Biyomon pour gagner le match.",
  "learn.lesson.practice-game-preparation.step.win.hint":
    "Vous avez toujours besoin de cette attaque réussie distincte après avoir vérifié la sécurité. Biyomon a été joué lors d'un tour précédent et peut maintenant attaquer.",
  "learn.lesson.practice-rule-checks.title": "Vérifications des règles : supprimer un Digimon à zéro DP",
  "learn.lesson.practice-rule-checks.summary":
    "Utilisez une Option jaune pour réduire les DP d’un Blocker sous zéro, observez sa suppression par une vérification des règles, puis gagnez avec Salamon.",
  "learn.lesson.practice-rule-checks.goal1":
    "Satisfaire aux exigences de couleur d'une option et résoudre sa réduction DP",
  "learn.lesson.practice-rule-checks.goal2":
    "Distinguer une suppression par vérification des règles d’une suppression directement demandée par un effet",
  "learn.lesson.practice-rule-checks.done":
    "Seven Heavens a réduit le DP de Monochromon ; une vérification des règles l'a supprimé, permettant à Salamon de lancer l'attaque gagnante.",
  "learn.lesson.practice-rule-checks.step.intro":
    "Le bot n'a aucune sécurité, mais Monochromon peut bloquer Salamon. Seven Heavens donne -10000 DP ; les règles suppriment un Digimon de la zone de combat avec zéro DP ou moins.",
  "learn.lesson.practice-rule-checks.step.intro.hint":
    "Salamon fournit du jaune pour les exigences de couleur de l'option. Vous disposez de neuf mémoires et l'option coûte sept.",
  "learn.lesson.practice-rule-checks.step.reduce-dp":
    "Utilisez Seven Heavens depuis votre main et choisissez le Monochromon du bot. Confirmez la cible : elle rejoint la défausse après la résolution de l’effet.",
  "learn.lesson.practice-rule-checks.step.reduce-dp.hint":
    "L'option donne uniquement une réduction DP. La règle 17-1-3-1-1 effectue la suppression lorsque le DP résultant est nul ou inférieur.",
  "learn.lesson.practice-rule-checks.step.win": "Le Blocker a disparu. Attaquez le joueur avec Salamon pour gagner.",
  "learn.lesson.practice-rule-checks.step.win.hint":
    "Salamon était déjà dans la zone de combat avant ce tour. L'option vous laisse deux mémoires, donc le tour reste le vôtre.",
} satisfies Record<keyof typeof newDrillsEn, string>;
