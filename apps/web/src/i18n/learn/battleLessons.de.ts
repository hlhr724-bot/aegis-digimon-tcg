import { buildRulePracticeTranslations } from "@/i18n/learn/buildRulePracticeTranslations";
import { learnDe } from "@/i18n/learn/learn.de";
import type { newDrillsEn } from "@/i18n/learn/newDrills.en";

export const battleLessonsDe = {
  ...buildRulePracticeTranslations({ dictionary: learnDe }),
  "learn.lesson.drill-retaliation.title": "Retaliation: einen stärkeren Gegner besiegen",
  "learn.lesson.drill-retaliation.summary":
    "Verlieren Sie mit Retaliation eine Battle, um den stärkeren Blocker zu entfernen und danach zu gewinnen.",
  "learn.lesson.drill-retaliation.goal1": "Wie Retaliation das siegreiche Digimon löscht",
  "learn.lesson.drill-retaliation.goal2": "Warum ein kleiner Angreifer einen viel stärkeren Verteidiger entfernen kann",
  "learn.lesson.drill-retaliation.done":
    "Candlemon verlor die Battle, löschte Monochromon mit Retaliation und ermöglichte den siegreichen Angriff.",
  "learn.lesson.drill-retaliation.step.intro":
    "Candlemon hat 1000 DP und Retaliation. Der Bot hat ein suspendiertes Monochromon mit 5000 DP und Blocker. Durch diese Niederlage können Sie den Blocker entfernen.",
  "learn.lesson.drill-retaliation.step.intro.hint":
    "Retaliation löst aus, wenn dieses Digimon nach einer verlorenen Battle gegen ein anderes Digimon gelöscht wird.",
  "learn.lesson.drill-retaliation.step.retaliate":
    "Klicken Sie auf Candlemon, wählen Sie Angriff und dann das suspendierte Monochromon. Lassen Sie die Battle und Retaliation auflösen.",
  "learn.lesson.drill-retaliation.step.retaliate.hint":
    "Candlemon verliert durch den DP-Vergleich. Retaliation löscht Monochromon anschließend durch einen Effekt, nicht durch eine zweite Battle.",
  "learn.lesson.drill-retaliation.step.win":
    "Monochromon ist entfernt und der Bot hat keine Security. Greifen Sie den Spieler mit Birdramon an, um zu gewinnen.",
  "learn.lesson.drill-retaliation.step.win.hint":
    "Bewahren Sie Birdramon für den letzten Angriff auf, statt es in der ersten Battle zu opfern.",
  "learn.lesson.drill-blitz.title": "Blitz: nach dem Überschreiten von null angreifen",
  "learn.lesson.drill-blitz.summary": "Digivolvieren Sie über null Memory hinaus und nutzen Sie Blitz vor dem Zugende.",
  "learn.lesson.drill-blitz.goal1": "Warum nach einer Zahlung über null die Digivolution-Effekte noch auflösen",
  "learn.lesson.drill-blitz.goal2": "Wie Blitz einen Angriff erlaubt, während der Gegner Memory hat",
  "learn.lesson.drill-blitz.done": "BetelGammamon digivolvierte über null hinaus und gewann mit seinem Blitz-Angriff.",
  "learn.lesson.drill-blitz.step.intro":
    "Sie haben 1 Memory und Biyomon auf dem Feld. BetelGammamon kostet 2 für die Digivolution und hat [When Digivolving] Blitz.",
  "learn.lesson.drill-blitz.step.intro.hint":
    "Der Bot hat keine Security. Nutzen Sie nach der Zahlung die Blitz-Abfrage; für eine neue normale Main-Phase-Aktion wäre es zu spät.",
  "learn.lesson.drill-blitz.step.digivolve":
    "Digivolvieren Sie Biyomon zu BetelGammamon aus Ihrer Hand. Die Zahlung gibt dem Bot 1 Memory.",
  "learn.lesson.drill-blitz.step.digivolve.hint":
    "Die Digivolution verändert das bestehende Digimon und setzt seine Angriffserlaubnis nicht zurück.",
  "learn.lesson.drill-blitz.step.blitz-attack":
    "Nehmen Sie Blitz an. Greifen Sie den Spieler mit BetelGammamon an, um vor dem Zugwechsel zu gewinnen.",
  "learn.lesson.drill-blitz.step.blitz-attack.hint":
    "Blitz erlaubt diesen Angriff, während der Bot Memory hat. Es gewährt weder Rush noch reaktiviert es den Angreifer.",
  "learn.lesson.drill-raid.title": "Raid: das stärkste bereite Digimon herausfordern",
  "learn.lesson.drill-raid.summary": "Lenken Sie einen Angriff mit Raid auf einen nicht suspendierten Blocker um.",
  "learn.lesson.drill-raid.goal1": "Wie Raid das Ziel eines erklärten Angriffs ändert",
  "learn.lesson.drill-raid.goal2":
    "Warum das Ziel ein nicht suspendiertes gegnerisches Digimon mit den höchsten DP sein muss",
  "learn.lesson.drill-raid.done":
    "Grizzlymon entfernte Monochromon mit Raid und Birdramon führte den siegreichen Angriff aus.",
  "learn.lesson.drill-raid.step.intro":
    "Grizzlymon hat Raid und erhält +1000 DP durch Agumon darunter. Der Bot hat ein nicht suspendiertes Monochromon mit 5000 DP.",
  "learn.lesson.drill-raid.step.intro.hint":
    "Normalerweise können Sie keinen Angriff auf ein nicht suspendiertes Digimon erklären. Raid ändert das Ziel nach der Erklärung.",
  "learn.lesson.drill-raid.step.raid":
    "Greifen Sie den Spieler mit Grizzlymon an. Wählen Sie bei Raid Monochromon als neues Ziel.",
  "learn.lesson.drill-raid.step.raid.hint":
    "Grizzlymon hat 6000 DP und gewinnt. Monochromon ist das zulässige nicht suspendierte Ziel mit den höchsten DP.",
  "learn.lesson.drill-raid.step.win":
    "Der Blocker ist entfernt. Greifen Sie den Spieler mit Birdramon an, um zu gewinnen.",
  "learn.lesson.drill-raid.step.win.hint":
    "Der Zielwechsel durch Raid führte zu keinem Security-Check. Birdramon führt einen eigenen Angriff aus.",
  "learn.lesson.drill-collision.title": "Collision: den Bot zum Blocken zwingen",
  "learn.lesson.drill-collision.summary":
    "Zwingen Sie ein Digimon ohne gedruckten Blocker zur Verteidigung und durchdringen Sie danach seine Security.",
  "learn.lesson.drill-collision.goal1": "Wie Collision gegnerischen Digimon während des Angriffs Blocker gibt",
  "learn.lesson.drill-collision.goal2": "Warum der Verteidiger blocken muss, wenn er kann",
  "learn.lesson.drill-collision.done":
    "Proganomon zwang Gomamon zum Blocken, prüfte dank Piercing die letzte Security und Birdramon gewann.",
  "learn.lesson.drill-collision.step.intro":
    "Proganomon hat Collision und Piercing. Der Bot hat Gomamon ohne gedruckten Blocker und 1 Security-Karte.",
  "learn.lesson.drill-collision.step.intro.hint":
    "Collision gibt gegnerischen Digimon während dieses Angriffs Blocker und zwingt den Bot nach Möglichkeit zum Blocken.",
  "learn.lesson.drill-collision.step.collision":
    "Greifen Sie den Spieler mit Proganomon an. Der Bot blockt mit Gomamon, verliert die Battle und erhält einen Security-Check durch Piercing.",
  "learn.lesson.drill-collision.step.collision.hint":
    "Der Bot darf den möglichen Block nicht ablehnen. Proganomon hat 7000 DP gegen Gomamons 3000 DP.",
  "learn.lesson.drill-collision.step.win":
    "Der Bot hat weder Security noch einen Verteidiger. Greifen Sie den Spieler mit Birdramon an, um zu gewinnen.",
  "learn.lesson.drill-collision.step.win.hint":
    "Collision erzwang die Battle; Piercing ermöglichte nach Proganomons Sieg den Security-Check.",
  "learn.lesson.drill-vortex.title": "Vortex: eine letzte Battle am Zugende",
  "learn.lesson.drill-vortex.summary":
    "Spielen Sie Galemon und greifen Sie mit Vortex noch im selben Zug ein Digimon an.",
  "learn.lesson.drill-vortex.goal1": "Wie Vortex einen Angriff am Zugende ermöglicht",
  "learn.lesson.drill-vortex.goal2":
    "Warum Vortex im Zug des Ausspielens angreifen darf, aber normalerweise nur Digimon als Ziel hat",
  "learn.lesson.drill-vortex.done":
    "Galemon entfernte Monochromon mit Vortex im Zug seines Ausspielens und gewann im nächsten Zug.",
  "learn.lesson.drill-vortex.step.intro":
    "Galemon hat Vortex. Der Bot hat ein suspendiertes Monochromon und keine Security. Galemon kann diesen Blocker am Ende Ihres Zuges entfernen.",
  "learn.lesson.drill-vortex.step.intro.hint":
    "Ein frisch ausgespieltes Digimon kann normalerweise in diesem Zug nicht angreifen. Vortex erlaubt eine bestimmte Ausnahme am Zugende.",
  "learn.lesson.drill-vortex.step.play": "Spielen Sie Galemon aus Ihrer Hand für 6 Memory.",
  "learn.lesson.drill-vortex.step.play.hint":
    "Ihre Memory fällt auf null. Versuchen Sie keinen normalen Angriff: Galemon wurde gerade ausgespielt.",
  "learn.lesson.drill-vortex.step.vortex":
    "Klicken Sie auf Zug beenden, nehmen Sie Vortex an und wählen Sie das suspendierte Monochromon als Angriffsziel.",
  "learn.lesson.drill-vortex.step.vortex.hint":
    "Vortex erlaubt normalerweise kein Spielerziel. Galemons 6000 DP schlagen Monochromons 5000 DP.",
  "learn.lesson.drill-vortex.step.opponent-turn":
    "Lassen Sie die Verarbeitung am Zugende abschließen und den Zug des Bots beginnen.",
  "learn.lesson.drill-vortex.step.opponent-turn.hint":
    "Der Keyword-Angriff erfolgt vor dem tatsächlichen Zugwechsel. Danach passt der Bot.",
  "learn.lesson.drill-vortex.step.your-turn": "Warten Sie, bis der Bot passt und Ihre nächste Main Phase beginnt.",
  "learn.lesson.drill-vortex.step.your-turn.hint":
    "Galemon wird zu Beginn Ihres Zuges reaktiviert und wurde nicht mehr in diesem Zug ausgespielt.",
  "learn.lesson.drill-vortex.step.win": "Greifen Sie den Spieler normal mit Galemon an, um zu gewinnen.",
  "learn.lesson.drill-vortex.step.win.hint":
    "Dies ist ein normaler Angriff in der Main Phase. Die Beschränkung von Vortex auf Digimon-Ziele gilt dabei nicht.",
  "learn.lesson.drill-overclock.title": "Overclock: erneut angreifen, ohne zu reaktivieren",
  "learn.lesson.drill-overclock.summary":
    "Opfern Sie ein Puppet, damit das suspendierte ShoeShoemon am Zugende angreift.",
  "learn.lesson.drill-overclock.goal1":
    "Wie Overclock durch das Löschen eines anderen angegebenen Digimon bezahlt wird",
  "learn.lesson.drill-overclock.goal2":
    "Warum ein suspendiertes Digimon einen Angriff ohne Suspendieren ausführen kann",
  "learn.lesson.drill-overclock.done":
    "ShoeShoemon prüfte Security, löschte Shoemon für Overclock und griff ohne Reaktivierung erneut an.",
  "learn.lesson.drill-overclock.step.intro":
    "ShoeShoemon hat Overclock für das Puppet-Merkmal. Shoemon ist ein weiteres Puppet und wurde in diesem Zug ausgespielt. Halten Sie es als Zahlung bereit.",
  "learn.lesson.drill-overclock.step.intro.hint":
    "Overclock greift einen Spieler ohne Suspendieren an, auch wenn ShoeShoemon bereits suspendiert ist.",
  "learn.lesson.drill-overclock.step.clear-security":
    "Greifen Sie den Spieler mit ShoeShoemon an, um die letzte Security-Karte zu entfernen.",
  "learn.lesson.drill-overclock.step.clear-security.hint":
    "ShoeShoemon bleibt nach dem Angriff suspendiert. Überspringen Sie die nächste Keyword-Abfrage nicht.",
  "learn.lesson.drill-overclock.step.overclock":
    "Klicken Sie auf Zug beenden und nehmen Sie Overclock an. Ihr einziges zulässiges Puppet, Shoemon, wird als Zahlung gelöscht. Wählen Sie dann den Spieler als Angriffsziel, um zu gewinnen.",
  "learn.lesson.drill-overclock.step.overclock.hint":
    "Bezahlen Sie mit Shoemon, nicht mit ShoeShoemon. Nach der Zahlung ist der Spielerangriff verpflichtend und erfordert keine Reaktivierung.",
  "learn.lesson.drill-iceclad.title": "Iceclad: mit mehr Quellen gewinnen",
  "learn.lesson.drill-iceclad.summary":
    "Besiegen Sie ein Digimon mit 12000 DP durch den Vergleich der Digivolution-Kartenanzahl.",
  "learn.lesson.drill-iceclad.goal1": "Wie Iceclad in einer Digimon-Battle den DP-Vergleich ersetzt",
  "learn.lesson.drill-iceclad.goal2": "Warum Security-Battles weiterhin DP vergleichen",
  "learn.lesson.drill-iceclad.done":
    "PolarBearmons zwei Quellen schlugen WarGreymons null trotz niedrigerer DP und Birdramon gewann.",
  "learn.lesson.drill-iceclad.step.intro":
    "PolarBearmon hat 7000 DP, Iceclad und 2 Digivolution-Karten. Das suspendierte WarGreymon hat 12000 DP, aber keine Digivolution-Karten.",
  "learn.lesson.drill-iceclad.step.intro.hint":
    "Iceclad vergleicht außerhalb von Security-Battles Quellen statt DP. Mehr Quellen gewinnen; bei gleicher Anzahl verlieren beide.",
  "learn.lesson.drill-iceclad.step.iceclad":
    "Greifen Sie das suspendierte WarGreymon mit PolarBearmon an. Lassen Sie die Iceclad-Battle auflösen.",
  "learn.lesson.drill-iceclad.step.iceclad.hint":
    "Vergleichen Sie 2 Quellen mit 0, nicht 7000 DP mit 12000 DP. PolarBearmon gewinnt und überlebt.",
  "learn.lesson.drill-iceclad.step.win":
    "WarGreymon ist entfernt und der Bot hat keine Security. Greifen Sie den Spieler mit Birdramon an, um zu gewinnen.",
  "learn.lesson.drill-iceclad.step.win.hint":
    "Ein Security-Digimon würde weiterhin mit DP kämpfen; der Quellenvergleich durch Iceclad gilt dafür nicht.",
  "learn.lesson.drill-execute.title": "Execute: den Angreifer opfern, um die Verteidigung zu brechen",
  "learn.lesson.drill-execute.summary":
    "Greifen Sie am Zugende einen nicht suspendierten Blocker an und nehmen Sie danach die Löschung Ihres Angreifers hin.",
  "learn.lesson.drill-execute.goal1":
    "Wie Execute am Zugende einen Angriff auf ein nicht suspendiertes Digimon erlaubt",
  "learn.lesson.drill-execute.goal2": "Warum der Angreifer am Ende dieses Angriffs gelöscht wird",
  "learn.lesson.drill-execute.done":
    "Phantomon besiegte Monochromon mit Execute und wurde gelöscht. Birdramon gewann in Ihrem nächsten Zug.",
  "learn.lesson.drill-execute.step.intro":
    "Phantomon hat Execute und 7000 DP. Das nicht suspendierte Monochromon des Bots hat 5000 DP und würde Birdramon blocken.",
  "learn.lesson.drill-execute.step.intro.hint":
    "Execute erlaubt Phantomon einen Angriff am Zugende, auch auf ein nicht suspendiertes gegnerisches Digimon. Es wird am Angriffsende gelöscht.",
  "learn.lesson.drill-execute.step.execute":
    "Klicken Sie auf Zug beenden, nehmen Sie Execute an und wählen Sie Monochromon. Lassen Sie die Battle und Phantomons Löschung abschließen.",
  "learn.lesson.drill-execute.step.execute.hint":
    "Wählen Sie nicht den Spieler: Entfernen Sie den Blocker. Die vorgemerkte Löschung durch Execute erfolgt auch nach Phantomons Sieg.",
  "learn.lesson.drill-execute.step.opponent-turn":
    "Lassen Sie die Verarbeitung am Zugende abschließen und den Zug des Bots beginnen.",
  "learn.lesson.drill-execute.step.opponent-turn.hint":
    "Der Keyword-Angriff erfolgt vor dem tatsächlichen Zugwechsel. Danach passt der Bot.",
  "learn.lesson.drill-execute.step.your-turn":
    "Warten Sie, bis der Bot passt und Ihr nächster Zug die Main Phase erreicht.",
  "learn.lesson.drill-execute.step.your-turn.hint": "Birdramon ist weiterhin bereit und kein Blocker bleibt übrig.",
  "learn.lesson.drill-execute.step.win": "Greifen Sie den Spieler mit Birdramon an, um zu gewinnen.",
  "learn.lesson.drill-execute.step.win.hint":
    "Der Bot hat keine Security. Phantomons Opfer entfernte seine Verteidigung.",
  "learn.lesson.drill-progress.title": "Progress: beim Angriff einem Security-Effekt widerstehen",
  "learn.lesson.drill-progress.summary":
    "Greifen Sie durch Cocytus Breath hindurch an und behalten Sie Ihr Digimon dank Progress.",
  "learn.lesson.drill-progress.goal1": "Wie Progress gegnerische Effekte vom Angreifer fernhält",
  "learn.lesson.drill-progress.goal2": "Warum Progress nicht jede Battle-Niederlage verhindert",
  "learn.lesson.drill-progress.done":
    "Dimetromon ignorierte beim Angriff den Security-Effekt und gewann im nächsten Zug.",
  "learn.lesson.drill-progress.step.intro":
    "Dimetromon hat Progress: Während seines Angriffs beeinflussen gegnerische Effekte es nicht. Die letzte Security-Karte des Bots ist Cocytus Breath.",
  "learn.lesson.drill-progress.step.intro.hint":
    "Cocytus Breath gibt normalerweise ein gegnerisches Digimon auf die Hand zurück. Progress schützt diesen Angreifer während dieses Effekts.",
  "learn.lesson.drill-progress.step.progress":
    "Greifen Sie den Spieler mit Dimetromon an. Beobachten Sie, wie Cocytus Breath auflöst, ohne Ihren Angreifer auf die Hand zurückzugeben.",
  "learn.lesson.drill-progress.step.progress.hint":
    "Der Schutz gilt beim Angriff gegen gegnerische Effekte. Die normale Battle-Löschung durch ein stärkeres Security-Digimon verhindert er nicht.",
  "learn.lesson.drill-progress.step.end-turn": "Dimetromon blieb auf dem Feld. Klicken Sie auf Zug beenden.",
  "learn.lesson.drill-progress.step.end-turn.hint": "Der Bot hat keine Digimon, die Sie angreifen können.",
  "learn.lesson.drill-progress.step.your-turn": "Warten Sie auf Ihre nächste Main Phase.",
  "learn.lesson.drill-progress.step.your-turn.hint": "Dimetromon wird zu Beginn Ihres Zuges reaktiviert.",
  "learn.lesson.drill-progress.step.win": "Greifen Sie den Spieler mit Dimetromon an, um zu gewinnen.",
  "learn.lesson.drill-progress.step.win.hint": "Ohne Progress wäre Ihr einziger Angreifer auf die Hand zurückgekehrt.",
  "learn.lesson.drill-engage.title": "Engage: während der Zugende-Verarbeitung angreifen",
  "learn.lesson.drill-engage.summary":
    "Halten Sie Ihr Digimon bereit und nehmen Sie nach dem Passen einen Engage-Angriff an.",
  "learn.lesson.drill-engage.goal1": "Wie Engage am Ende Ihres Zuges auslöst",
  "learn.lesson.drill-engage.goal2": "Warum der Angriff vor Beginn des gegnerischen Zuges auflöst",
  "learn.lesson.drill-engage.done": "WarGrowlmon griff mit Engage während der Zugende-Verarbeitung an und gewann.",
  "learn.lesson.drill-engage.step.intro":
    "WarGrowlmon hat Engage und der Bot keine Security. Gewinnen Sie mit seinem Zugende-Keyword statt mit einem normalen Angriff in der Main Phase.",
  "learn.lesson.drill-engage.step.intro.hint":
    "Engage ist optional. Beim Auflösen des Effekts muss der Angriff regelkonform möglich sein.",
  "learn.lesson.drill-engage.step.keep-ready":
    "Halten Sie WarGrowlmon nicht suspendiert, damit es Engage nutzen kann. Fahren Sie fort, sobald Sie passen möchten.",
  "learn.lesson.drill-engage.step.keep-ready.hint":
    "Engage reaktiviert kein Digimon und lässt ein frisch ausgespieltes Digimon die normale Angriffssperre nicht ignorieren.",
  "learn.lesson.drill-engage.step.engage":
    "Klicken Sie auf Zug beenden, nehmen Sie Engage an und wählen Sie den Spieler als Angriffsziel, um zu gewinnen.",
  "learn.lesson.drill-engage.step.engage.hint":
    "Das Passen gibt dem Bot 3 Memory, aber Engage und der Angriff lösen vor Beginn seines Zuges auf.",
  "learn.lesson.drill-barrier.title": "Barrier: mit Security Ihr Digimon erhalten",
  "learn.lesson.drill-barrier.summary":
    "Schützen Sie Angemon nach einer verlorenen Security-Battle und gewinnen Sie anschließend damit.",
  "learn.lesson.drill-barrier.goal1": "Wie Barrier eine Battle-Löschung verhindert",
  "learn.lesson.drill-barrier.goal2": "Warum die Zahlung einer Security-Karte kein Security-Check ist",
  "learn.lesson.drill-barrier.done":
    "Angemon bezahlte eine Security-Karte für Barrier, überlebte die Battle und gewann im folgenden Zug.",
  "learn.lesson.drill-barrier.step.intro":
    "Angemon hat 4000 DP und Barrier. Die letzte Security-Karte des Bots ist Ikkakumon mit 5000 DP. Angemon verliert daher diese Battle.",
  "learn.lesson.drill-barrier.step.intro.hint":
    "Sie haben 1 Security-Karte, um Barrier zu bezahlen und Angemons Battle-Löschung zu verhindern.",
  "learn.lesson.drill-barrier.step.barrier":
    "Greifen Sie den Spieler mit Angemon an. Nehmen Sie Barrier an, um Ihre oberste Security-Karte abzulegen und Angemon zu behalten.",
  "learn.lesson.drill-barrier.step.barrier.hint":
    "Barrier verhindert diese Battle-Löschung. Die abgelegte Security ist eine Zahlung und aktiviert keinen Security-Effekt.",
  "learn.lesson.drill-barrier.step.end-turn":
    "Angemon überlebte und beide Spieler haben keine Security. Klicken Sie auf Zug beenden.",
  "learn.lesson.drill-barrier.step.end-turn.hint":
    "Der Bot hat keine Digimon auf dem Feld. Sie können hier gefahrlos passen.",
  "learn.lesson.drill-barrier.step.your-turn": "Warten Sie auf Ihre nächste Main Phase.",
  "learn.lesson.drill-barrier.step.your-turn.hint": "Angemon wird zu Beginn Ihres Zuges reaktiviert.",
  "learn.lesson.drill-barrier.step.win": "Greifen Sie den Spieler mit Angemon an, um zu gewinnen.",
  "learn.lesson.drill-barrier.step.win.hint":
    "Barrier erhielt den einzigen Angreifer, den Sie für diesen letzten Treffer brauchten.",
  "learn.lesson.drill-training.title": "Training: die entscheidende Quelle für eine Battle aufbauen",
  "learn.lesson.drill-training.summary":
    "Trainieren Sie Greymon, damit sein nächster Angriff genügend DP gegen einen Blocker erhält.",
  "learn.lesson.drill-training.goal1":
    "Wie Training ein Digimon suspendiert und die oberste Deckkarte verdeckt darunter legt",
  "learn.lesson.drill-training.goal2": "Wie weitere verdeckte Quellen andere Effekte einer Karte verstärken",
  "learn.lesson.drill-training.done":
    "Greymon erhielt durch Training eine verdeckte Quelle und beim Angriff eine weitere. Es besiegte den Blocker mit 7000 DP und Dracomon gewann.",
  "learn.lesson.drill-training.step.intro":
    "Greymon hat Training und 5000 DP. Grizzlymon des Bots hat 6000 DP und Blocker. Training kann die zusätzliche Quelle für Greymons Sieg aufbauen.",
  "learn.lesson.drill-training.step.intro.hint":
    "Greymons Angriffseffekt gibt +1000 DP je verdeckter Quelle. Eine verdeckt trainierte Karte liefert ihren gedruckten vererbten Effekt nicht.",
  "learn.lesson.drill-training.step.train":
    "Klicken Sie auf Greymon und aktivieren Sie Training. Es suspendiert sich und legt die oberste Deckkarte verdeckt unter seine unterste Digivolution-Karte.",
  "learn.lesson.drill-training.step.train.hint":
    "Training kostet keine Memory. Die Karte bleibt verdeckt; ihr gedruckter Name, ihre Farbe und ihre Effekte dürfen nicht referenziert werden.",
  "learn.lesson.drill-training.step.end-turn":
    "Klicken Sie auf Zug beenden, damit Greymon in Ihrem nächsten Zug wieder bereit ist.",
  "learn.lesson.drill-training.step.end-turn.hint": "In dieser Übung passt der Bot, ohne anzugreifen.",
  "learn.lesson.drill-training.step.your-turn":
    "Warten Sie auf Ihre Main Phase. Greymon wird reaktiviert und behält die trainierte Quelle.",
  "learn.lesson.drill-training.step.your-turn.hint":
    "Die Training-Quelle bleibt über Züge hinweg im Stapel. Sie ist kein vorübergehender DP-Bonus.",
  "learn.lesson.drill-training.step.battle":
    "Greifen Sie den Spieler mit Greymon an. Nehmen Sie [When Attacking] an, um eine weitere Deckkarte verdeckt abzulegen und DP zu erhalten. Der Bot blockt mit Grizzlymon.",
  "learn.lesson.drill-training.step.battle.hint":
    "Zwei verdeckte Quellen geben +2000 DP: 7000 schlägt 6000. Ohne das frühere Training ergäbe eine Quelle nur 6000 DP und beide Digimon würden verlieren.",
  "learn.lesson.drill-training.step.win":
    "Greifen Sie nach dem Entfernen des Blockers den Spieler mit Dracomon an, um zu gewinnen.",
  "learn.lesson.drill-training.step.win.hint":
    "Bewahren Sie Dracomon für den letzten Angriff auf. Training lieferte die zusätzliche Quelle, mit der Greymon die Verteidigung durchbrach.",
  "learn.lesson.drill-decoy.title": "Decoy: einen Mitstreiter retten",
  "learn.lesson.drill-decoy.summary": "Opfern Sie Machmon, um BigMamemon vor Gaia Force des Bots zu schützen.",
  "learn.lesson.drill-decoy.goal1": "Welche Digimon Decoy schützen kann",
  "learn.lesson.drill-decoy.goal2": "Mit dem Decoy-Träger bezahlen und danach zurückschlagen",
  "learn.lesson.drill-decoy.done": "Machmon bezahlte Decoy, BigMamemon überlebte und das gerettete Digimon gewann.",
  "learn.lesson.drill-decoy.step.intro":
    "Mit Decoy (Black) kann Machmon sich löschen, wenn ein anderes Ihrer schwarzen Digimon durch einen gegnerischen Effekt gelöscht würde. Der Bot zielt mit Gaia Force auf Ihr einziges anderes Digimon, BigMamemon.",
  "learn.lesson.drill-decoy.step.intro.hint":
    "Regel 16-18. Das Keyword schützt ein anderes passendes Digimon; Machmon kann sich damit nicht selbst retten.",
  "learn.lesson.drill-decoy.step.react":
    "Nehmen Sie bei der Decoy-Abfrage Machmons Schutz an. Falls eine Schutzauswahl erscheint, wählen Sie Machmons Decoy.",
  "learn.lesson.drill-decoy.step.react.hint":
    "Machmon geht als Zahlung auf die Ablage. BigMamemon bleibt im Kampfbereich, statt gelöscht zu werden.",
  "learn.lesson.drill-decoy.step.your-turn":
    "Warten Sie auf das Zugende des Bots. Ihr überlebendes BigMamemon kann dann angreifen.",
  "learn.lesson.drill-decoy.step.your-turn.hint":
    "Das gegnerische Agumon liefert nur die Farbe für Gaia Force. Dieser geführte Bot passt jetzt.",
  "learn.lesson.drill-decoy.step.attack-player":
    "Klicken Sie auf BigMamemon, wählen Sie Angriff und den leeren gegnerischen Security-Stapel, um zu gewinnen.",
  "learn.lesson.drill-decoy.step.attack-player.hint": "Dies ist dasselbe BigMamemon, das Decoy geschützt hat.",
  "learn.lesson.drill-armor-purge.title": "Armor Purge: die oberste Karte abwerfen",
  "learn.lesson.drill-armor-purge.summary":
    "Legen Sie Quetzalmon ab, um Gabumon im Spiel zu behalten, statt das ganze Digimon zu verlieren.",
  "learn.lesson.drill-armor-purge.goal1": "Die oberste Karte ablegen, um die Löschung zu verhindern",
  "learn.lesson.drill-armor-purge.goal2": "Mit dem darunter verbleibenden Digimon angreifen",
  "learn.lesson.drill-armor-purge.done": "Quetzalmon wurde abgelegt, Gabumon überlebte die Entfernung und gewann.",
  "learn.lesson.drill-armor-purge.step.intro":
    "Quetzalmon hat Armor Purge und Gabumon darunter. Wenn Gaia Force es löschen würde, kann Armor Purge nur die oberste Karte ablegen und diese Löschung verhindern.",
  "learn.lesson.drill-armor-purge.step.intro.hint":
    "Regel 16-19. Die Rüstungskarte wird abgelegt; nicht beide Karten des Stapels werden gelöscht.",
  "learn.lesson.drill-armor-purge.step.react":
    "Nehmen Sie Armor Purge an, wenn Gaia Force des Bots Quetzalmon bedroht.",
  "learn.lesson.drill-armor-purge.step.react.hint":
    "Quetzalmon geht auf die Ablage. Das freigelegte Gabumon bleibt dasselbe Digimon auf dem Feld.",
  "learn.lesson.drill-armor-purge.step.your-turn":
    "Warten Sie auf Ihre Main Phase. Gabumon hat überlebt und kann angreifen.",
  "learn.lesson.drill-armor-purge.step.your-turn.hint":
    "Armor Purge verhinderte diese Löschung. Es gewährt keinen dauerhaften Schutz vor späteren Effekten.",
  "learn.lesson.drill-armor-purge.step.attack-player":
    "Klicken Sie auf Gabumon, wählen Sie Angriff und den leeren gegnerischen Security-Stapel.",
  "learn.lesson.drill-armor-purge.step.attack-player.hint":
    "Die darunter überlebende Karte liefert Ihren siegreichen Angriff.",
  "learn.lesson.drill-save.title": "Save: eine Ressource unter einem Tamer erhalten",
  "learn.lesson.drill-save.summary":
    "Retten Sie Shoutmon und verwenden Sie genau diese Karte für ein siegreiches Digimon mit Rush.",
  "learn.lesson.drill-save.goal1": "Die gelöschte Karte unter Ihrem Tamer retten",
  "learn.lesson.drill-save.goal2": "Eine gerettete Karte als DigiXros-Material wiederverwenden",
  "learn.lesson.drill-save.done":
    "Das gerettete Shoutmon wurde zu King Versions Quelle und gab ihm das nötige Rush zum Sieg.",
  "learn.lesson.drill-save.step.intro":
    "Gaia Force wird Shoutmon löschen. Sein On Deletion Save kann die Karte unter Taiki legen, statt sie auf der Ablage zu lassen. Ihr Shoutmon (King Version) auf der Hand kann sie für DigiXros nutzen.",
  "learn.lesson.drill-save.step.intro.hint":
    "Regel 16-20. Save erhält die Karte als Ressource; Shoutmons Löschung wird nicht verhindert.",
  "learn.lesson.drill-save.step.react":
    "Lösen Sie Shoutmons On Deletion auf und nehmen Sie Save an. Wählen Sie bei Bedarf Taiki Kudo als empfangenden Tamer.",
  "learn.lesson.drill-save.step.react.hint":
    "Shoutmon sollte jetzt unter Taiki liegen, ohne Digimon in Ihrem Kampfbereich.",
  "learn.lesson.drill-save.step.your-turn":
    "Warten Sie auf Ihre Main Phase. Sie haben 3 Memory für das gerettete Shoutmon.",
  "learn.lesson.drill-save.step.your-turn.hint":
    "Taiki kann sich suspendieren, damit DigiXros Karten unter Ihren Tamern nutzen darf.",
  "learn.lesson.drill-save.step.reuse":
    "Wählen Sie Shoutmon (King Version) auf Ihrer Hand und DigiXros. Wählen Sie Taiki als zu suspendierenden Tamer und das gerettete Shoutmon darunter als Material. Bestätigen Sie.",
  "learn.lesson.drill-save.step.reuse.hint":
    "Ein Material reduziert die Kosten von 5 auf 3. Shoutmons vererbter Effekt gibt diesem Digimon mit Shoutmon im Namen Rush.",
  "learn.lesson.drill-save.step.attack-player":
    "Greifen Sie mit Shoutmon (King Version) den leeren gegnerischen Security-Stapel an.",
  "learn.lesson.drill-save.step.attack-player.hint":
    "Ohne die gerettete Quelle hätte dieses frisch ausgespielte Digimon nicht das vererbte Rush für einen sofortigen Angriff.",
  "learn.lesson.drill-material-save.title": "Material Save: die Quellen retten",
  "learn.lesson.drill-material-save.summary":
    "Retten Sie beide DigiXros-Materialien und bauen Sie MetalGreymon für den siegreichen Rush-Angriff erneut auf.",
  "learn.lesson.drill-material-save.goal1": "Die angegebenen Materialien eines gelöschten Stapels retten",
  "learn.lesson.drill-material-save.goal2": "Durch Wiederverwendung beider geretteter Karten weniger bezahlen",
  "learn.lesson.drill-material-save.done":
    "Beide geretteten Materialien bauten MetalGreymon für 3 Memory erneut auf und sein Rush-Angriff gewann.",
  "learn.lesson.drill-material-save.step.intro":
    "Unter MetalGreymon liegen Greymon und MailBirdramon. Gaia Force wird es löschen. Material Save 2 kann diese angegebenen DigiXros-Materialien unter Kiriha legen.",
  "learn.lesson.drill-material-save.step.intro.hint":
    "Regel 16-21. Gerettet werden passende Quellen, nicht das gelöschte MetalGreymon selbst.",
  "learn.lesson.drill-material-save.step.react":
    "Nehmen Sie Material Save 2 an. Wählen Sie Greymon und MailBirdramon und legen Sie beide bei der Abfrage unter Kiriha Aonuma.",
  "learn.lesson.drill-material-save.step.react.hint":
    "Nutzen Sie beide passenden Quellen. MetalGreymon geht auf die Ablage; seine Materialien bleiben unter Kiriha erhalten.",
  "learn.lesson.drill-material-save.step.your-turn":
    "Warten Sie auf Ihre Main Phase. Sie haben ein weiteres MetalGreymon auf der Hand und 3 Memory.",
  "learn.lesson.drill-material-save.step.your-turn.hint":
    "Kiriha kann sich suspendieren, um bei DigiXros Materialien unter Ihren Tamern zu erlauben.",
  "learn.lesson.drill-material-save.step.reuse":
    "Wählen Sie MetalGreymon auf der Hand und DigiXros. Wählen Sie Kiriha zum Suspendieren und beide geretteten Materialien darunter. Bestätigen Sie und lösen Sie die On Play-Auswahl auf.",
  "learn.lesson.drill-material-save.step.reuse.hint":
    "Zwei Materialien reduzieren die Kosten von 7 auf 3 Memory. On Play gibt Rush, sodass das neu aufgebaute Digimon sofort angreifen kann.",
  "learn.lesson.drill-material-save.step.attack-player":
    "Greifen Sie mit dem neu aufgebauten MetalGreymon den leeren gegnerischen Security-Stapel an.",
  "learn.lesson.drill-material-save.step.attack-player.hint":
    "Die zwei geretteten Karten machten die Kosten bezahlbar. Rush lässt dieses neue Digimon das Spiel beenden.",
  "learn.lesson.drill-evade.title": "Evade: zum Überleben suspendieren",
  "learn.lesson.drill-evade.summary":
    "Nutzen Sie Evade gegen Gaia Force und gewinnen Sie nach der Reaktivierung in Ihrem Zug.",
  "learn.lesson.drill-evade.goal1": "Durch Suspendieren des bedrohten Digimon bezahlen",
  "learn.lesson.drill-evade.goal2": "Ihren Angreifer trotz gegnerischer Entfernung behalten",
  "learn.lesson.drill-evade.done":
    "Syakomon suspendierte sich, um die Löschung zu verhindern, wurde danach reaktiviert und gewann.",
  "learn.lesson.drill-evade.step.intro":
    "Syakomon hat Evade. Wenn Gaia Force es löschen würde, dürfen Sie Syakomon zum Verhindern suspendieren. Es muss sich für diese Zahlung suspendieren können.",
  "learn.lesson.drill-evade.step.intro.hint": "Regel 16-22. Syakomon ist nicht suspendiert und Ihr einziger Angreifer.",
  "learn.lesson.drill-evade.step.react":
    "Nehmen Sie die Evade-Abfrage an. Syakomon suspendiert sich und überlebt Gaia Force.",
  "learn.lesson.drill-evade.step.react.hint":
    "Ein suspendiertes Digimon könnte diese Bedingung nicht erneut bezahlen. Verhindert wird diese Löschung; es ist keine Immunität.",
  "learn.lesson.drill-evade.step.your-turn":
    "Warten Sie, bis der Bot passt. Syakomon wird in Ihrer nächsten Unsuspend Phase reaktiviert.",
  "learn.lesson.drill-evade.step.your-turn.hint":
    "Gaia Force liegt nun auf der gegnerischen Ablage und Syakomon ist weiterhin auf dem Feld.",
  "learn.lesson.drill-evade.step.attack-player":
    "Klicken Sie auf Syakomon, wählen Sie Angriff und den leeren gegnerischen Security-Stapel.",
  "learn.lesson.drill-evade.step.attack-player.hint":
    "Das Digimon, das der Löschung entging, führt Ihren siegreichen Angriff aus.",
  "learn.lesson.drill-fortitude.title": "Fortitude: nach der Löschung zurückkehren",
  "learn.lesson.drill-fortitude.summary":
    "Spielen Sie Aquilamon nach Gaia Force erneut aus und gewinnen Sie mit seinem neuen Leben.",
  "learn.lesson.drill-fortitude.goal1": "Fortitude benötigt beim Löschen eine Quelle",
  "learn.lesson.drill-fortitude.goal2": "Ein erneut ausgespieltes Digimon ist ein neues Digimon",
  "learn.lesson.drill-fortitude.done": "Aquilamon kehrte ohne seine Quelle zurück und gewann in Ihrem folgenden Zug.",
  "learn.lesson.drill-fortitude.step.intro":
    "Aquilamon hat Fortitude und Kunemon darunter. Wird es mit einer Quelle gelöscht, spielt Fortitude Aquilamon ohne Kostenzahlung erneut aus.",
  "learn.lesson.drill-fortitude.step.intro.hint":
    "Regel 16-27. Die Löschung wird nicht verhindert. Das erneut ausgespielte Digimon ist neu und seine alten Quellen bleiben auf der Ablage.",
  "learn.lesson.drill-fortitude.step.react":
    "Lassen Sie Gaia Force Aquilamon löschen. Lösen Sie Fortitude auf und bestätigen Sie bei Bedarf den verpflichtenden Effekt im Auslöserfenster.",
  "learn.lesson.drill-fortitude.step.react.hint":
    "Aquilamon kehrt ohne Quellen mit einer neuen Feldidentität zurück. Kunemon bleibt auf der Ablage.",
  "learn.lesson.drill-fortitude.step.your-turn":
    "Warten Sie auf Ihren Zug. Aquilamon wurde im Zug des Bots erneut ausgespielt und darf in Ihrem Zug angreifen.",
  "learn.lesson.drill-fortitude.step.your-turn.hint":
    "Ohne eine Quelle löst eine spätere Löschung dieses Fortitude nicht erneut aus.",
  "learn.lesson.drill-fortitude.step.attack-player":
    "Greifen Sie mit dem erneut ausgespielten Aquilamon den leeren gegnerischen Security-Stapel an.",
  "learn.lesson.drill-fortitude.step.attack-player.hint":
    "Sie gewannen mit der durch Fortitude zurückgebrachten Karte, nicht mit dem ursprünglichen Permanent.",
  "learn.lesson.drill-partition.title": "Partition: in zwei Digimon aufteilen",
  "learn.lesson.drill-partition.summary":
    "Machen Sie aus einer gegnerischen Löschung zwei ausgespielte Digimon der Stufe 4.",
  "learn.lesson.drill-partition.goal1": "Beide angegebenen Quellen werden benötigt",
  "learn.lesson.drill-partition.goal2": "Beide Teile ausspielen, bevor die oberste Karte geht",
  "learn.lesson.drill-partition.done": "Paildramon teilte sich in Ikkakumon und Togemon auf und Ikkakumon gewann.",
  "learn.lesson.drill-partition.step.intro":
    "Paildramon hat Partition (blaue Stufe 4 und grüne Stufe 4). Ikkakumon und Togemon darunter erfüllen diese Anforderungen. Gaia Force versucht, Paildramon zu entfernen.",
  "learn.lesson.drill-partition.step.intro.hint":
    "Regel 16-29. Partition gilt für gegnerische Effekte, nicht für Entfernung durch Battle oder Ihre eigenen Effekte.",
  "learn.lesson.drill-partition.step.react":
    "Nehmen Sie Partition an. Wählen Sie das blaue Ikkakumon und das grüne Togemon, um beide ohne Kostenzahlung auszuspielen.",
  "learn.lesson.drill-partition.step.react.hint":
    "Sie müssen eines jeder benötigten Kategorie ausspielen. Paildramon verlässt weiterhin das Feld; Partition verhindert seine Löschung nicht.",
  "learn.lesson.drill-partition.step.your-turn":
    "Warten Sie auf Ihre Main Phase. Beide Quellen sind jetzt eigenständige Digimon.",
  "learn.lesson.drill-partition.step.your-turn.hint":
    "Sie kamen im gegnerischen Zug ins Spiel und dürfen in Ihrem Zug angreifen.",
  "learn.lesson.drill-partition.step.attack-player":
    "Greifen Sie mit Ikkakumon den leeren gegnerischen Security-Stapel an.",
  "learn.lesson.drill-partition.step.attack-player.hint":
    "Sie können auch Togemon untersuchen: Beide angegebenen Quellen wurden durch dasselbe Partition ausgespielt.",
  "learn.lesson.drill-scapegoat.title": "Scapegoat: einen Mitstreiter opfern",
  "learn.lesson.drill-scapegoat.summary": "Löschen Sie Agumon, damit Bastemon Gaia Force des Bots überlebt.",
  "learn.lesson.drill-scapegoat.goal1": "Ein anderes Digimon als Zahlung wählen",
  "learn.lesson.drill-scapegoat.goal2": "Die Löschung des bedrohten Digimon verhindern",
  "learn.lesson.drill-scapegoat.done": "Agumon bezahlte Scapegoat und das überlebende Bastemon gewann.",
  "learn.lesson.drill-scapegoat.step.intro":
    "Bastemon hat Scapegoat. Würde es außer durch Ihre eigenen Effekte gelöscht, kann es ein anderes Ihrer Digimon als Zahlung löschen, um dies zu verhindern. Agumon steht bereit.",
  "learn.lesson.drill-scapegoat.step.intro.hint":
    "Regel 16-32. Sie retten Bastemon, indem Sie ein anderes Digimon opfern, nicht Bastemon selbst.",
  "learn.lesson.drill-scapegoat.step.react":
    "Nehmen Sie Scapegoat an und wählen Sie Ihr Agumon als zu löschendes Digimon.",
  "learn.lesson.drill-scapegoat.step.react.hint":
    "Agumon geht auf die Ablage und Bastemon bleibt. Lehnen Sie den Schutz nicht ab.",
  "learn.lesson.drill-scapegoat.step.your-turn":
    "Warten Sie auf Ihren Zug, nachdem der Bot Gaia Force abgeschlossen und gepasst hat.",
  "learn.lesson.drill-scapegoat.step.your-turn.hint": "Bastemon bleibt dasselbe Digimon und kann angreifen.",
  "learn.lesson.drill-scapegoat.step.attack-player":
    "Greifen Sie mit Bastemon den leeren gegnerischen Security-Stapel an.",
  "learn.lesson.drill-scapegoat.step.attack-player.hint": "Das Opfer erhielt Ihr stärkeres Digimon für den Sieg.",
  "learn.lesson.drill-decode.title": "Decode: vor dem Verlassen eine Quelle ausspielen",
  "learn.lesson.drill-decode.summary":
    "Retten Sie Sistermon Blanc aus dem Stapel, wenn ihre erwachte Form auf die Hand zurückkehrt.",
  "learn.lesson.drill-decode.goal1": "Decode reagiert auf ein Verlassen außerhalb einer Battle",
  "learn.lesson.drill-decode.goal2": "Die angegebene Quelle ohne Kostenzahlung ausspielen",
  "learn.lesson.drill-decode.done":
    "Sistermon Blanc verließ den Stapel durch Decode und führte den siegreichen Angriff aus.",
  "learn.lesson.drill-decode.step.intro":
    "Sistermon Blanc (Awakened) hat Decode (Sistermon Blanc) und eine Karte mit genau diesem Namen darunter. Cocytus Breath des Bots gibt die erwachte Karte auf Ihre Hand zurück.",
  "learn.lesson.drill-decode.step.intro.hint":
    "Regel 16-36. Decode reagiert auf diese Rückkehr, weil sie keine Battle-Entfernung ist.",
  "learn.lesson.drill-decode.step.react":
    "Nehmen Sie Decode an und wählen Sie Sistermon Blanc aus den Quellen. Lösen Sie bei Bedarf Blancs On Play Draw 1 auf.",
  "learn.lesson.drill-decode.step.react.hint":
    "Blanc wird als eigenständiges Digimon ausgespielt. Die erwachte Karte kehrt weiterhin auf Ihre Hand zurück; Decode verhindert das Verlassen nicht.",
  "learn.lesson.drill-decode.step.your-turn":
    "Warten Sie auf Ihre Main Phase. Die durch Decode ausgespielte Sistermon Blanc ist jetzt Ihr einziges Digimon.",
  "learn.lesson.drill-decode.step.your-turn.hint":
    "Sie wurde im Zug des Bots ausgespielt und darf in Ihrem Zug angreifen.",
  "learn.lesson.drill-decode.step.attack-player":
    "Greifen Sie mit Sistermon Blanc den leeren gegnerischen Security-Stapel an.",
  "learn.lesson.drill-decode.step.attack-player.hint":
    "Ohne Decode wäre die Quelle beim Verlassen des Stapels abgelegt worden.",
  "learn.lesson.drill-fragment.title": "Fragment: mit Ihren Quellen bezahlen",
  "learn.lesson.drill-fragment.summary": "Legen Sie zwei Quellen ab, damit Giromon Gaia Force überlebt.",
  "learn.lesson.drill-fragment.goal1": "Fragment erfordert die vollständig angegebene Quellenanzahl",
  "learn.lesson.drill-fragment.goal2": "Durch Zahlung von genau zwei Karten die Löschung verhindern",
  "learn.lesson.drill-fragment.done": "Giromon bezahlte Fragment 2 mit beiden Quellen, überlebte und gewann.",
  "learn.lesson.drill-fragment.step.intro":
    "Giromon hat Fragment (2) und Jazamon sowie Jazardmon darunter. Wenn Gaia Force es löschen würde, kann Fragment zwei Quellen ablegen und dies verhindern.",
  "learn.lesson.drill-fragment.step.intro.hint":
    "Regel 16-37. Eine Quelle genügt nicht; Giromon hat genau die zwei benötigten.",
  "learn.lesson.drill-fragment.step.react":
    "Nehmen Sie Fragment an und wählen Sie Jazamon und Jazardmon als abzulegende Quellen.",
  "learn.lesson.drill-fragment.step.react.hint":
    "Giromon bleibt ohne Quellen im Spiel. Die beiden gewählten Karten gehen auf die Ablage.",
  "learn.lesson.drill-fragment.step.your-turn": "Warten Sie auf Ihre Main Phase, nachdem der Bot gepasst hat.",
  "learn.lesson.drill-fragment.step.your-turn.hint":
    "Giromon überlebte diese Löschung, hat aber keine Quellen für eine weitere Fragment-Zahlung.",
  "learn.lesson.drill-fragment.step.attack-player":
    "Greifen Sie mit Giromon den leeren gegnerischen Security-Stapel an.",
  "learn.lesson.drill-fragment.step.attack-player.hint":
    "Dasselbe Giromon, das Fragment bezahlte, führt den siegreichen Angriff aus.",
  "learn.lesson.drill-guard.title": "Guard: vor einer Rückkehr schützen",
  "learn.lesson.drill-guard.summary":
    "Opfern Sie Gladimon, damit Cocytus Breath BigMamemon nicht auf die Hand zurückgibt.",
  "learn.lesson.drill-guard.goal1": "Guard schützt ein anderes Digimon vor gegnerischer Entfernung",
  "learn.lesson.drill-guard.goal2": "Auch eine Rückkehr auf die Hand kann verhindert werden",
  "learn.lesson.drill-guard.done":
    "Gladimon bezahlte Guard, um die Rückkehr zu verhindern, und BigMamemon blieb zum Gewinnen.",
  "learn.lesson.drill-guard.step.intro":
    "Gladimon hat Guard. Würde ein anderes Ihrer Digimon den Kampfbereich durch einen gegnerischen Effekt verlassen, darf Gladimon sich löschen, um dies zu verhindern. Der Bot zielt mit Cocytus Breath auf BigMamemon.",
  "learn.lesson.drill-guard.step.intro.hint":
    "Regel 16-45. Anders als reiner Löschungsschutz kann Guard auch diese Rückkehr auf die Hand verhindern.",
  "learn.lesson.drill-guard.step.react":
    "Nehmen Sie Gladimons Guard bei der Schutzabfrage an. Wählen Sie Guard, falls eine Reaktionsreihenfolge verlangt wird.",
  "learn.lesson.drill-guard.step.react.hint":
    "Gladimon wird als Zahlung gelöscht. BigMamemon bleibt im Kampfbereich, statt auf Ihre Hand zu gelangen.",
  "learn.lesson.drill-guard.step.your-turn":
    "Warten Sie nach dem Passen des Bots auf Ihren Zug. Lösen Sie eine mögliche On Deletion-Abfrage von Gladimon auf.",
  "learn.lesson.drill-guard.step.your-turn.hint":
    "Gabumon des Bots ist bereits Stufe 3 ohne Quellen. Gladimon kann daher keine oberste Karte davon entfernen.",
  "learn.lesson.drill-guard.step.attack-player":
    "Greifen Sie mit BigMamemon den leeren gegnerischen Security-Stapel an.",
  "learn.lesson.drill-guard.step.attack-player.hint":
    "Guard erhielt Ihren einzigen verbliebenen Angreifer auf dem Feld.",
  "learn.lesson.drill-digisorption.title": "Digisorption: suspendieren, um Memory zu sparen",
  "learn.lesson.drill-digisorption.summary":
    "Digivolvieren Sie Pistmon für 1 Memory durch Suspendieren von Kunemon und greifen Sie danach mit Pistmon an.",
  "learn.lesson.drill-digisorption.goal1": "Die von Digisorption geforderte Suspendierung bezahlen",
  "learn.lesson.drill-digisorption.goal2": "Das digivolvierende Digimon angriffsbereit halten",
  "learn.lesson.drill-digisorption.done":
    "Sie bezahlten Digisorption und gewannen mit dem nicht suspendierten Pistmon.",
  "learn.lesson.drill-digisorption.step.intro":
    "Sie haben nur 1 Memory. Pistmon hat Digisorption -2: Die normale Digivolution kostet 3. Das Suspendieren eines anderen Digimon reduziert dies auf 1 und erhält Ihren Zug.",
  "learn.lesson.drill-digisorption.step.intro.hint":
    "Suspendieren Sie Kunemon statt Lighdramon, damit Ihr Angreifer bereit bleibt.",
  "learn.lesson.drill-digisorption.step.digivolve":
    "Digivolvieren Sie Lighdramon zu Pistmon. Nehmen Sie Digisorption an und wählen Sie Kunemon zum Suspendieren.",
  "learn.lesson.drill-digisorption.step.digivolve.hint":
    "Zahlen Sie 1 Memory bis auf 0 und halten Sie Pistmon nicht suspendiert. Ohne Reduktion gäbe die Zahlung von 3 dem Gegner vor Ihrem Angriff Memory.",
  "learn.lesson.drill-digisorption.step.attack-player": "Greifen Sie den Spieler mit Pistmon an, um zu gewinnen.",
  "learn.lesson.drill-digisorption.step.attack-player.hint":
    "Der Gegner hat keine Security und Pistmon war bereits als Lighdramon im Spiel.",
  "learn.lesson.drill-digi-burst.title": "Digi-Burst: Ihre Quellen verbrauchen",
  "learn.lesson.drill-digi-burst.summary":
    "Legen Sie zwei Quellen ab, um den Blocker vor Ihren Angriffen zu suspendieren.",
  "learn.lesson.drill-digi-burst.goal1": "Einen Main-Effekt mit Digi-Burst aktivieren",
  "learn.lesson.drill-digi-burst.goal2": "Mit genau zwei Digivolution-Karten bezahlen",
  "learn.lesson.drill-digi-burst.done":
    "HerculesKabuterimon verbrauchte zwei Quellen, schaltete den Blocker aus und ermöglichte den siegreichen Angriff.",
  "learn.lesson.drill-digi-burst.step.intro":
    "HerculesKabuterimon hat Main: Digi-Burst 2. Durch Ablegen zweier Quellen dürfen Sie ein gegnerisches Digimon suspendieren.",
  "learn.lesson.drill-digi-burst.step.intro.hint":
    "Monochromon kann blocken, solange es nicht suspendiert ist. Suspendieren Sie es zuerst.",
  "learn.lesson.drill-digi-burst.step.burst":
    "Wählen Sie HerculesKabuterimon und aktivieren Sie Digi-Burst. Wählen Sie Kunemon und Kabuterimon als abzulegende Quellen und danach Monochromon zum Suspendieren.",
  "learn.lesson.drill-digi-burst.step.burst.hint": "Das oberste HerculesKabuterimon ist keine verbrauchbare Quelle.",
  "learn.lesson.drill-digi-burst.step.attack-security":
    "Greifen Sie den Spieler mit HerculesKabuterimon an, um die letzte Security-Karte zu prüfen.",
  "learn.lesson.drill-digi-burst.step.attack-security.hint": "Das suspendierte Monochromon kann nicht blocken.",
  "learn.lesson.drill-digi-burst.step.attack-player": "Greifen Sie den Spieler mit Birdramon an, um zu gewinnen.",
  "learn.lesson.drill-digi-burst.step.attack-player.hint":
    "Das Entfernen der letzten Security-Karte brachte allein noch keinen Sieg.",
  "learn.lesson.drill-delay.title": "Delay: eine vorbereitete Option einlösen",
  "learn.lesson.drill-delay.summary":
    "Nutzen Sie Reinforcing Memory Boost!, um die Memory für den siegreichen Rush-Angriff zu erhalten.",
  "learn.lesson.drill-delay.goal1": "Delay nach dem Zug der Platzierung aktivieren",
  "learn.lesson.drill-delay.goal2": "Eine aufbewahrte Option in drei Memory umwandeln",
  "learn.lesson.drill-delay.done": "Delay bezahlte BushiAgumon, das mit Rush gewann.",
  "learn.lesson.drill-delay.step.intro":
    "Reinforcing Memory Boost! wurde in einem früheren Zug in den Kampfbereich gelegt. Sein Delay ist bereit. Sie haben nur 2 Memory.",
  "learn.lesson.drill-delay.step.intro.hint": "Sie können Delay nicht im Zug der Platzierung seiner Karte nutzen.",
  "learn.lesson.drill-delay.step.delay":
    "Wählen Sie Reinforcing Memory Boost! und aktivieren Sie Delay. Legen Sie die Karte für 3 Memory ab.",
  "learn.lesson.drill-delay.step.delay.hint": "Ihre Memory steigt von 2 auf 5.",
  "learn.lesson.drill-delay.step.play-rush": "Spielen Sie BushiAgumon aus Ihrer Hand für 5 Memory.",
  "learn.lesson.drill-delay.step.play-rush.hint":
    "Die durch Delay erhaltene Memory lässt Sie bezahlen und bei 0 bleiben.",
  "learn.lesson.drill-delay.step.attack-player": "Greifen Sie den Spieler mit BushiAgumon an, um zu gewinnen.",
  "learn.lesson.drill-delay.step.attack-player.hint": "Rush lässt dieses frisch ausgespielte Digimon angreifen.",
  "learn.lesson.drill-blast-digivolve.title": "Blast Digivolve: während eines Angriffs digivolvieren",
  "learn.lesson.drill-blast-digivolve.summary":
    "Kontern Sie den Bot-Angriff mit WarGreymon, blocken Sie und gewinnen Sie im nächsten Zug.",
  "learn.lesson.drill-blast-digivolve.goal1": "Das Counter-Timing für eine kostenlose Digivolution nutzen",
  "learn.lesson.drill-blast-digivolve.goal2": "Blocker vor dem Block-Timing erhalten",
  "learn.lesson.drill-blast-digivolve.done":
    "Blast Digivolve erzeugte WarGreymon rechtzeitig, um einen tödlichen Angriff zu blocken und anschließend zu gewinnen.",
  "learn.lesson.drill-blast-digivolve.step.intro":
    "Der Bot greift an, während Sie 0 Security haben. Ihr MetalGreymon hat keinen Blocker. WarGreymon auf der Hand kann durch Blast Digivolve zum Blocker werden.",
  "learn.lesson.drill-blast-digivolve.step.intro.hint": "Das Counter-Timing liegt vor dem Block-Timing.",
  "learn.lesson.drill-blast-digivolve.step.counter":
    "Wählen Sie bei Counter WarGreymon auf Ihrer Hand und nutzen Sie Blast Digivolve auf MetalGreymon.",
  "learn.lesson.drill-blast-digivolve.step.counter.hint":
    "Die zulässige Digivolution kostet keine Memory und zieht weiterhin eine Karte.",
  "learn.lesson.drill-blast-digivolve.step.block": "Blocken Sie das angreifende Ikkakumon mit Ihrem neuen WarGreymon.",
  "learn.lesson.drill-blast-digivolve.step.block.hint": "WarGreymon hat 11000 DP gegen Ikkakumons 5000 DP.",
  "learn.lesson.drill-blast-digivolve.step.your-turn":
    "Sie haben überlebt. Warten Sie, bis der Bot passt und Ihr Digimon reaktiviert wird.",
  "learn.lesson.drill-blast-digivolve.step.your-turn.hint": "Der Counter begann Ihren eigenen Zug nicht.",
  "learn.lesson.drill-blast-digivolve.step.attack-player": "Greifen Sie den Spieler mit WarGreymon an, um zu gewinnen.",
  "learn.lesson.drill-blast-digivolve.step.attack-player.hint":
    "Der Bot hat weder Security noch einen verbliebenen Blocker.",
  "learn.lesson.drill-mind-link.title": "Mind Link: einen Tamer zur Quelle machen",
  "learn.lesson.drill-mind-link.summary":
    "Verbinden Sie Eiji mit Loogarmon, nutzen Sie das gewährte Alliance und beenden Sie das Spiel.",
  "learn.lesson.drill-mind-link.goal1": "Einen passenden Tamer unter die Digivolution-Karten legen",
  "learn.lesson.drill-mind-link.goal2": "Einen durch Mind Link erhaltenen vererbten Effekt nutzen",
  "learn.lesson.drill-mind-link.done":
    "Eiji wurde zur Quelle, gewährte Alliance und half Loogarmon, beide Security-Karten zu entfernen.",
  "learn.lesson.drill-mind-link.step.intro":
    "Eiji Nagasumi kann Mind Link mit einem Dark Animal- oder SoC-Digimon ohne Tamer-Quellen nutzen. Loogarmon ist zulässig.",
  "learn.lesson.drill-mind-link.step.intro.hint":
    "Nach der Verbindung gewährt Eiji Alliance und Blocker aus seinem Feld für vererbte Effekte.",
  "learn.lesson.drill-mind-link.step.mind-link":
    "Wählen Sie Eiji, aktivieren Sie seinen Main Mind Link-Effekt und wählen Sie Loogarmon als Ziel.",
  "learn.lesson.drill-mind-link.step.mind-link.hint":
    "Eiji wird unter Loogarmon gelegt und ist kein eigenständiger Tamer im Kampfbereich mehr.",
  "learn.lesson.drill-mind-link.step.alliance":
    "Greifen Sie den Spieler mit Loogarmon an. Lösen Sie seine Angriffsauslöser in beliebiger Reihenfolge auf. Nehmen Sie Alliance an und suspendieren Sie Birdramon als Unterstützung. Lehnen Sie Loogarmons optionalen Effekt mit Handkosten ab oder legen Sie zur Auflösung 1 Karte ab. Schließen Sie beide Auslöser vor den 2 Security-Checks ab.",
  "learn.lesson.drill-mind-link.step.alliance.hint":
    "Wählen Sie Birdramon für Alliance und halten Sie Dracomon für den letzten Angriff nicht suspendiert.",
  "learn.lesson.drill-mind-link.step.attack-player": "Greifen Sie den Spieler mit Dracomon an, um zu gewinnen.",
  "learn.lesson.drill-mind-link.step.attack-player.hint":
    "Dracomon ist weiterhin bereit, weil Birdramon Alliance bezahlt hat.",
  "learn.lesson.drill-blast-dna-digivolve.title": "Blast DNA Digivolve: Feld und Hand kombinieren",
  "learn.lesson.drill-blast-dna-digivolve.summary":
    "Erzeugen Sie RagnaLoardmon im Counter-Timing aus einem Feld-Digimon und einem Handmaterial.",
  "learn.lesson.drill-blast-dna-digivolve.goal1": "Beide angegebenen DNA-Materialien bei Counter bereitstellen",
  "learn.lesson.drill-blast-dna-digivolve.goal2":
    "Die nur für DNA geltende Entfernung vor Fortsetzung des Angriffs auflösen",
  "learn.lesson.drill-blast-dna-digivolve.done":
    "RagnaLoardmon kombinierte beide Materialien kostenlos, entfernte den Angreifer und gewann im nächsten Zug.",
  "learn.lesson.drill-blast-dna-digivolve.step.intro":
    "Der Bot greift an, während Sie 0 Security haben. Durandamon ist im Kampfbereich; BryweLudramon und RagnaLoardmon sind auf Ihrer Hand.",
  "learn.lesson.drill-blast-dna-digivolve.step.intro.hint":
    "Blast DNA Digivolve benötigt das angegebene Digimon auf dem Feld und die andere angegebene Karte auf der Hand.",
  "learn.lesson.drill-blast-dna-digivolve.step.counter":
    "Nutzen Sie bei Counter RagnaLoardmon. Wählen Sie Durandamon und BryweLudramon von Ihrer Hand für Blast DNA Digivolve. Lösen Sie seine Effekte auf und wählen Sie das angreifende Plesiomon zum Löschen.",
  "learn.lesson.drill-blast-dna-digivolve.step.counter.hint":
    "Seine Digivolution legt die letzte gegnerische Security ab. Der nur für DNA geltende Effekt löscht den Angreifer, bevor er Sie trifft.",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn":
    "Warten Sie, bis der Bot passt. Ihr neues RagnaLoardmon ist für Ihren Zug bereit.",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn.hint":
    "DNA erzeugt ein neues Digimon und kombiniert beide Materialien als Quellen.",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player":
    "Greifen Sie den Spieler mit RagnaLoardmon an, um zu gewinnen.",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player.hint":
    "Der Angreifer wurde während Counter gelöscht, sodass Sie ohne Security überlebten.",
  "learn.lesson.drill-link.title": "Link +: eine zusätzliche Link-Karte behalten",
  "learn.lesson.drill-link.summary": "Geben Sie Deusmon eine zweite Link-Karte, ohne die erste zu ersetzen.",
  "learn.lesson.drill-link.goal1": "Eine Handkarte durch Zahlung der Link-Kosten verbinden",
  "learn.lesson.drill-link.goal2": "Mit Link +1 zwei Link-Karten behalten",
  "learn.lesson.drill-link.done":
    "Deusmon behielt beide Navimon-Links, prüfte Security und überließ Birdramon den siegreichen Angriff.",
  "learn.lesson.drill-link.step.intro":
    "Normalerweise behält ein Digimon nur 1 Link-Karte. Deusmon hat Link +1 und daher ein Limit von 2. Ein Navimon ist bereits verbunden.",
  "learn.lesson.drill-link.step.intro.hint": "Link-Karten liegen seitlich und sind keine Digivolution-Quellen.",
  "learn.lesson.drill-link.step.link":
    "Wählen Sie Navimon auf Ihrer Hand, dann Link und Deusmon. Bezahlen Sie die Link-Kosten von 1 Memory.",
  "learn.lesson.drill-link.step.link.hint": "Beide Navimon bleiben verbunden, weil Deusmon Platz für 2 hat.",
  "learn.lesson.drill-link.step.attack-security":
    "Greifen Sie den Spieler mit Deusmon an, um die letzte Security-Karte zu prüfen.",
  "learn.lesson.drill-link.step.attack-security.hint":
    "Die Link-DP-Boni bleiben aktiv, solange beide Link-Karten verbunden sind.",
  "learn.lesson.drill-link.step.attack-player": "Greifen Sie den Spieler mit Birdramon an, um zu gewinnen.",
  "learn.lesson.drill-link.step.attack-player.hint": "Der letzte Angriff erfolgt getrennt von den Security-Checks.",
  "learn.lesson.drill-use-req.title": "Use Req.: ein Merkmal statt einer Farbe erfüllen",
  "learn.lesson.drill-use-req.summary": "Nutzen Sie ein weißes e-Pulse, obwohl Ihr Feld nur Gelb liefert.",
  "learn.lesson.drill-use-req.goal1": "Die angegebene Use Req.-Bedingung lesen",
  "learn.lesson.drill-use-req.goal2": "Die Option-Kosten zahlen und nur die Farbanforderungen ignorieren",
  "learn.lesson.drill-use-req.done":
    "Liollmon erfüllte Use Req., e-Pulse spielte ein weiteres Digimon aus und Ihr ursprüngliches Liollmon gewann.",
  "learn.lesson.drill-use-req.step.intro":
    "e-Pulse ist weiß, aber Sie haben nur ein gelbes Liollmon im Kampfbereich. Sein Use Req. akzeptiert eine BEATBREAK-Karte auf Ihrem Feld.",
  "learn.lesson.drill-use-req.step.intro.hint":
    "Liollmon hat BEATBREAK, sodass Sie die weiße Farbanforderung ignorieren dürfen.",
  "learn.lesson.drill-use-req.step.use-option":
    "Nutzen Sie e-Pulse aus Ihrer Hand für 3 Memory. Nehmen Sie den Effekt an und spielen Sie das andere Liollmon von Ihrer Hand ohne Spielkosten aus.",
  "learn.lesson.drill-use-req.step.use-option.hint":
    "Use Req. erlässt die Farbe, nicht die Nutzungskosten von 3 Memory. e-Pulse bleibt danach im Kampfbereich.",
  "learn.lesson.drill-use-req.step.attack-player":
    "Greifen Sie den Spieler mit dem bereits im Kampfbereich befindlichen Liollmon an, um zu gewinnen.",
  "learn.lesson.drill-use-req.step.attack-player.hint":
    "Das frisch ausgespielte Liollmon kann in diesem Zug nicht angreifen. Wählen Sie das ursprüngliche.",
  "learn.lesson.drill-ascension.title": "Ascension: Löschung in Security verwandeln",
  "learn.lesson.drill-ascension.summary":
    "Lassen Sie ScourgeChiropmon zur Security werden, um den Bot zu überleben und anschließend zu gewinnen.",
  "learn.lesson.drill-ascension.goal1": "Ascension nach einer tatsächlichen Battle-Löschung auflösen",
  "learn.lesson.drill-ascension.goal2": "Mit der hinzugefügten Security einen Zug überleben",
  "learn.lesson.drill-ascension.done":
    "ScourgeChiropmon wurde zur Security, fing den Bot-Angriff ab und ermöglichte Birdramons Sieg.",
  "learn.lesson.drill-ascension.step.intro":
    "Sie haben 0 Security. Birdramon wurde in diesem Zug ausgespielt und muss warten. ScourgeChiropmon hat Ascension und kann nach seiner Löschung zur Security werden.",
  "learn.lesson.drill-ascension.step.intro.hint":
    "Der Bot greift in seinem Zug an. Sie benötigen vor dem Passen eine Security-Karte.",
  "learn.lesson.drill-ascension.step.ascend":
    "Greifen Sie das suspendierte Plesiomon mit ScourgeChiropmon an. Es verliert die Battle. Nehmen Sie Ascension an und legen Sie ScourgeChiropmon oben auf Ihre Security.",
  "learn.lesson.drill-ascension.step.ascend.hint":
    "ScourgeChiropmon hat 8000 DP gegen Plesiomons 12000 DP. Für seinen anderen Löschungseffekt steht kein Tamer als Zahlung bereit.",
  "learn.lesson.drill-ascension.step.end-turn": "Ihre neue Security-Karte ist bereit. Beenden Sie Ihren Zug.",
  "learn.lesson.drill-ascension.step.end-turn.hint":
    "Birdramon kann im Zug seines Ausspielens weiterhin nicht angreifen.",
  "learn.lesson.drill-ascension.step.your-turn":
    "Lassen Sie den Bot Ihre neue Security angreifen und warten Sie auf Ihren Zug.",
  "learn.lesson.drill-ascension.step.your-turn.hint": "Ohne Ascension hätte dieser Angriff Sie bei 0 Security besiegt.",
  "learn.lesson.drill-ascension.step.attack-player": "Greifen Sie den Spieler mit Birdramon an, um zu gewinnen.",
  "learn.lesson.drill-ascension.step.attack-player.hint":
    "Birdramon kann jetzt angreifen und der Bot hat keine Security.",
  "learn.lesson.drill-detach.title": "Detach: eine Link-Karte verbrauchen, um im Spiel zu bleiben",
  "learn.lesson.drill-detach.summary":
    "Verhindern Sie Cocytus Breath durch Abtrennen einer passenden Seven Code-Link-Karte.",
  "learn.lesson.drill-detach.goal1": "Detach nutzen, wenn ein gegnerischer Effekt Ihr Digimon entfernen würde",
  "learn.lesson.drill-detach.goal2": "Mit einer passenden Link-Karte statt einer Quelle bezahlen",
  "learn.lesson.drill-detach.done":
    "Weatherdramon verlor seine Link-Karte, blieb im Kampfbereich und gewann in Ihrem Zug.",
  "learn.lesson.drill-detach.step.intro":
    "Der Bot nutzt gleich Cocytus Breath, um Weatherdramon auf Ihre Hand zurückzugeben. Weatherdramon hat Detach für Seven Code-Link-Karten.",
  "learn.lesson.drill-detach.step.intro.hint": "Das verbundene Roleplaymon hat das benötigte Seven Code-Merkmal.",
  "learn.lesson.drill-detach.step.detach":
    "Nehmen Sie bei der Entfernungsabfrage Detach an und legen Sie das verbundene Roleplaymon ab. Behalten Sie Weatherdramon im Kampfbereich.",
  "learn.lesson.drill-detach.step.detach.hint":
    "Die Link-Karte geht auf die Ablage. Weatherdramon verliert seine Link-DP, kehrt aber nicht auf Ihre Hand zurück.",
  "learn.lesson.drill-detach.step.your-turn": "Der Bot hat seine Option verbraucht. Warten Sie, bis er passt.",
  "learn.lesson.drill-detach.step.your-turn.hint":
    "Detach verhindert das Verlassen; Weatherdramon wird nicht erneut ausgespielt.",
  "learn.lesson.drill-detach.step.attack-player": "Greifen Sie den Spieler mit Weatherdramon an, um zu gewinnen.",
  "learn.lesson.drill-detach.step.attack-player.hint": "Seine erhaltene Feldpräsenz lässt es in Ihrem Zug angreifen.",
  "learn.lesson.drill-succession.title": "Succession: den normalen Effekt einer Quelle nutzen",
  "learn.lesson.drill-succession.summary":
    "Nutzen Sie durch Succession den normalen Text der Ceresmon-Quelle, um bei Palmons Angriff einen Blocker zu entfernen.",
  "learn.lesson.drill-succession.goal1": "Die oberste passende, durch Succession gewählte Quelle lesen",
  "learn.lesson.drill-succession.goal2": "Einen kopierten normalen Effekt statt eines vererbten Effekts auflösen",
  "learn.lesson.drill-succession.done":
    "Succession kopierte Ceresmons normale Suspendierungsreaktion, löschte Monmon und ließ Palmon die Security entfernen, bevor Dracomon gewann.",
  "learn.lesson.drill-succession.step.intro":
    "Ihr oberstes Ceresmon hat Succession (Ceresmon). Die Ceresmon-Quelle hat einen normalen All Turns-Effekt, der einem Gegner je suspendiertem Digimon -3000 DP gibt. Succession kopiert diesen normalen Effekt.",
  "learn.lesson.drill-succession.step.intro.hint":
    "Dieser Text steht im normalen Effektfeld der Quelle, nicht im vererbten Feld. Monmon hat nur 1000 DP. Palmons 2000 DP schlagen auch das Security-Digimon mit 1000 DP.",
  "learn.lesson.drill-succession.step.copy-effect":
    "Greifen Sie den Spieler mit Palmon an. Seine Suspendierung löst Ceresmons durch Succession erhaltenen Effekt aus. Wählen Sie Monmon für -3000 DP; es wird vor dem Blocken gelöscht. Palmon prüft dann die letzte Security und überlebt.",
  "learn.lesson.drill-succession.step.copy-effect.hint":
    "Lösen Sie die kopierte Ceresmon-Reaktion vor dem Block-Timing auf.",
  "learn.lesson.drill-succession.step.attack-player":
    "Greifen Sie nach Palmons abgeschlossenem Security-Check den Spieler mit Dracomon an, um zu gewinnen.",
  "learn.lesson.drill-succession.step.attack-player.hint":
    "Der letzte Security-Check brachte allein keinen Sieg. Dracomon führt den getrennten siegreichen Angriff aus.",
  "learn.lesson.practice-game-preparation.title": "Von der Starthand zum siegreichen Spiel",
  "learn.lesson.practice-game-preparation.summary":
    "Beginnen Sie mit null Memory, legalen Decks, fünf Handkarten und fünf Security-Karten. Entwickeln Sie Ihren Angreifer und gewinnen Sie.",
  "learn.lesson.practice-game-preparation.goal1":
    "Starthand, Security-Stapel, Digi-Egg-Deck und die Ausnahme beim Ziehen im ersten Zug erkennen",
  "learn.lesson.practice-game-preparation.goal2":
    "Ein Digimon entwickeln und über mehrere Züge fünf Security-Karten vor einem letzten direkten Angriff entfernen",
  "learn.lesson.practice-game-preparation.done":
    "Sie spielten von einer normal vorbereiteten Ausgangslage über Breeding, Digivolution und Memory-Wechsel bis zum letzten Angriff.",
  "learn.lesson.practice-game-preparation.step.intro":
    "Dieses Spiel beginnt mit Decks aus fünfzig Karten, fünf Karten je Hand, fünf Security-Karten und null Memory. Sie beginnen und überspringen das erste normale Ziehen. Der Bot passt, damit Sie den gesamten Ablauf üben können.",
  "learn.lesson.practice-game-preparation.step.intro.hint":
    "Nach dem Ablegen von fünf Handkarten und fünf Security-Karten bleiben vierzig Karten je Hauptdeck. Ihr Digi-Egg-Deck ist getrennt.",
  "learn.lesson.practice-game-preparation.step.hatch":
    "Lassen Sie Koromon aus Ihrem Digi-Egg-Deck im leeren Breeding-Bereich schlüpfen.",
  "learn.lesson.practice-game-preparation.step.hatch.hint":
    "Schlüpfen kostet keine Memory und zieht keine Karte. Es beendet die Breeding-Aktion dieses Zuges.",
  "learn.lesson.practice-game-preparation.step.rookie":
    "Digivolvieren Sie Koromon im Breeding-Bereich zu Agumon. Dieser Weg kostet null Memory und zieht eine Karte.",
  "learn.lesson.practice-game-preparation.step.rookie.hint":
    "Nutzen Sie Agumon ST1-03 aus Ihrer Hand und wählen Sie Koromon als Basis.",
  "learn.lesson.practice-game-preparation.step.champion":
    "Digivolvieren Sie das entwickelte Agumon zu Greymon. Bezahlen Sie zwei Memory; nach Abschluss der Verarbeitung erhält der Bot den Zug.",
  "learn.lesson.practice-game-preparation.step.champion.hint":
    "Die Digivolution zieht auch im Breeding-Bereich und im ersten Zug eine Karte. Die Memory wandert von null auf zwei beim Gegner.",
  "learn.lesson.practice-game-preparation.step.move":
    "Warten Sie, bis der Bot passt. Bewegen Sie Greymon in Ihrer nächsten Breeding Phase in den Kampfbereich.",
  "learn.lesson.practice-game-preparation.step.move.hint":
    "Bewegen ist kein neues Ausspielen. Greymon darf nach dem Bewegen in diesem Zug angreifen.",
  "learn.lesson.practice-game-preparation.step.ultimate":
    "Digivolvieren Sie Greymon für drei Memory zu Garudamon. Greymons vererbtes Security Attack +1 gibt Garudamon zwei Checks.",
  "learn.lesson.practice-game-preparation.step.ultimate.hint":
    "Der normale Effekt einer Quelle unterscheidet sich vom vererbten Effekt. Lesen Sie Greymons unteres Effektfeld.",
  "learn.lesson.practice-game-preparation.step.first-checks":
    "Greifen Sie den Spieler mit Garudamon an. Es prüft zwei der fünf Security-Karten des Bots nacheinander.",
  "learn.lesson.practice-game-preparation.step.first-checks.hint":
    "Garudamon hat genügend DP, um diese Security-Battles zu überleben. Dem Bot bleiben drei Security-Karten.",
  "learn.lesson.practice-game-preparation.step.second-attacker":
    "Spielen Sie Biyomon für zwei Memory aus. Dies gibt dem Bot den Zug; bewahren Sie Biyomon für den siegreichen Angriff auf.",
  "learn.lesson.practice-game-preparation.step.second-attacker.hint":
    "Ein frisch ausgespieltes Digimon darf normalerweise in diesem Zug nicht angreifen. Nach dem Passen des Bots ist Biyomon bereit.",
  "learn.lesson.practice-game-preparation.step.clear-security":
    "Greifen Sie in Ihren Zügen mit Garudamon an und passen Sie, wenn es suspendiert ist. Wiederholen Sie dies bis auf null gegnerische Security. Halten Sie Biyomon für den letzten Angriff bereit.",
  "learn.lesson.practice-game-preparation.step.clear-security.hint":
    "Überspringen Sie Breeding, wenn keine Aktion verfügbar ist. Garudamon prüft zwei Karten je Angriff. Ein übriger Check wird nach der letzten Security-Karte nicht zu einem zusätzlichen direkten Treffer.",
  "learn.lesson.practice-game-preparation.step.win":
    "Der Bot hat keine Security. Greifen Sie den Spieler mit Biyomon an, um zu gewinnen.",
  "learn.lesson.practice-game-preparation.step.win.hint":
    "Nach dem Entfernen der Security benötigen Sie weiterhin diesen eigenen Angriff. Biyomon wurde in einem früheren Zug ausgespielt und darf jetzt angreifen.",
  "learn.lesson.practice-rule-checks.title": "Regelprüfungen: ein Digimon bei null DP entfernen",
  "learn.lesson.practice-rule-checks.summary":
    "Reduzieren Sie mit einer gelben Option die DP eines Blockers unter null, beobachten Sie die Regellöschung und gewinnen Sie mit Salamon.",
  "learn.lesson.practice-rule-checks.goal1": "Die Farbanforderung einer Option erfüllen und ihre DP-Reduktion auflösen",
  "learn.lesson.practice-rule-checks.goal2":
    "Eine Regellöschung von einer direkt durch einen Effekt angewiesenen Löschung unterscheiden",
  "learn.lesson.practice-rule-checks.done":
    "Seven Heavens reduzierte Monochromons DP. Eine Regelprüfung löschte es und ermöglichte Salamons siegreichen Angriff.",
  "learn.lesson.practice-rule-checks.step.intro":
    "Der Bot hat keine Security, aber Monochromon kann Salamon blocken. Seven Heavens gibt -10000 DP; die Regeln löschen ein Digimon im Kampfbereich bei null DP oder weniger.",
  "learn.lesson.practice-rule-checks.step.intro.hint":
    "Salamon liefert Gelb für die Farbanforderung. Sie haben neun Memory und die Option kostet sieben.",
  "learn.lesson.practice-rule-checks.step.reduce-dp":
    "Nutzen Sie Seven Heavens von Ihrer Hand und wählen Sie Monochromon des Bots. Bestätigen Sie das Ziel und beobachten Sie, wie es nach der Effektauflösung auf die Ablage geht.",
  "learn.lesson.practice-rule-checks.step.reduce-dp.hint":
    "Die Option reduziert nur DP. Regel 17-1-3-1-1 führt die Löschung aus, wenn die resultierenden DP null oder weniger sind.",
  "learn.lesson.practice-rule-checks.step.win":
    "Der Blocker ist entfernt. Greifen Sie den Spieler mit Salamon an, um zu gewinnen.",
  "learn.lesson.practice-rule-checks.step.win.hint":
    "Salamon befand sich bereits vor diesem Zug im Kampfbereich. Nach der Option bleiben zwei Memory, sodass Ihr Zug weitergeht.",
} satisfies Record<keyof typeof newDrillsEn, string>;
