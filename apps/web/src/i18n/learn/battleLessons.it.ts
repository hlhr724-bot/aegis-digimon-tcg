import { buildRulePracticeTranslations } from "@/i18n/learn/buildRulePracticeTranslations";
import { learnIt } from "@/i18n/learn/learn.it";
import type { newDrillsEn } from "@/i18n/learn/newDrills.en";

export const battleLessonsIt = {
  ...buildRulePracticeTranslations({ dictionary: learnIt }),
  "learn.lesson.drill-retaliation.title": "Retaliation: elimina un avversario più forte",
  "learn.lesson.drill-retaliation.summary":
    "Perdi una battaglia con Retaliation per eliminare il Blocker più forte, poi vinci.",
  "learn.lesson.drill-retaliation.goal1": "Come Retaliation elimina il Digimon vincitore della battaglia",
  "learn.lesson.drill-retaliation.goal2": "Perché un piccolo attaccante può eliminare un difensore molto più forte",
  "learn.lesson.drill-retaliation.done":
    "Candlemon ha perso la battaglia, eliminato Monochromon con Retaliation e aperto l'attacco vincente.",
  "learn.lesson.drill-retaliation.step.intro":
    "Candlemon ha 1000 DP e Retaliation. Il bot ha Monochromon sospeso con 5000 DP e Blocker. Perdere questa battaglia può eliminarlo.",
  "learn.lesson.drill-retaliation.step.intro.hint":
    "Retaliation si innesca quando questo Digimon viene eliminato dopo aver perso una battaglia contro un altro Digimon.",
  "learn.lesson.drill-retaliation.step.retaliate":
    "Clicca su Candlemon, scegli Attacca e seleziona Monochromon sospeso. Lascia risolvere la battaglia e Retaliation.",
  "learn.lesson.drill-retaliation.step.retaliate.hint":
    "Candlemon perde per i DP. Retaliation elimina poi Monochromon tramite effetto: non è una seconda battaglia.",
  "learn.lesson.drill-retaliation.step.win":
    "Monochromon è stato rimosso e il bot non ha security. Attacca il giocatore con Birdramon per vincere.",
  "learn.lesson.drill-retaliation.step.win.hint":
    "Conserva Birdramon per l'attacco finale, senza sacrificarlo nella prima battaglia.",
  "learn.lesson.drill-blitz.title": "Blitz: attacca dopo aver superato lo zero",
  "learn.lesson.drill-blitz.summary": "Digievolvi oltre lo zero di memoria e usa Blitz prima che il tuo turno finisca.",
  "learn.lesson.drill-blitz.goal1": "Perché pagare oltre zero consente ancora gli effetti di digievoluzione",
  "learn.lesson.drill-blitz.goal2": "Come Blitz permette un attacco mentre l'avversario ha memoria",
  "learn.lesson.drill-blitz.done": "BetelGammamon ha digievoluto oltre zero e vinto con Blitz.",
  "learn.lesson.drill-blitz.step.intro":
    "Hai 1 memoria e Biyomon in campo. BetelGammamon costa 2 per digievolvere e ha [When Digivolving] Blitz.",
  "learn.lesson.drill-blitz.step.intro.hint":
    "Il bot non ha security. Usa la richiesta di Blitz dopo aver pagato: una nuova azione normale della fase principale arriverebbe troppo tardi.",
  "learn.lesson.drill-blitz.step.digivolve":
    "Digievolvi Biyomon nel BetelGammamon in mano. Il pagamento dà 1 memoria al bot.",
  "learn.lesson.drill-blitz.step.digivolve.hint":
    "La digievoluzione modifica il Digimon esistente e conserva il suo permesso di attaccare.",
  "learn.lesson.drill-blitz.step.blitz-attack":
    "Accetta Blitz. Attacca il giocatore con BetelGammamon per vincere prima del cambio di turno.",
  "learn.lesson.drill-blitz.step.blitz-attack.hint":
    "Blitz consente questo attacco mentre il bot ha memoria. Non concede Rush e non riattiva l'attaccante.",
  "learn.lesson.drill-raid.title": "Raid: sfida il Digimon pronto più forte",
  "learn.lesson.drill-raid.summary": "Reindirizza un attacco verso un Blocker non sospeso con Raid.",
  "learn.lesson.drill-raid.goal1": "Come Raid cambia il bersaglio di un attacco dichiarato",
  "learn.lesson.drill-raid.goal2":
    "Perché il bersaglio deve essere un Digimon avversario non sospeso con i DP più alti",
  "learn.lesson.drill-raid.done":
    "Grizzlymon ha rimosso Monochromon con Raid e Birdramon ha sferrato l'attacco vincente.",
  "learn.lesson.drill-raid.step.intro":
    "Grizzlymon ha Raid e riceve +1000 DP da Agumon sotto di lui. Il bot ha Monochromon non sospeso con 5000 DP.",
  "learn.lesson.drill-raid.step.intro.hint":
    "Normalmente non puoi dichiarare un attacco contro un Digimon non sospeso. Raid cambia il bersaglio dopo la dichiarazione.",
  "learn.lesson.drill-raid.step.raid":
    "Attacca il giocatore con Grizzlymon. Nella selezione di Raid, scegli Monochromon come nuovo bersaglio.",
  "learn.lesson.drill-raid.step.raid.hint":
    "Grizzlymon ha 6000 DP e vince. Monochromon è il bersaglio valido non sospeso con i DP più alti.",
  "learn.lesson.drill-raid.step.win": "Il Blocker è stato rimosso. Attacca il giocatore con Birdramon per vincere.",
  "learn.lesson.drill-raid.step.win.hint":
    "Cambiare bersaglio con Raid non ha prodotto un security check: Birdramon effettua un attacco separato.",
  "learn.lesson.drill-collision.title": "Collision: obbliga il bot a bloccare",
  "learn.lesson.drill-collision.summary":
    "Costringi a difendere un Digimon senza Blocker stampato, poi perfora la security.",
  "learn.lesson.drill-collision.goal1": "Come Collision concede Blocker ai Digimon avversari durante l'attacco",
  "learn.lesson.drill-collision.goal2": "Perché il difensore deve bloccare se può",
  "learn.lesson.drill-collision.done":
    "Proganomon ha costretto Gomamon a bloccare, perforato l'ultima security e Birdramon ha vinto.",
  "learn.lesson.drill-collision.step.intro":
    "Proganomon ha Collision e Piercing. Il bot ha Gomamon, senza Blocker stampato, e 1 carta security.",
  "learn.lesson.drill-collision.step.intro.hint":
    "Collision concede Blocker ai Digimon avversari durante questo attacco e obbliga il bot a bloccare se può.",
  "learn.lesson.drill-collision.step.collision":
    "Attacca il giocatore con Proganomon. Il bot blocca con Gomamon, perde la battaglia e subisce un security check da Piercing.",
  "learn.lesson.drill-collision.step.collision.hint":
    "Il bot non può rifiutare il blocco disponibile. Proganomon ha 7000 DP contro i 3000 DP di Gomamon.",
  "learn.lesson.drill-collision.step.win":
    "Il bot non ha security né difensori. Attacca il giocatore con Birdramon per vincere.",
  "learn.lesson.drill-collision.step.win.hint":
    "Collision ha imposto la battaglia; Piercing ha permesso il security check dopo la vittoria di Proganomon.",
  "learn.lesson.drill-vortex.title": "Vortex: un'ultima battaglia a fine turno",
  "learn.lesson.drill-vortex.summary": "Gioca Galemon e usa Vortex per attaccare un Digimon nello stesso turno.",
  "learn.lesson.drill-vortex.goal1": "Come Vortex genera un attacco a fine turno",
  "learn.lesson.drill-vortex.goal2":
    "Perché Vortex permette attacchi nel turno d'ingresso, ma normalmente solo contro Digimon",
  "learn.lesson.drill-vortex.done":
    "Galemon ha rimosso Monochromon con Vortex nel turno d'ingresso e vinto nel successivo.",
  "learn.lesson.drill-vortex.step.intro":
    "Galemon ha Vortex. Il bot ha Monochromon sospeso e nessuna security. Galemon può rimuovere quel Blocker a fine turno.",
  "learn.lesson.drill-vortex.step.intro.hint":
    "Un Digimon appena giocato normalmente non può attaccare in questo turno. Vortex offre un'eccezione specifica a fine turno.",
  "learn.lesson.drill-vortex.step.play": "Gioca Galemon dalla mano pagando 6 memoria.",
  "learn.lesson.drill-vortex.step.play.hint":
    "La memoria diventa zero. Non tentare un attacco normale: Galemon è appena entrato.",
  "learn.lesson.drill-vortex.step.vortex":
    "Premi Fine turno, accetta Vortex e scegli Monochromon sospeso come bersaglio.",
  "learn.lesson.drill-vortex.step.vortex.hint":
    "Vortex normalmente non consente di scegliere il giocatore. I 6000 DP di Galemon superano i 5000 DP di Monochromon.",
  "learn.lesson.drill-vortex.step.opponent-turn":
    "Lascia terminare la risoluzione di fine turno e iniziare il turno del bot.",
  "learn.lesson.drill-vortex.step.opponent-turn.hint":
    "L'attacco della keyword avviene prima del cambio effettivo di turno. Poi il bot passa.",
  "learn.lesson.drill-vortex.step.your-turn": "Aspetta che il bot passi e inizi la tua prossima fase principale.",
  "learn.lesson.drill-vortex.step.your-turn.hint":
    "Galemon si riattiva all'inizio del tuo turno e non è più un Digimon giocato in questo turno.",
  "learn.lesson.drill-vortex.step.win": "Attacca normalmente il giocatore con Galemon per vincere.",
  "learn.lesson.drill-vortex.step.win.hint":
    "È un normale attacco della fase principale: non usa il vincolo di Vortex di attaccare solo Digimon.",
  "learn.lesson.drill-overclock.title": "Overclock: attacca ancora senza riattivarti",
  "learn.lesson.drill-overclock.summary": "Sacrifica un Puppet per far attaccare ShoeShoemon sospeso a fine turno.",
  "learn.lesson.drill-overclock.goal1": "Come Overclock si paga eliminando un altro Digimon specificato",
  "learn.lesson.drill-overclock.goal2": "Perché un Digimon sospeso può effettuare un attacco senza sospendersi",
  "learn.lesson.drill-overclock.done":
    "ShoeShoemon ha controllato la security, eliminato Shoemon per Overclock e attaccato ancora senza riattivarsi.",
  "learn.lesson.drill-overclock.step.intro":
    "ShoeShoemon ha Overclock per il tratto Puppet. Shoemon è un altro Puppet giocato in questo turno: conservalo come pagamento.",
  "learn.lesson.drill-overclock.step.intro.hint":
    "Overclock attacca un giocatore senza sospendersi, anche se ShoeShoemon è già sospeso.",
  "learn.lesson.drill-overclock.step.clear-security":
    "Attacca il giocatore con ShoeShoemon per rimuovere l'ultima security.",
  "learn.lesson.drill-overclock.step.clear-security.hint":
    "ShoeShoemon resta sospeso dopo l'attacco. Non saltare la prossima richiesta della keyword.",
  "learn.lesson.drill-overclock.step.overclock":
    "Premi Fine turno e accetta Overclock. L'unico Puppet valido, Shoemon, viene eliminato come pagamento. Poi scegli il giocatore come bersaglio per vincere.",
  "learn.lesson.drill-overclock.step.overclock.hint":
    "Paga con Shoemon, non con ShoeShoemon. Dopo il pagamento l'attacco al giocatore è obbligatorio e non richiede di riattivarsi.",
  "learn.lesson.drill-iceclad.title": "Iceclad: vinci con più fonti",
  "learn.lesson.drill-iceclad.summary":
    "Sconfiggi un Digimon da 12000 DP confrontando il numero di carte di digievoluzione.",
  "learn.lesson.drill-iceclad.goal1": "Come Iceclad sostituisce il confronto dei DP in una battaglia tra Digimon",
  "learn.lesson.drill-iceclad.goal2": "Perché le battaglie security confrontano ancora i DP",
  "learn.lesson.drill-iceclad.done":
    "Le due fonti di PolarBearmon hanno superato le zero di WarGreymon nonostante i DP inferiori, e Birdramon ha vinto.",
  "learn.lesson.drill-iceclad.step.intro":
    "PolarBearmon ha 7000 DP, Iceclad e 2 carte di digievoluzione. WarGreymon sospeso ha 12000 DP ma nessuna carta di digievoluzione.",
  "learn.lesson.drill-iceclad.step.intro.hint":
    "Iceclad confronta le fonti anziché i DP nelle battaglie non security. Vince chi ne ha di più; con lo stesso numero perdono entrambi.",
  "learn.lesson.drill-iceclad.step.iceclad":
    "Attacca WarGreymon sospeso con PolarBearmon. Lascia risolvere la battaglia con Iceclad.",
  "learn.lesson.drill-iceclad.step.iceclad.hint":
    "Confronta 2 fonti contro 0, non 7000 DP contro 12000 DP. PolarBearmon vince e sopravvive.",
  "learn.lesson.drill-iceclad.step.win":
    "WarGreymon è stato rimosso e il bot non ha security. Attacca il giocatore con Birdramon per vincere.",
  "learn.lesson.drill-iceclad.step.win.hint":
    "Un Security Digimon combatterebbe ancora usando i DP: il confronto delle fonti di Iceclad non si applica.",
  "learn.lesson.drill-execute.title": "Execute: sacrifica l'attaccante per spezzare la difesa",
  "learn.lesson.drill-execute.summary":
    "Attacca un Blocker non sospeso a fine turno, poi accetta l'eliminazione dell'attaccante.",
  "learn.lesson.drill-execute.goal1": "Come Execute permette di attaccare un Digimon non sospeso a fine turno",
  "learn.lesson.drill-execute.goal2": "Perché l'attaccante viene eliminato alla fine di quell'attacco",
  "learn.lesson.drill-execute.done":
    "Phantomon ha sconfitto Monochromon con Execute ed è stato eliminato; Birdramon ha vinto nel turno successivo.",
  "learn.lesson.drill-execute.step.intro":
    "Phantomon ha Execute e 7000 DP. Monochromon non sospeso del bot ha 5000 DP e bloccherebbe Birdramon.",
  "learn.lesson.drill-execute.step.intro.hint":
    "Execute permette a Phantomon di attaccare a fine turno, anche un Digimon avversario non sospeso. Verrà eliminato alla fine dell'attacco.",
  "learn.lesson.drill-execute.step.execute":
    "Premi Fine turno, accetta Execute e scegli Monochromon. Lascia terminare la battaglia e l'eliminazione di Phantomon.",
  "learn.lesson.drill-execute.step.execute.hint":
    "Non scegliere il giocatore: devi rimuovere il Blocker. L'eliminazione differita di Execute avviene anche se Phantomon vince la battaglia.",
  "learn.lesson.drill-execute.step.opponent-turn":
    "Lascia terminare la risoluzione di fine turno e iniziare il turno del bot.",
  "learn.lesson.drill-execute.step.opponent-turn.hint":
    "L'attacco della keyword avviene prima del cambio effettivo di turno. Poi il bot passa.",
  "learn.lesson.drill-execute.step.your-turn":
    "Aspetta che il bot passi e il tuo prossimo turno raggiunga la fase principale.",
  "learn.lesson.drill-execute.step.your-turn.hint": "Birdramon è ancora pronto e non resta alcun Blocker.",
  "learn.lesson.drill-execute.step.win": "Attacca il giocatore con Birdramon per vincere.",
  "learn.lesson.drill-execute.step.win.hint":
    "Il bot non ha security. Il sacrificio di Phantomon ha rimosso la sua difesa.",
  "learn.lesson.drill-progress.title": "Progress: resisti a un effetto security durante l'attacco",
  "learn.lesson.drill-progress.summary": "Attacca attraverso Cocytus Breath e conserva il Digimon con Progress.",
  "learn.lesson.drill-progress.goal1": "Come Progress protegge l'attaccante dagli effetti avversari",
  "learn.lesson.drill-progress.goal2": "Perché Progress non impedisce ogni sconfitta in battaglia",
  "learn.lesson.drill-progress.done":
    "Dimetromon ha ignorato l'effetto security durante l'attacco e attaccato di nuovo nel turno seguente per vincere.",
  "learn.lesson.drill-progress.step.intro":
    "Dimetromon ha Progress: gli effetti avversari non lo influenzano mentre attacca. L'ultima security del bot è Cocytus Breath.",
  "learn.lesson.drill-progress.step.intro.hint":
    "Cocytus Breath normalmente riporta un Digimon avversario in mano. Progress protegge questo attaccante durante quell'effetto.",
  "learn.lesson.drill-progress.step.progress":
    "Attacca il giocatore con Dimetromon. Osserva Cocytus Breath risolversi senza riportare l'attaccante in mano.",
  "learn.lesson.drill-progress.step.progress.hint":
    "La protezione vale contro gli effetti avversari durante l'attacco. Non impedisce la normale eliminazione in battaglia contro un Security Digimon più forte.",
  "learn.lesson.drill-progress.step.end-turn": "Dimetromon è rimasto in campo. Premi Fine turno.",
  "learn.lesson.drill-progress.step.end-turn.hint": "Il bot non ha Digimon con cui attaccarti.",
  "learn.lesson.drill-progress.step.your-turn": "Aspetta la tua prossima fase principale.",
  "learn.lesson.drill-progress.step.your-turn.hint": "Dimetromon si riattiva all'inizio del tuo turno.",
  "learn.lesson.drill-progress.step.win": "Attacca il giocatore con Dimetromon per vincere.",
  "learn.lesson.drill-progress.step.win.hint": "Senza Progress, il tuo unico attaccante sarebbe tornato in mano.",
  "learn.lesson.drill-engage.title": "Engage: attacca durante la risoluzione di fine turno",
  "learn.lesson.drill-engage.summary": "Mantieni pronto il Digimon e accetta un attacco di Engage dopo aver passato.",
  "learn.lesson.drill-engage.goal1": "Come Engage si innesca alla fine del tuo turno",
  "learn.lesson.drill-engage.goal2": "Perché l'attacco si risolve prima che inizi il turno avversario",
  "learn.lesson.drill-engage.done":
    "WarGrowlmon ha usato Engage per attaccare durante la risoluzione di fine turno e vincere.",
  "learn.lesson.drill-engage.step.intro":
    "WarGrowlmon ha Engage e il bot non ha security. Vincerai con la keyword di fine turno anziché un normale attacco della fase principale.",
  "learn.lesson.drill-engage.step.intro.hint":
    "Engage è facoltativo. L’attacco deve essere consentito dalle regole quando l’effetto si risolve.",
  "learn.lesson.drill-engage.step.keep-ready":
    "Mantieni WarGrowlmon non sospeso per usare Engage. Continua quando vuoi passare.",
  "learn.lesson.drill-engage.step.keep-ready.hint":
    "Engage non riattiva un Digimon e non ignora la normale attesa per attaccare di un Digimon appena giocato.",
  "learn.lesson.drill-engage.step.engage":
    "Premi Fine turno, accetta Engage e scegli il giocatore come bersaglio per vincere.",
  "learn.lesson.drill-engage.step.engage.hint":
    "Passare dà 3 memoria al bot, ma Engage e il suo attacco si risolvono prima che inizi il turno del bot.",
  "learn.lesson.drill-barrier.title": "Barrier: paga security per conservare il Digimon",
  "learn.lesson.drill-barrier.summary":
    "Proteggi Angemon da una sconfitta in battaglia security, poi usalo per vincere.",
  "learn.lesson.drill-barrier.goal1": "Come Barrier impedisce l'eliminazione in battaglia",
  "learn.lesson.drill-barrier.goal2": "Perché pagare una carta security è diverso dal controllarla",
  "learn.lesson.drill-barrier.done":
    "Angemon ha pagato una security per Barrier, è sopravvissuto e ha vinto nel turno seguente.",
  "learn.lesson.drill-barrier.step.intro":
    "Angemon ha 4000 DP e Barrier. L'ultima security del bot è Ikkakumon con 5000 DP, quindi Angemon perderà la battaglia.",
  "learn.lesson.drill-barrier.step.intro.hint":
    "Hai 1 carta security per pagare Barrier ed evitare l'eliminazione in battaglia di Angemon.",
  "learn.lesson.drill-barrier.step.barrier":
    "Attacca il giocatore con Angemon. Alla richiesta di Barrier, accetta di scartare la security in cima per conservarlo.",
  "learn.lesson.drill-barrier.step.barrier.hint":
    "Barrier impedisce questa eliminazione in battaglia. La security scartata è un pagamento e non attiva il suo effetto Security.",
  "learn.lesson.drill-barrier.step.end-turn":
    "Angemon è sopravvissuto ed entrambi i giocatori non hanno security. Premi Fine turno.",
  "learn.lesson.drill-barrier.step.end-turn.hint":
    "Il bot non ha Digimon in campo, quindi qui puoi passare senza rischi.",
  "learn.lesson.drill-barrier.step.your-turn": "Aspetta la tua prossima fase principale.",
  "learn.lesson.drill-barrier.step.your-turn.hint": "Angemon si riattiva all'inizio del tuo turno.",
  "learn.lesson.drill-barrier.step.win": "Attacca il giocatore con Angemon per vincere.",
  "learn.lesson.drill-barrier.step.win.hint":
    "Barrier ha conservato l'unico attaccante necessario per questo colpo finale.",
  "learn.lesson.drill-training.title": "Training: prepara la fonte che vince una battaglia",
  "learn.lesson.drill-training.summary":
    "Allena Greymon affinché il prossimo attacco ottenga i DP necessari contro un Blocker.",
  "learn.lesson.drill-training.goal1":
    "Come Training sospende un Digimon e mette la cima del mazzo coperta sotto di lui",
  "learn.lesson.drill-training.goal2": "Come fonti coperte aggiuntive potenziano gli altri effetti di una carta",
  "learn.lesson.drill-training.done":
    "Greymon ha aggiunto una fonte coperta con Training e un'altra attaccando, battendo il Blocker con 7000 DP. Dracomon ha vinto.",
  "learn.lesson.drill-training.step.intro":
    "Greymon ha Training e 5000 DP. Grizzlymon del bot ha 6000 DP e Blocker. Training può aggiungere la fonte necessaria per vincere quella battaglia.",
  "learn.lesson.drill-training.step.intro.hint":
    "L'effetto d'attacco di Greymon dà +1000 DP per ogni fonte coperta. Una carta coperta aggiunta con Training non fornisce il proprio effetto ereditato stampato.",
  "learn.lesson.drill-training.step.train":
    "Clicca su Greymon e attiva Training. Si sospende e mette la cima del mazzo coperta in fondo alle sue carte di digievoluzione.",
  "learn.lesson.drill-training.step.train.hint":
    "Training non costa memoria. Mantieni la carta coperta: nome, colore ed effetti stampati non possono essere consultati.",
  "learn.lesson.drill-training.step.end-turn": "Premi Fine turno per rendere pronto Greymon nel turno successivo.",
  "learn.lesson.drill-training.step.end-turn.hint": "In questo esercizio il bot passerà senza attaccare.",
  "learn.lesson.drill-training.step.your-turn":
    "Aspetta la fase principale. Greymon si riattiva e conserva la fonte di Training.",
  "learn.lesson.drill-training.step.your-turn.hint":
    "La fonte di Training resta nella pila tra i turni: non è un bonus temporaneo ai DP.",
  "learn.lesson.drill-training.step.battle":
    "Attacca il giocatore con Greymon. Accetta il suo [When Attacking] per aggiungere un'altra carta del mazzo coperta e ottenere DP. Il bot bloccherà con Grizzlymon.",
  "learn.lesson.drill-training.step.battle.hint":
    "Due fonti coperte danno +2000 DP: 7000 batte 6000. Senza Training precedente, una sola fonte darebbe 6000 DP ed entrambi perderebbero.",
  "learn.lesson.drill-training.step.win":
    "Dopo aver rimosso il Blocker, attacca il giocatore con Dracomon per vincere.",
  "learn.lesson.drill-training.step.win.hint":
    "Conserva Dracomon per l'attacco finale. Training ha creato la fonte extra che ha permesso a Greymon di superare la difesa.",
  "learn.lesson.drill-decoy.title": "Decoy: salva un alleato",
  "learn.lesson.drill-decoy.summary": "Sacrifica Machmon per proteggere BigMamemon da Gaia Force del bot.",
  "learn.lesson.drill-decoy.goal1": "Quali Digimon può proteggere Decoy",
  "learn.lesson.drill-decoy.goal2": "Paga con il possessore di Decoy, poi contrattacca",
  "learn.lesson.drill-decoy.done": "Machmon ha pagato Decoy, BigMamemon è sopravvissuto e il Digimon salvato ha vinto.",
  "learn.lesson.drill-decoy.step.intro":
    "Decoy (Black) permette a Machmon di eliminarsi quando un altro tuo Digimon nero starebbe per essere eliminato da un effetto avversario. Il bot sta per usare Gaia Force sul tuo unico altro Digimon, BigMamemon.",
  "learn.lesson.drill-decoy.step.intro.hint":
    "Regola 16-18. Protegge un altro Digimon valido: Machmon non può salvare sé stesso con Decoy.",
  "learn.lesson.drill-decoy.step.react":
    "Quando appare Decoy, accetta la protezione di Machmon. Se devi scegliere una protezione, scegli il suo Decoy.",
  "learn.lesson.drill-decoy.step.react.hint":
    "Machmon va nel trash come pagamento. BigMamemon resta in battaglia anziché essere eliminato.",
  "learn.lesson.drill-decoy.step.your-turn":
    "Aspetta che il bot finisca il turno. BigMamemon è sopravvissuto e sarà pronto ad attaccare.",
  "learn.lesson.drill-decoy.step.your-turn.hint":
    "Agumon avversario fornisce solo il colore per Gaia Force: questo bot guidato ora passerà.",
  "learn.lesson.drill-decoy.step.attack-player":
    "Clicca su BigMamemon, scegli Attacca e indica la security vuota avversaria per vincere.",
  "learn.lesson.drill-decoy.step.attack-player.hint": "È lo stesso BigMamemon protetto da Decoy.",
  "learn.lesson.drill-armor-purge.title": "Armor Purge: rinuncia alla carta in cima",
  "learn.lesson.drill-armor-purge.summary":
    "Scarta Quetzalmon per conservare Gabumon in gioco invece di perdere l'intero Digimon.",
  "learn.lesson.drill-armor-purge.goal1": "Scarta la carta in cima per impedire l'eliminazione",
  "learn.lesson.drill-armor-purge.goal2": "Attacca con il Digimon rimasto sotto",
  "learn.lesson.drill-armor-purge.done":
    "Quetzalmon è stato scartato, Gabumon è sopravvissuto alla rimozione e ha vinto.",
  "learn.lesson.drill-armor-purge.step.intro":
    "Quetzalmon ha Armor Purge e Gabumon sotto. Quando Gaia Force starebbe per eliminarlo, Armor Purge può scartare solo la carta in cima per impedire quell'eliminazione.",
  "learn.lesson.drill-armor-purge.step.intro.hint":
    "Regola 16-19. Scarta l'armatura: non elimina entrambe le carte della pila.",
  "learn.lesson.drill-armor-purge.step.react": "Accetta Armor Purge quando Gaia Force del bot minaccia Quetzalmon.",
  "learn.lesson.drill-armor-purge.step.react.hint":
    "Quetzalmon va nel trash. Gabumon viene esposto e resta lo stesso Digimon in campo.",
  "learn.lesson.drill-armor-purge.step.your-turn":
    "Aspetta la tua fase principale. Gabumon è sopravvissuto e potrà attaccare.",
  "learn.lesson.drill-armor-purge.step.your-turn.hint":
    "Armor Purge ha impedito questa eliminazione: non dà protezione permanente dagli effetti successivi.",
  "learn.lesson.drill-armor-purge.step.attack-player":
    "Clicca su Gabumon, scegli Attacca e indica la security vuota avversaria.",
  "learn.lesson.drill-armor-purge.step.attack-player.hint": "La carta sopravvissuta sotto fornisce l'attacco vincente.",
  "learn.lesson.drill-save.title": "Save: conserva una risorsa sotto un Tamer",
  "learn.lesson.drill-save.summary":
    "Salva Shoutmon e riusa proprio quella carta per creare un Digimon con Rush e vincere.",
  "learn.lesson.drill-save.goal1": "Salva la carta eliminata sotto il tuo Tamer",
  "learn.lesson.drill-save.goal2": "Riusa una carta salvata come materiale DigiXros",
  "learn.lesson.drill-save.done": "Lo Shoutmon salvato è diventato fonte di King Version, dandogli Rush per vincere.",
  "learn.lesson.drill-save.step.intro":
    "Gaia Force eliminerà Shoutmon. Il suo On Deletion Save può metterlo sotto Taiki invece di lasciarlo nel trash. Hai Shoutmon (King Version) in mano per usarlo in DigiXros.",
  "learn.lesson.drill-save.step.intro.hint":
    "Regola 16-20. Save conserva la carta come risorsa: non impedisce l'eliminazione di Shoutmon.",
  "learn.lesson.drill-save.step.react":
    "Risolvi l'On Deletion di Shoutmon e accetta Save. Scegli Taiki Kudo come Tamer destinatario se richiesto.",
  "learn.lesson.drill-save.step.react.hint":
    "Shoutmon dovrebbe essere sotto Taiki, senza Digimon nella tua area di battaglia.",
  "learn.lesson.drill-save.step.your-turn":
    "Aspetta la tua fase principale. Avrai 3 memoria per riusare lo Shoutmon salvato.",
  "learn.lesson.drill-save.step.your-turn.hint":
    "Taiki può sospendersi per permettere a DigiXros di usare carte sotto i tuoi Tamers.",
  "learn.lesson.drill-save.step.reuse":
    "Scegli Shoutmon (King Version) in mano e DigiXros. Seleziona Taiki come Tamer da sospendere e lo Shoutmon salvato sotto di lui come materiale; conferma.",
  "learn.lesson.drill-save.step.reuse.hint":
    "Un materiale riduce il costo da 5 a 3. L'effetto ereditato di Shoutmon concede Rush a questo Digimon con Shoutmon nel nome.",
  "learn.lesson.drill-save.step.attack-player": "Attacca la security vuota avversaria con Shoutmon (King Version).",
  "learn.lesson.drill-save.step.attack-player.hint":
    "Senza la fonte salvata, questo Digimon appena giocato non avrebbe il Rush ereditato necessario per attaccare ora.",
  "learn.lesson.drill-material-save.title": "Material Save: recupera le fonti",
  "learn.lesson.drill-material-save.summary":
    "Salva entrambi i materiali DigiXros e ricrea MetalGreymon per vincere con Rush.",
  "learn.lesson.drill-material-save.goal1": "Salva i materiali specificati da una pila eliminata",
  "learn.lesson.drill-material-save.goal2": "Paga meno riusando entrambe le carte salvate",
  "learn.lesson.drill-material-save.done":
    "I materiali salvati hanno ricreato MetalGreymon per 3 memoria e il suo attacco con Rush ha vinto.",
  "learn.lesson.drill-material-save.step.intro":
    "MetalGreymon ha Greymon e MailBirdramon sotto. Gaia Force sta per eliminarlo. Material Save 2 può mettere questi materiali DigiXros specificati sotto Kiriha.",
  "learn.lesson.drill-material-save.step.intro.hint":
    "Regola 16-21. Salva le fonti valide, non lo stesso MetalGreymon eliminato.",
  "learn.lesson.drill-material-save.step.react":
    "Accetta Material Save 2. Scegli Greymon e MailBirdramon e mettili sotto Kiriha Aonuma quando richiesto.",
  "learn.lesson.drill-material-save.step.react.hint":
    "Usa entrambe le fonti valide. MetalGreymon va nel trash e i suoi materiali sopravvivono sotto Kiriha.",
  "learn.lesson.drill-material-save.step.your-turn":
    "Aspetta la tua fase principale. Hai un altro MetalGreymon in mano e 3 memoria.",
  "learn.lesson.drill-material-save.step.your-turn.hint":
    "Kiriha può sospendersi per permettere materiali sotto i tuoi Tamers durante DigiXros.",
  "learn.lesson.drill-material-save.step.reuse":
    "Scegli MetalGreymon in mano e DigiXros. Seleziona Kiriha da sospendere e i due materiali salvati sotto di lui; conferma e risolvi le scelte On Play.",
  "learn.lesson.drill-material-save.step.reuse.hint":
    "Due materiali riducono il costo da 7 a 3. Il suo On Play concede Rush e permette al Digimon ricreato di attaccare subito.",
  "learn.lesson.drill-material-save.step.attack-player":
    "Attacca la security vuota avversaria con MetalGreymon ricreato.",
  "learn.lesson.drill-material-save.step.attack-player.hint":
    "Le due carte salvate hanno reso accessibile il costo. Rush permette al nuovo Digimon di chiudere la partita.",
  "learn.lesson.drill-evade.title": "Evade: sospenditi per sopravvivere",
  "learn.lesson.drill-evade.summary": "Usa Evade contro Gaia Force, poi riattivati e vinci nel tuo turno.",
  "learn.lesson.drill-evade.goal1": "Paga sospendendo il Digimon minacciato",
  "learn.lesson.drill-evade.goal2": "Conserva l'attaccante contro la rimozione avversaria",
  "learn.lesson.drill-evade.done": "Syakomon si è sospeso per evitare l'eliminazione, poi si è riattivato e ha vinto.",
  "learn.lesson.drill-evade.step.intro":
    "Syakomon ha Evade. Quando Gaia Force starebbe per eliminarlo, puoi sospenderlo per impedirlo. Deve potersi sospendere per pagare.",
  "learn.lesson.drill-evade.step.intro.hint": "Regola 16-22. Syakomon non è sospeso ed è il tuo unico attaccante.",
  "learn.lesson.drill-evade.step.react":
    "Alla richiesta di Evade, accetta. Syakomon si sospende e sopravvive a Gaia Force.",
  "learn.lesson.drill-evade.step.react.hint":
    "Un Digimon sospeso non potrebbe pagare di nuovo questa condizione. Si impedisce questa eliminazione: non è immunità.",
  "learn.lesson.drill-evade.step.your-turn":
    "Aspetta che il bot passi. Syakomon si riattiva nella tua prossima fase di riattivazione.",
  "learn.lesson.drill-evade.step.your-turn.hint": "Gaia Force è nel trash avversario e Syakomon resta in campo.",
  "learn.lesson.drill-evade.step.attack-player":
    "Clicca su Syakomon, scegli Attacca e indica la security vuota avversaria.",
  "learn.lesson.drill-evade.step.attack-player.hint":
    "Il Digimon che ha evitato l'eliminazione è il tuo attaccante vincente.",
  "learn.lesson.drill-fortitude.title": "Fortitude: ritorna dopo l'eliminazione",
  "learn.lesson.drill-fortitude.summary": "Rigioca Aquilamon dopo Gaia Force e vinci con la sua nuova vita.",
  "learn.lesson.drill-fortitude.goal1": "Fortitude richiede una fonte al momento dell'eliminazione",
  "learn.lesson.drill-fortitude.goal2": "Un Digimon rigiocato è un nuovo Digimon",
  "learn.lesson.drill-fortitude.done": "Aquilamon è tornato senza la sua fonte e ha vinto nel tuo turno seguente.",
  "learn.lesson.drill-fortitude.step.intro":
    "Aquilamon ha Fortitude e Kunemon sotto. Quando viene eliminato con una fonte, Fortitude rigioca Aquilamon senza pagarne il costo.",
  "learn.lesson.drill-fortitude.step.intro.hint":
    "Regola 16-27. Non impedisce l'eliminazione. Il Digimon rigiocato è nuovo e le vecchie fonti restano nel trash.",
  "learn.lesson.drill-fortitude.step.react":
    "Lascia che Gaia Force elimini Aquilamon. Risolvi Fortitude; conferma l'effetto obbligatorio se richiesto dal pannello degli inneschi.",
  "learn.lesson.drill-fortitude.step.react.hint":
    "Aquilamon ritorna senza fonti e con una nuova identità in campo. Kunemon resta nel trash.",
  "learn.lesson.drill-fortitude.step.your-turn":
    "Aspetta il tuo turno. Aquilamon è stato rigiocato nel turno del bot e può attaccare nel tuo.",
  "learn.lesson.drill-fortitude.step.your-turn.hint":
    "Senza una fonte, una successiva eliminazione non innescherebbe di nuovo questo Fortitude.",
  "learn.lesson.drill-fortitude.step.attack-player": "Attacca la security vuota avversaria con Aquilamon rigiocato.",
  "learn.lesson.drill-fortitude.step.attack-player.hint":
    "Hai vinto con la carta riportata da Fortitude, non con il permanente originale.",
  "learn.lesson.drill-partition.title": "Partition: dividi in due Digimon",
  "learn.lesson.drill-partition.summary": "Trasforma un'eliminazione avversaria in due Digimon di livello 4 in campo.",
  "learn.lesson.drill-partition.goal1": "Servono entrambe le fonti specificate",
  "learn.lesson.drill-partition.goal2": "Gioca entrambe le parti prima che la carta in cima lasci il campo",
  "learn.lesson.drill-partition.done": "Paildramon si è diviso in Ikkakumon e Togemon, e Ikkakumon ha vinto.",
  "learn.lesson.drill-partition.step.intro":
    "Paildramon ha Partition (livello 4 blu e livello 4 verde). Ikkakumon e Togemon sotto soddisfano i requisiti. Gaia Force proverà a rimuovere Paildramon.",
  "learn.lesson.drill-partition.step.intro.hint":
    "Regola 16-29. Partition funziona contro effetti avversari, non rimozioni in battaglia o i tuoi effetti.",
  "learn.lesson.drill-partition.step.react":
    "Accetta Partition. Scegli Ikkakumon blu e Togemon verde per giocarli entrambi senza pagare.",
  "learn.lesson.drill-partition.step.react.hint":
    "Devi giocare uno per ogni categoria richiesta. Paildramon lascia comunque il campo: Partition non ne impedisce l'eliminazione.",
  "learn.lesson.drill-partition.step.your-turn":
    "Aspetta la tua fase principale. Le due fonti ora sono Digimon separati.",
  "learn.lesson.drill-partition.step.your-turn.hint":
    "Sono entrati nel turno avversario e possono attaccare quando arriva il tuo.",
  "learn.lesson.drill-partition.step.attack-player": "Attacca la security vuota avversaria con Ikkakumon.",
  "learn.lesson.drill-partition.step.attack-player.hint":
    "Puoi anche ispezionare Togemon: entrambe le fonti sono state giocate dallo stesso Partition.",
  "learn.lesson.drill-scapegoat.title": "Scapegoat: sacrifica un alleato",
  "learn.lesson.drill-scapegoat.summary": "Elimina Agumon per far sopravvivere Bastemon a Gaia Force del bot.",
  "learn.lesson.drill-scapegoat.goal1": "Scegli un altro Digimon come pagamento",
  "learn.lesson.drill-scapegoat.goal2": "Impedisci l'eliminazione del Digimon minacciato",
  "learn.lesson.drill-scapegoat.done": "Agumon ha pagato Scapegoat e Bastemon è sopravvissuto per vincere.",
  "learn.lesson.drill-scapegoat.step.intro":
    "Bastemon ha Scapegoat. Se starebbe per essere eliminato non dai tuoi effetti, può eliminare un altro tuo Digimon per impedirlo. Agumon è disponibile come pagamento.",
  "learn.lesson.drill-scapegoat.step.intro.hint":
    "Regola 16-32. Salvi Bastemon sacrificando un Digimon diverso, non Bastemon stesso.",
  "learn.lesson.drill-scapegoat.step.react": "Accetta Scapegoat e scegli il tuo Agumon come Digimon da eliminare.",
  "learn.lesson.drill-scapegoat.step.react.hint": "Agumon va nel trash e Bastemon resta. Non rifiutare la protezione.",
  "learn.lesson.drill-scapegoat.step.your-turn":
    "Aspetta il tuo turno dopo che il bot ha risolto Gaia Force e passato.",
  "learn.lesson.drill-scapegoat.step.your-turn.hint": "Bastemon resta lo stesso Digimon e potrà attaccare.",
  "learn.lesson.drill-scapegoat.step.attack-player": "Attacca la security vuota avversaria con Bastemon.",
  "learn.lesson.drill-scapegoat.step.attack-player.hint":
    "Il sacrificio ha conservato il Digimon più forte per vincere.",
  "learn.lesson.drill-decode.title": "Decode: gioca una fonte prima di uscire",
  "learn.lesson.drill-decode.summary": "Salva Sistermon Blanc dalla pila quando la forma risvegliata torna in mano.",
  "learn.lesson.drill-decode.goal1": "Decode risponde a un'uscita non dovuta a una battaglia",
  "learn.lesson.drill-decode.goal2": "Gioca la fonte specificata senza pagare",
  "learn.lesson.drill-decode.done":
    "Sistermon Blanc è uscita dalla pila tramite Decode e ha sferrato l'attacco vincente.",
  "learn.lesson.drill-decode.step.intro":
    "Sistermon Blanc (Awakened) ha Decode (Sistermon Blanc) e quella carta dal nome esatto sotto. Cocytus Breath del bot riporterà la carta risvegliata in mano.",
  "learn.lesson.drill-decode.step.intro.hint":
    "Regola 16-36. Decode risponde a questo ritorno perché non è una rimozione in battaglia.",
  "learn.lesson.drill-decode.step.react":
    "Accetta Decode e scegli Sistermon Blanc tra le fonti. Risolvi il suo On Play Draw 1 se richiesto.",
  "learn.lesson.drill-decode.step.react.hint":
    "Blanc viene giocata come Digimon separato. La carta risvegliata torna comunque in mano: Decode non impedisce l'uscita.",
  "learn.lesson.drill-decode.step.your-turn":
    "Aspetta la tua fase principale. Sistermon Blanc giocata da Decode ora è il tuo unico Digimon.",
  "learn.lesson.drill-decode.step.your-turn.hint": "È stata giocata durante il turno del bot e può attaccare nel tuo.",
  "learn.lesson.drill-decode.step.attack-player": "Attacca la security vuota avversaria con Sistermon Blanc.",
  "learn.lesson.drill-decode.step.attack-player.hint":
    "Senza Decode, la fonte sarebbe stata scartata quando la pila lasciava il campo.",
  "learn.lesson.drill-fragment.title": "Fragment: paga con le fonti",
  "learn.lesson.drill-fragment.summary": "Scarta due fonti per far sopravvivere Giromon a Gaia Force.",
  "learn.lesson.drill-fragment.goal1": "Fragment richiede il numero completo di fonti indicato",
  "learn.lesson.drill-fragment.goal2": "Impedisci l'eliminazione pagando esattamente due carte",
  "learn.lesson.drill-fragment.done": "Giromon ha pagato Fragment 2 con entrambe le fonti, è sopravvissuto e ha vinto.",
  "learn.lesson.drill-fragment.step.intro":
    "Giromon ha Fragment (2), con Jazamon e Jazardmon sotto. Quando Gaia Force starebbe per eliminarlo, Fragment può scartare due fonti per impedirlo.",
  "learn.lesson.drill-fragment.step.intro.hint":
    "Regola 16-37. Una fonte non basta: Giromon ha esattamente le due necessarie.",
  "learn.lesson.drill-fragment.step.react": "Accetta Fragment e seleziona Jazamon e Jazardmon come fonti da scartare.",
  "learn.lesson.drill-fragment.step.react.hint":
    "Giromon resta in gioco senza fonti. Le due carte scelte vanno nel trash.",
  "learn.lesson.drill-fragment.step.your-turn": "Aspetta la tua fase principale dopo che il bot ha passato.",
  "learn.lesson.drill-fragment.step.your-turn.hint":
    "Giromon è sopravvissuto a questa eliminazione ma non ha più fonti per pagare ancora Fragment.",
  "learn.lesson.drill-fragment.step.attack-player": "Attacca la security vuota avversaria con Giromon.",
  "learn.lesson.drill-fragment.step.attack-player.hint":
    "Lo stesso Giromon che ha pagato Fragment effettua l'attacco vincente.",
  "learn.lesson.drill-guard.title": "Guard: proteggi da un ritorno in mano",
  "learn.lesson.drill-guard.summary": "Sacrifica Gladimon affinché Cocytus Breath non riporti BigMamemon in mano.",
  "learn.lesson.drill-guard.goal1": "Guard protegge un altro Digimon dalla rimozione avversaria",
  "learn.lesson.drill-guard.goal2": "Anche un ritorno in mano può essere impedito",
  "learn.lesson.drill-guard.done":
    "Gladimon ha pagato Guard per impedire il ritorno e BigMamemon è rimasto per vincere.",
  "learn.lesson.drill-guard.step.intro":
    "Gladimon ha Guard. Se un altro tuo Digimon lascerebbe la battaglia per effetto avversario, Gladimon può eliminarsi per impedirlo. Il bot sceglierà BigMamemon per Cocytus Breath.",
  "learn.lesson.drill-guard.step.intro.hint":
    "Regola 16-45. A differenza della sola protezione dall'eliminazione, Guard impedisce anche questo ritorno in mano.",
  "learn.lesson.drill-guard.step.react":
    "Accetta Guard di Gladimon quando viene offerto. Se devi ordinare le reazioni, scegli Guard.",
  "learn.lesson.drill-guard.step.react.hint":
    "Gladimon viene eliminato come pagamento. BigMamemon resta in battaglia invece di entrare nella tua mano.",
  "learn.lesson.drill-guard.step.your-turn":
    "Aspetta il tuo turno dopo il passaggio del bot. Risolvi eventuali richieste On Deletion di Gladimon.",
  "learn.lesson.drill-guard.step.your-turn.hint":
    "Gabumon del bot è già di livello 3 e senza fonti, quindi Gladimon non può rimuoverne la carta in cima.",
  "learn.lesson.drill-guard.step.attack-player": "Attacca la security vuota avversaria con BigMamemon.",
  "learn.lesson.drill-guard.step.attack-player.hint": "Guard ha conservato in campo il tuo unico attaccante rimasto.",
  "learn.lesson.drill-digisorption.title": "Digisorption: sospendi per risparmiare memoria",
  "learn.lesson.drill-digisorption.summary":
    "Digievolvi Pistmon per 1 memoria sospendendo Kunemon, poi attacca con Pistmon.",
  "learn.lesson.drill-digisorption.goal1": "Paga la sospensione richiesta da Digisorption",
  "learn.lesson.drill-digisorption.goal2": "Mantieni pronto ad attaccare il Digimon che evolve",
  "learn.lesson.drill-digisorption.done": "Hai pagato Digisorption e vinto con Pistmon non sospeso.",
  "learn.lesson.drill-digisorption.step.intro":
    "Hai solo 1 memoria. Pistmon ha Digisorption -2: la digievoluzione normale costa 3, ma sospendere un altro Digimon riduce il costo a 1 e mantiene il turno.",
  "learn.lesson.drill-digisorption.step.intro.hint":
    "Sospendi Kunemon anziché Lighdramon per mantenere pronto l'attaccante.",
  "learn.lesson.drill-digisorption.step.digivolve":
    "Digievolvi Lighdramon in Pistmon. Accetta Digisorption e scegli Kunemon da sospendere.",
  "learn.lesson.drill-digisorption.step.digivolve.hint":
    "Paga 1 memoria, arrivando a 0, e conserva Pistmon non sospeso. Senza riduzione, pagare 3 passerebbe la memoria all'avversario prima dell'attacco.",
  "learn.lesson.drill-digisorption.step.attack-player": "Attacca il giocatore con Pistmon per vincere.",
  "learn.lesson.drill-digisorption.step.attack-player.hint":
    "L'avversario non ha security e Pistmon era già in gioco come Lighdramon.",
  "learn.lesson.drill-digi-burst.title": "Digi-Burst: spendi le fonti",
  "learn.lesson.drill-digi-burst.summary": "Scarta due fonti per sospendere il Blocker prima di attaccare.",
  "learn.lesson.drill-digi-burst.goal1": "Attiva un effetto Main Digi-Burst",
  "learn.lesson.drill-digi-burst.goal2": "Paga esattamente due carte di digievoluzione",
  "learn.lesson.drill-digi-burst.done":
    "HerculesKabuterimon ha speso due fonti, disabilitato il Blocker e aperto l'attacco vincente.",
  "learn.lesson.drill-digi-burst.step.intro":
    "HerculesKabuterimon ha Main: Digi-Burst 2. Scartare due fonti permette di sospendere un Digimon avversario.",
  "learn.lesson.drill-digi-burst.step.intro.hint": "Monochromon può bloccare se non è sospeso. Sospendilo prima.",
  "learn.lesson.drill-digi-burst.step.burst":
    "Seleziona HerculesKabuterimon e attiva Digi-Burst. Scegli Kunemon e Kabuterimon come fonti da scartare, poi Monochromon da sospendere.",
  "learn.lesson.drill-digi-burst.step.burst.hint": "HerculesKabuterimon in cima non è una fonte che puoi spendere.",
  "learn.lesson.drill-digi-burst.step.attack-security":
    "Attacca il giocatore con HerculesKabuterimon per controllare l'ultima security.",
  "learn.lesson.drill-digi-burst.step.attack-security.hint": "Monochromon sospeso non può bloccare.",
  "learn.lesson.drill-digi-burst.step.attack-player": "Attacca il giocatore con Birdramon per vincere.",
  "learn.lesson.drill-digi-burst.step.attack-player.hint": "Rimuovere l'ultima security non ha fatto vincere da solo.",
  "learn.lesson.drill-delay.title": "Delay: sfrutta una Option preparata",
  "learn.lesson.drill-delay.summary":
    "Usa Reinforcing Memory Boost! per ottenere la memoria necessaria all'attacco vincente con Rush.",
  "learn.lesson.drill-delay.goal1": "Attiva Delay dopo il turno di posizionamento",
  "learn.lesson.drill-delay.goal2": "Trasforma una Option conservata in tre memoria",
  "learn.lesson.drill-delay.done": "Delay ha pagato BushiAgumon, che ha vinto con Rush.",
  "learn.lesson.drill-delay.step.intro":
    "Reinforcing Memory Boost! è stata messa in battaglia in un turno precedente. Il suo Delay è pronto. Hai solo 2 memoria.",
  "learn.lesson.drill-delay.step.intro.hint":
    "Non puoi usare Delay nello stesso turno in cui la carta viene posizionata.",
  "learn.lesson.drill-delay.step.delay":
    "Seleziona Reinforcing Memory Boost! e attiva Delay. Scartala per ottenere 3 memoria.",
  "learn.lesson.drill-delay.step.delay.hint": "La memoria sale da 2 a 5.",
  "learn.lesson.drill-delay.step.play-rush": "Gioca BushiAgumon dalla mano per 5 memoria.",
  "learn.lesson.drill-delay.step.play-rush.hint": "La memoria di Delay permette di pagare restando a 0.",
  "learn.lesson.drill-delay.step.attack-player": "Attacca il giocatore con BushiAgumon per vincere.",
  "learn.lesson.drill-delay.step.attack-player.hint": "Rush permette a questo Digimon appena giocato di attaccare.",
  "learn.lesson.drill-blast-digivolve.title": "Blast Digivolve: evolvi durante un attacco",
  "learn.lesson.drill-blast-digivolve.summary":
    "Rispondi all'attacco del bot con WarGreymon, blocca e vinci nel turno successivo.",
  "learn.lesson.drill-blast-digivolve.goal1": "Usa il momento Counter per digievolvere gratis",
  "learn.lesson.drill-blast-digivolve.goal2": "Ottieni Blocker prima del momento di blocco",
  "learn.lesson.drill-blast-digivolve.done":
    "Blast Digivolve ha creato WarGreymon in tempo per bloccare un attacco letale e vincere dopo.",
  "learn.lesson.drill-blast-digivolve.step.intro":
    "Il bot attaccherà mentre hai 0 security. MetalGreymon non ha Blocker, ma WarGreymon in mano può usare Blast Digivolve e diventare un bloccante.",
  "learn.lesson.drill-blast-digivolve.step.intro.hint": "Il momento Counter precede quello di blocco.",
  "learn.lesson.drill-blast-digivolve.step.counter":
    "Alla richiesta Counter, seleziona WarGreymon in mano e usa Blast Digivolve su MetalGreymon.",
  "learn.lesson.drill-blast-digivolve.step.counter.hint":
    "La digievoluzione valida non costa memoria e fa comunque pescare una carta.",
  "learn.lesson.drill-blast-digivolve.step.block": "Blocca Ikkakumon attaccante con il nuovo WarGreymon.",
  "learn.lesson.drill-blast-digivolve.step.block.hint": "WarGreymon ha 11000 DP contro i 5000 DP di Ikkakumon.",
  "learn.lesson.drill-blast-digivolve.step.your-turn":
    "Sei sopravvissuto. Aspetta che il bot passi e il tuo Digimon si riattivi.",
  "learn.lesson.drill-blast-digivolve.step.your-turn.hint": "Il Counter non ha iniziato il tuo turno.",
  "learn.lesson.drill-blast-digivolve.step.attack-player": "Attacca il giocatore con WarGreymon per vincere.",
  "learn.lesson.drill-blast-digivolve.step.attack-player.hint": "Il bot non ha più security né bloccanti.",
  "learn.lesson.drill-mind-link.title": "Mind Link: trasforma un Tamer in una fonte",
  "learn.lesson.drill-mind-link.summary": "Collega Eiji a Loogarmon, usa Alliance ricevuto e chiudi la partita.",
  "learn.lesson.drill-mind-link.goal1": "Metti un Tamer valido tra le carte di digievoluzione",
  "learn.lesson.drill-mind-link.goal2": "Usa un effetto ereditato ottenuto con Mind Link",
  "learn.lesson.drill-mind-link.done":
    "Eiji è diventato fonte, ha concesso Alliance e aiutato Loogarmon a rimuovere entrambe le security.",
  "learn.lesson.drill-mind-link.step.intro":
    "Eiji Nagasumi può usare Mind Link con un Digimon Dark Animal o SoC senza Tamer nelle fonti. Loogarmon è valido.",
  "learn.lesson.drill-mind-link.step.intro.hint":
    "Una volta collegato, Eiji concede Alliance e Blocker dal suo riquadro ereditato.",
  "learn.lesson.drill-mind-link.step.mind-link":
    "Seleziona Eiji, attiva il suo Main Mind Link e scegli Loogarmon come destinazione.",
  "learn.lesson.drill-mind-link.step.mind-link.hint":
    "Eiji va sotto Loogarmon e non è più un Tamer separato in battaglia.",
  "learn.lesson.drill-mind-link.step.alliance":
    "Attacca il giocatore con Loogarmon. Risolvi gli inneschi d'attacco in qualsiasi ordine. Per Alliance, accetta e sospendi Birdramon come supporto. Puoi rifiutare l'effetto facoltativo di Loogarmon con costo dalla mano oppure scartare 1 carta per risolverlo. Completa entrambi gli inneschi prima di controllare le 2 security.",
  "learn.lesson.drill-mind-link.step.alliance.hint":
    "Scegli Birdramon per Alliance e conserva Dracomon non sospeso per l'attacco finale.",
  "learn.lesson.drill-mind-link.step.attack-player": "Attacca il giocatore con Dracomon per vincere.",
  "learn.lesson.drill-mind-link.step.attack-player.hint":
    "Dracomon è ancora pronto perché Birdramon ha pagato Alliance.",
  "learn.lesson.drill-blast-dna-digivolve.title": "Blast DNA Digivolve: combina campo e mano",
  "learn.lesson.drill-blast-dna-digivolve.summary":
    "Crea RagnaLoardmon durante Counter con un Digimon in campo e un materiale dalla mano.",
  "learn.lesson.drill-blast-dna-digivolve.goal1": "Fornisci entrambi i materiali DNA specificati durante Counter",
  "learn.lesson.drill-blast-dna-digivolve.goal2": "Risolvi la rimozione esclusiva di DNA prima che l'attacco continui",
  "learn.lesson.drill-blast-dna-digivolve.done":
    "RagnaLoardmon ha combinato gratis entrambi i materiali, rimosso l'attaccante e vinto nel turno seguente.",
  "learn.lesson.drill-blast-dna-digivolve.step.intro":
    "Il bot attacca mentre hai 0 security. Durandamon è in battaglia; BryweLudramon e RagnaLoardmon sono in mano.",
  "learn.lesson.drill-blast-dna-digivolve.step.intro.hint":
    "Blast DNA Digivolve richiede il Digimon specificato in campo e l'altra carta specificata in mano.",
  "learn.lesson.drill-blast-dna-digivolve.step.counter":
    "Durante Counter, usa RagnaLoardmon. Scegli Durandamon e BryweLudramon dalla mano per Blast DNA Digivolve. Risolvi gli effetti e scegli Plesiomon attaccante da eliminare.",
  "learn.lesson.drill-blast-dna-digivolve.step.counter.hint":
    "La digievoluzione scarta l'ultima security avversaria e l'effetto esclusivo di DNA elimina l'attaccante prima che ti colpisca.",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn":
    "Aspetta che il bot passi. Il nuovo RagnaLoardmon è pronto per il tuo turno.",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn.hint":
    "DNA crea un nuovo Digimon e combina entrambi i materiali tra le sue fonti.",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player": "Attacca il giocatore con RagnaLoardmon per vincere.",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player.hint":
    "L'attaccante è stato eliminato durante Counter e sei sopravvissuto senza security.",
  "learn.lesson.drill-link.title": "Link +: conserva un link aggiuntivo",
  "learn.lesson.drill-link.summary": "Dai a Deusmon un secondo link senza sostituire il primo.",
  "learn.lesson.drill-link.goal1": "Collega una carta dalla mano pagando il costo di link",
  "learn.lesson.drill-link.goal2": "Usa Link +1 per conservare due carte di link",
  "learn.lesson.drill-link.done":
    "Deusmon ha conservato entrambi i Navimon, controllato la security e lasciato a Birdramon l'attacco vincente.",
  "learn.lesson.drill-link.step.intro":
    "Un Digimon normalmente conserva solo 1 link. Deusmon ha Link +1, quindi il limite è 2. Ha già un Navimon collegato.",
  "learn.lesson.drill-link.step.intro.hint": "Le carte di link si mettono di lato e non sono fonti di digievoluzione.",
  "learn.lesson.drill-link.step.link":
    "Scegli Navimon in mano, seleziona Link e scegli Deusmon. Paga il costo di link di 1 memoria.",
  "learn.lesson.drill-link.step.link.hint": "Entrambi i Navimon restano collegati perché Deusmon ha spazio per 2.",
  "learn.lesson.drill-link.step.attack-security": "Attacca il giocatore con Deusmon per controllare l'ultima security.",
  "learn.lesson.drill-link.step.attack-security.hint":
    "I bonus ai DP di link restano attivi mentre entrambi sono collegati.",
  "learn.lesson.drill-link.step.attack-player": "Attacca il giocatore con Birdramon per vincere.",
  "learn.lesson.drill-link.step.attack-player.hint": "L'attacco finale è separato dai security check.",
  "learn.lesson.drill-use-req.title": "Use Req.: soddisfa un tratto anziché un colore",
  "learn.lesson.drill-use-req.summary": "Usa e-Pulse bianca anche se il campo fornisce solo giallo.",
  "learn.lesson.drill-use-req.goal1": "Leggi la condizione specificata di Use Req.",
  "learn.lesson.drill-use-req.goal2": "Paga la Option ignorando solo i requisiti di colore",
  "learn.lesson.drill-use-req.done":
    "Liollmon ha soddisfatto Use Req., e-Pulse ha reclutato un altro Digimon e Liollmon originale ha vinto.",
  "learn.lesson.drill-use-req.step.intro":
    "e-Pulse è bianca, ma hai solo Liollmon giallo in battaglia. Il suo Use Req. accetta una carta BEATBREAK sul tuo campo.",
  "learn.lesson.drill-use-req.step.intro.hint":
    "Liollmon ha BEATBREAK, quindi puoi ignorare il requisito del colore bianco.",
  "learn.lesson.drill-use-req.step.use-option":
    "Usa e-Pulse dalla mano per 3 memoria. Accetta il suo effetto e gioca l'altro Liollmon dalla mano senza pagarne il costo di gioco.",
  "learn.lesson.drill-use-req.step.use-option.hint":
    "Use Req. ignora il colore, non il costo d'uso di 3 memoria. Poi e-Pulse resta in battaglia.",
  "learn.lesson.drill-use-req.step.attack-player":
    "Attacca il giocatore con Liollmon che era già in battaglia per vincere.",
  "learn.lesson.drill-use-req.step.attack-player.hint":
    "Liollmon appena giocato non può attaccare in questo turno: scegli quello originale.",
  "learn.lesson.drill-ascension.title": "Ascension: trasforma l'eliminazione in security",
  "learn.lesson.drill-ascension.summary":
    "Trasforma ScourgeChiropmon in security per sopravvivere al bot e vincere dopo.",
  "learn.lesson.drill-ascension.goal1": "Risolvi Ascension dopo una vera eliminazione in battaglia",
  "learn.lesson.drill-ascension.goal2": "Usa la security aggiunta per sopravvivere un turno",
  "learn.lesson.drill-ascension.done":
    "ScourgeChiropmon è asceso a security, ha assorbito l'attacco del bot e permesso a Birdramon di vincere.",
  "learn.lesson.drill-ascension.step.intro":
    "Hai 0 security. Birdramon è stato giocato in questo turno e deve aspettare. ScourgeChiropmon ha Ascension e può diventare security dopo l'eliminazione.",
  "learn.lesson.drill-ascension.step.intro.hint":
    "Il bot attaccherà nel suo turno: serve una carta security prima di passare.",
  "learn.lesson.drill-ascension.step.ascend":
    "Attacca Plesiomon sospeso con ScourgeChiropmon. Perde la battaglia. Accetta Ascension e metti ScourgeChiropmon in cima alla tua security.",
  "learn.lesson.drill-ascension.step.ascend.hint":
    "ScourgeChiropmon ha 8000 DP contro i 12000 DP di Plesiomon. Non c'è un Tamer per pagare l'altro effetto di eliminazione.",
  "learn.lesson.drill-ascension.step.end-turn": "La nuova security è pronta. Termina il turno.",
  "learn.lesson.drill-ascension.step.end-turn.hint":
    "Birdramon non può ancora attaccare nel turno in cui è stato giocato.",
  "learn.lesson.drill-ascension.step.your-turn": "Lascia che il bot attacchi la nuova security e aspetta il tuo turno.",
  "learn.lesson.drill-ascension.step.your-turn.hint":
    "Senza Ascension, quell'attacco ti avrebbe sconfitto con 0 security.",
  "learn.lesson.drill-ascension.step.attack-player": "Attacca il giocatore con Birdramon per vincere.",
  "learn.lesson.drill-ascension.step.attack-player.hint": "Birdramon ora può attaccare e il bot non ha security.",
  "learn.lesson.drill-detach.title": "Detach: spendi un link per restare in gioco",
  "learn.lesson.drill-detach.summary": "Impedisci Cocytus Breath rimuovendo un link valido Seven Code.",
  "learn.lesson.drill-detach.goal1": "Usa Detach quando un effetto avversario rimuoverebbe il Digimon",
  "learn.lesson.drill-detach.goal2": "Paga con un link valido anziché una fonte",
  "learn.lesson.drill-detach.done":
    "Weatherdramon ha perso il link ma è rimasto in battaglia e ha vinto nel tuo turno.",
  "learn.lesson.drill-detach.step.intro":
    "Il bot sta per usare Cocytus Breath per riportare Weatherdramon in mano. Weatherdramon ha Detach per i link Seven Code.",
  "learn.lesson.drill-detach.step.intro.hint": "Roleplaymon collegato ha il tratto Seven Code richiesto.",
  "learn.lesson.drill-detach.step.detach":
    "Alla richiesta di rimozione, accetta Detach e scarta Roleplaymon collegato. Conserva Weatherdramon in battaglia.",
  "learn.lesson.drill-detach.step.detach.hint":
    "Il link va nel trash. Weatherdramon perde i DP di link ma non torna in mano.",
  "learn.lesson.drill-detach.step.your-turn": "Il bot ha speso la sua Option. Aspetta che passi.",
  "learn.lesson.drill-detach.step.your-turn.hint": "Detach impedisce la rimozione: non rigioca Weatherdramon.",
  "learn.lesson.drill-detach.step.attack-player": "Attacca il giocatore con Weatherdramon per vincere.",
  "learn.lesson.drill-detach.step.attack-player.hint":
    "Avendo conservato la presenza in campo, può attaccare nel tuo turno.",
  "learn.lesson.drill-succession.title": "Succession: usa l'effetto normale di una fonte",
  "learn.lesson.drill-succession.summary":
    "Usa il testo normale di Ceresmon come fonte tramite Succession per rimuovere un Blocker durante l'attacco di Palmon.",
  "learn.lesson.drill-succession.goal1": "Leggi la fonte valida più vicina alla cima scelta da Succession",
  "learn.lesson.drill-succession.goal2": "Risolvi un effetto normale copiato anziché il riquadro ereditato",
  "learn.lesson.drill-succession.done":
    "Succession ha copiato la reazione normale di Ceresmon alla sospensione, eliminato Monmon e permesso a Palmon di rimuovere la security prima della vittoria di Dracomon.",
  "learn.lesson.drill-succession.step.intro":
    "Ceresmon in cima ha Succession (Ceresmon). Ceresmon come fonte ha un normale effetto All Turns che dà -3000 DP a un avversario per ogni Digimon sospeso. Succession copia quell'effetto normale.",
  "learn.lesson.drill-succession.step.intro.hint":
    "Il testo è nel riquadro normale della fonte, non in quello ereditato. Monmon ha solo 1000 DP. I 2000 DP di Palmon superano il Security Digimon da 1000 DP.",
  "learn.lesson.drill-succession.step.copy-effect":
    "Attacca il giocatore con Palmon. La sua sospensione innesca l'effetto ottenuto da Ceresmon con Succession. Scegli Monmon per -3000 DP: verrà eliminato prima di bloccare. Palmon controlla l'ultima security e sopravvive.",
  "learn.lesson.drill-succession.step.copy-effect.hint":
    "Risolvi la reazione copiata di Ceresmon prima del momento di blocco.",
  "learn.lesson.drill-succession.step.attack-player":
    "Quando Palmon termina il security check, attacca il giocatore con Dracomon per vincere.",
  "learn.lesson.drill-succession.step.attack-player.hint":
    "L'ultimo security check non ha fatto vincere da solo. Dracomon effettua l'attacco vincente separato.",
  "learn.lesson.practice-game-preparation.title": "Dalla mano iniziale alla battaglia vincente",
  "learn.lesson.practice-game-preparation.summary":
    "Inizia con zero memoria, mazzi validi, mani da cinque carte e cinque security; prepara l'attaccante e vinci.",
  "learn.lesson.practice-game-preparation.goal1":
    "Riconosci mano iniziale, security, mazzo Digi-Egg e l'eccezione alla pesca del primo turno",
  "learn.lesson.practice-game-preparation.goal2":
    "Prepara un Digimon e usa più turni per rimuovere cinque security prima dell'attacco diretto finale",
  "learn.lesson.practice-game-preparation.done":
    "Hai giocato da una normale posizione iniziale, passando per allevamento, digievoluzione, cambi di memoria e attacco finale.",
  "learn.lesson.practice-game-preparation.step.intro":
    "La partita inizia con mazzi da cinquanta carte, cinque carte per mano, cinque security e zero memoria. Inizi tu e salti la prima pesca normale. Il bot passa per farti praticare l'intera sequenza.",
  "learn.lesson.practice-game-preparation.step.intro.hint":
    "Restano quaranta carte in ogni mazzo principale dopo averne separate cinque per la mano e cinque per la security. Il mazzo Digi-Egg è separato.",
  "learn.lesson.practice-game-preparation.step.hatch":
    "Fai schiudere Koromon dal mazzo Digi-Egg nell'area di allevamento vuota.",
  "learn.lesson.practice-game-preparation.step.hatch.hint":
    "Schiudere non costa memoria e non fa pescare. Conclude l'azione di allevamento di questo turno.",
  "learn.lesson.practice-game-preparation.step.rookie":
    "Digievolvi Koromon in Agumon nell'area di allevamento. Questa via costa zero memoria e fa pescare una carta.",
  "learn.lesson.practice-game-preparation.step.rookie.hint":
    "Usa Agumon ST1-03 dalla mano e seleziona Koromon come base.",
  "learn.lesson.practice-game-preparation.step.champion":
    "Digievolvi Agumon allevato in Greymon. Paga due memoria: il turno passa al bot dopo la risoluzione.",
  "learn.lesson.practice-game-preparation.step.champion.hint":
    "Digievolvere fa pescare anche nell'area di allevamento e nel primo turno. La memoria passa da zero a due dell'avversario.",
  "learn.lesson.practice-game-preparation.step.move":
    "Aspetta che il bot passi. Nella tua prossima fase di allevamento, sposta Greymon in battaglia.",
  "learn.lesson.practice-game-preparation.step.move.hint":
    "Spostare non significa giocare un nuovo Digimon. Greymon può attaccare in questo turno dopo essersi spostato.",
  "learn.lesson.practice-game-preparation.step.ultimate":
    "Digievolvi Greymon in Garudamon per tre memoria. Il Security Attack +1 ereditato da Greymon darà due check a Garudamon.",
  "learn.lesson.practice-game-preparation.step.ultimate.hint":
    "L'effetto normale di una fonte è diverso da quello ereditato. Leggi il riquadro inferiore di Greymon.",
  "learn.lesson.practice-game-preparation.step.first-checks":
    "Attacca il giocatore con Garudamon. Controlla due delle cinque security del bot, una alla volta.",
  "learn.lesson.practice-game-preparation.step.first-checks.hint":
    "Garudamon ha DP sufficienti per sopravvivere a queste battaglie security. Al bot resteranno tre security.",
  "learn.lesson.practice-game-preparation.step.second-attacker":
    "Gioca Biyomon per due memoria. Passi il turno al bot: conserva Biyomon per l'attacco vincente.",
  "learn.lesson.practice-game-preparation.step.second-attacker.hint":
    "Un Digimon appena giocato normalmente non può attaccare in quel turno. Biyomon sarà pronto dopo il passaggio del bot.",
  "learn.lesson.practice-game-preparation.step.clear-security":
    "Nei tuoi turni, attacca con Garudamon e passa quando è sospeso. Ripeti finché il bot non ha più security; tieni Biyomon pronto per l'attacco finale.",
  "learn.lesson.practice-game-preparation.step.clear-security.hint":
    "Salta l'allevamento se non ci sono azioni disponibili. Garudamon controlla due carte per attacco. Un check restante non diventa un colpo diretto aggiuntivo dopo l'ultima security.",
  "learn.lesson.practice-game-preparation.step.win":
    "Il bot non ha security. Attacca il giocatore con Biyomon per vincere.",
  "learn.lesson.practice-game-preparation.step.win.hint":
    "Serve ancora questo attacco separato dopo aver rimosso la security. Biyomon è stato giocato in un turno precedente e ora può attaccare.",
  "learn.lesson.practice-rule-checks.title": "Controlli delle regole: elimina un Digimon a zero DP",
  "learn.lesson.practice-rule-checks.summary":
    "Usa una Option gialla per ridurre i DP di un Blocker sotto zero, osserva l'eliminazione per regola e vinci con Salamon.",
  "learn.lesson.practice-rule-checks.goal1":
    "Soddisfa il requisito di colore di una Option e risolvi la riduzione dei DP",
  "learn.lesson.practice-rule-checks.goal2":
    "Distingui l'eliminazione per controllo delle regole da quella ordinata direttamente da un effetto",
  "learn.lesson.practice-rule-checks.done":
    "Seven Heavens ha ridotto i DP di Monochromon; un controllo delle regole lo ha eliminato e permesso l'attacco vincente di Salamon.",
  "learn.lesson.practice-rule-checks.step.intro":
    "Il bot non ha security, ma Monochromon può bloccare Salamon. Seven Heavens dà -10000 DP: le regole eliminano un Digimon in battaglia con zero DP o meno.",
  "learn.lesson.practice-rule-checks.step.intro.hint":
    "Salamon fornisce il giallo per il requisito di colore. Hai nove memoria e la Option costa sette.",
  "learn.lesson.practice-rule-checks.step.reduce-dp":
    "Usa Seven Heavens dalla mano e scegli Monochromon del bot. Conferma il bersaglio e osservalo andare nel trash dopo la risoluzione dell'effetto.",
  "learn.lesson.practice-rule-checks.step.reduce-dp.hint":
    "La Option riduce soltanto i DP. La regola 17-1-3-1-1 esegue l'eliminazione se i DP risultanti sono zero o meno.",
  "learn.lesson.practice-rule-checks.step.win":
    "Il Blocker è stato rimosso. Attacca il giocatore con Salamon per vincere.",
  "learn.lesson.practice-rule-checks.step.win.hint":
    "Salamon era in battaglia prima di questo turno. La Option lascia due memoria, quindi il turno resta tuo.",
} satisfies Record<keyof typeof newDrillsEn, string>;
