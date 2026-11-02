import { buildRulePracticeTranslations } from "@/i18n/learn/buildRulePracticeTranslations";
import { learnEs } from "@/i18n/learn/learn.es";
import type { newDrillsEn } from "@/i18n/learn/newDrills.en";

export const battleLessonsEs = {
  ...buildRulePracticeTranslations({ dictionary: learnEs }),
  "learn.lesson.drill-retaliation.title": "Retaliation: elimina a un rival más fuerte",
  "learn.lesson.drill-retaliation.summary":
    "Pierde una batalla con Retaliation para eliminar al Blocker más fuerte y después vencer.",
  "learn.lesson.drill-retaliation.goal1": "Cómo Retaliation elimina al Digimon que ganó la batalla",
  "learn.lesson.drill-retaliation.goal2": "Por qué un atacante pequeño puede eliminar a un defensor mucho más fuerte",
  "learn.lesson.drill-retaliation.done":
    "Candlemon perdió la batalla, eliminó a Monochromon con Retaliation y abrió el ataque ganador.",
  "learn.lesson.drill-retaliation.step.intro":
    "Candlemon tiene 1000 DP y Retaliation. El bot tiene un Monochromon suspendido con 5000 DP y Blocker. Perder esta batalla puede eliminarlo.",
  "learn.lesson.drill-retaliation.step.intro.hint":
    "Retaliation se dispara cuando este Digimon es eliminado tras perder una batalla contra otro Digimon.",
  "learn.lesson.drill-retaliation.step.retaliate":
    "Haz clic en Candlemon, elige Atacar y selecciona al Monochromon suspendido. Deja que se resuelvan la batalla y Retaliation.",
  "learn.lesson.drill-retaliation.step.retaliate.hint":
    "Candlemon pierde por sus DP. Retaliation elimina después a Monochromon por efecto; no es otra batalla.",
  "learn.lesson.drill-retaliation.step.win":
    "Monochromon ya no está y el bot no tiene security. Ataca al jugador con Birdramon para ganar.",
  "learn.lesson.drill-retaliation.step.win.hint":
    "Reserva a Birdramon para el ataque final; no lo sacrifiques en la primera batalla.",
  "learn.lesson.drill-blitz.title": "Blitz: ataca después de cruzar el cero",
  "learn.lesson.drill-blitz.summary":
    "Digievoluciona más allá de cero de memoria y usa Blitz antes de terminar tu turno.",
  "learn.lesson.drill-blitz.goal1": "Por qué cruzar el cero al pagar aún permite los efectos de digievolución",
  "learn.lesson.drill-blitz.goal2": "Cómo Blitz permite atacar mientras el rival tiene memoria",
  "learn.lesson.drill-blitz.done": "BetelGammamon digievolucionó cruzando el cero y ganó con Blitz.",
  "learn.lesson.drill-blitz.step.intro":
    "Tienes 1 de memoria y Biyomon en el campo. BetelGammamon cuesta 2 para digievolucionar y tiene [When Digivolving] Blitz.",
  "learn.lesson.drill-blitz.step.intro.hint":
    "El bot no tiene security. Usa la oferta de Blitz tras pagar; otra acción normal de fase principal llegaría demasiado tarde.",
  "learn.lesson.drill-blitz.step.digivolve":
    "Digievoluciona a Biyomon en el BetelGammamon de tu mano. El pago deja al bot con 1 de memoria.",
  "learn.lesson.drill-blitz.step.digivolve.hint":
    "Digievolucionar cambia el Digimon existente y conserva su permiso para atacar.",
  "learn.lesson.drill-blitz.step.blitz-attack":
    "Acepta Blitz. Ataca al jugador con BetelGammamon para ganar antes de pasar el turno.",
  "learn.lesson.drill-blitz.step.blitz-attack.hint":
    "Blitz permite este ataque mientras el bot tiene memoria. No concede Rush ni endereza al atacante.",
  "learn.lesson.drill-raid.title": "Raid: desafía al Digimon preparado más fuerte",
  "learn.lesson.drill-raid.summary": "Redirige un ataque hacia un Blocker no suspendido con Raid.",
  "learn.lesson.drill-raid.goal1": "Cómo Raid cambia el objetivo de un ataque declarado",
  "learn.lesson.drill-raid.goal2": "Por qué el objetivo debe ser un Digimon rival no suspendido con los DP más altos",
  "learn.lesson.drill-raid.done": "Grizzlymon eliminó a Monochromon con Raid y Birdramon dio el golpe ganador.",
  "learn.lesson.drill-raid.step.intro":
    "Grizzlymon tiene Raid y recibe +1000 DP del Agumon que tiene debajo. El bot tiene un Monochromon no suspendido con 5000 DP.",
  "learn.lesson.drill-raid.step.intro.hint":
    "Normalmente no puedes declarar un ataque contra un Digimon no suspendido. Raid cambia el objetivo después de la declaración.",
  "learn.lesson.drill-raid.step.raid":
    "Ataca al jugador con Grizzlymon. En la selección de Raid, elige a Monochromon como nuevo objetivo.",
  "learn.lesson.drill-raid.step.raid.hint":
    "Grizzlymon tiene 6000 DP y gana. Monochromon es el objetivo no suspendido válido con los DP más altos.",
  "learn.lesson.drill-raid.step.win": "El Blocker ya no está. Ataca al jugador con Birdramon para ganar.",
  "learn.lesson.drill-raid.step.win.hint":
    "Cambiar el objetivo con Raid no produjo un security check; Birdramon realiza un ataque separado.",
  "learn.lesson.drill-collision.title": "Collision: obliga al bot a bloquear",
  "learn.lesson.drill-collision.summary":
    "Obliga a defender a un Digimon sin Blocker impreso y después atraviesa su security.",
  "learn.lesson.drill-collision.goal1": "Cómo Collision concede Blocker a los Digimon rivales durante el ataque",
  "learn.lesson.drill-collision.goal2": "Por qué el defensor debe bloquear si puede",
  "learn.lesson.drill-collision.done":
    "Proganomon obligó a Gomamon a bloquear, atravesó la última security y Birdramon ganó.",
  "learn.lesson.drill-collision.step.intro":
    "Proganomon tiene Collision y Piercing. El bot tiene a Gomamon, sin Blocker impreso, y 1 carta de security.",
  "learn.lesson.drill-collision.step.intro.hint":
    "Collision concede Blocker a los Digimon rivales durante este ataque y obliga al bot a bloquear si puede.",
  "learn.lesson.drill-collision.step.collision":
    "Ataca al jugador con Proganomon. El bot bloquea con Gomamon, pierde la batalla y recibe un security check de Piercing.",
  "learn.lesson.drill-collision.step.collision.hint":
    "El bot no puede rechazar el bloqueo disponible. Proganomon tiene 7000 DP frente a los 3000 DP de Gomamon.",
  "learn.lesson.drill-collision.step.win":
    "El bot no tiene security ni defensor. Ataca al jugador con Birdramon para ganar.",
  "learn.lesson.drill-collision.step.win.hint":
    "Collision forzó la batalla; Piercing permitió el security check después de que Proganomon ganara.",
  "learn.lesson.drill-vortex.title": "Vortex: una última batalla al final del turno",
  "learn.lesson.drill-vortex.summary": "Juega a Galemon y usa Vortex para atacar a un Digimon en ese mismo turno.",
  "learn.lesson.drill-vortex.goal1": "Cómo Vortex crea un ataque al final del turno",
  "learn.lesson.drill-vortex.goal2":
    "Por qué Vortex permite atacar en el turno de entrada, pero normalmente solo a Digimon",
  "learn.lesson.drill-vortex.done":
    "Galemon eliminó a Monochromon con Vortex en su turno de entrada y ganó en el siguiente.",
  "learn.lesson.drill-vortex.step.intro":
    "Galemon tiene Vortex. El bot tiene un Monochromon suspendido y ninguna security. Galemon puede eliminar ese Blocker al final de tu turno.",
  "learn.lesson.drill-vortex.step.intro.hint":
    "Un Digimon recién jugado normalmente no puede atacar este turno. Vortex crea una excepción específica al final del turno.",
  "learn.lesson.drill-vortex.step.play": "Juega a Galemon de tu mano por 6 de memoria.",
  "learn.lesson.drill-vortex.step.play.hint":
    "Tu memoria queda en cero. No intentes un ataque normal: acabas de jugar a Galemon.",
  "learn.lesson.drill-vortex.step.vortex":
    "Pulsa Fin del turno, acepta Vortex y elige al Monochromon suspendido como objetivo.",
  "learn.lesson.drill-vortex.step.vortex.hint":
    "Vortex normalmente no permite elegir al jugador. Los 6000 DP de Galemon superan los 5000 DP de Monochromon.",
  "learn.lesson.drill-vortex.step.opponent-turn":
    "Deja terminar el procesamiento de fin de turno y comenzar el turno del bot.",
  "learn.lesson.drill-vortex.step.opponent-turn.hint":
    "El ataque de la keyword ocurre antes del cambio real de turno. Después, el bot pasa.",
  "learn.lesson.drill-vortex.step.your-turn": "Espera a que el bot pase y comience tu siguiente fase principal.",
  "learn.lesson.drill-vortex.step.your-turn.hint":
    "Galemon se endereza al comienzo de tu turno y ya no es un Digimon jugado este turno.",
  "learn.lesson.drill-vortex.step.win": "Ataca normalmente al jugador con Galemon para ganar.",
  "learn.lesson.drill-vortex.step.win.hint":
    "Es un ataque normal de fase principal; no utiliza la restricción de Vortex de atacar solo a Digimon.",
  "learn.lesson.drill-overclock.title": "Overclock: ataca otra vez sin enderezarte",
  "learn.lesson.drill-overclock.summary":
    "Sacrifica un Puppet para que ShoeShoemon suspendido ataque al final del turno.",
  "learn.lesson.drill-overclock.goal1": "Cómo Overclock se paga eliminando a otro Digimon especificado",
  "learn.lesson.drill-overclock.goal2": "Por qué un Digimon suspendido puede realizar un ataque que no lo suspende",
  "learn.lesson.drill-overclock.done":
    "ShoeShoemon chequeó security, eliminó a Shoemon para Overclock y volvió a atacar sin enderezarse.",
  "learn.lesson.drill-overclock.step.intro":
    "ShoeShoemon tiene Overclock para el rasgo Puppet. Shoemon es otro Puppet jugado este turno; resérvalo como pago.",
  "learn.lesson.drill-overclock.step.intro.hint":
    "Overclock ataca a un jugador sin suspender, incluso si ShoeShoemon ya está suspendido.",
  "learn.lesson.drill-overclock.step.clear-security":
    "Ataca al jugador con ShoeShoemon para retirar la última security.",
  "learn.lesson.drill-overclock.step.clear-security.hint":
    "ShoeShoemon sigue suspendido tras este ataque. No omitas la siguiente oferta de keyword.",
  "learn.lesson.drill-overclock.step.overclock":
    "Pulsa Fin del turno y acepta Overclock. Tu único Puppet válido, Shoemon, se elimina como pago. Después elige al jugador como objetivo para ganar.",
  "learn.lesson.drill-overclock.step.overclock.hint":
    "Paga con Shoemon, no con ShoeShoemon. Tras pagar, el ataque al jugador es obligatorio y no exige enderezarse.",
  "learn.lesson.drill-iceclad.title": "Iceclad: gana con más fuentes",
  "learn.lesson.drill-iceclad.summary":
    "Vence a un Digimon de 12000 DP comparando la cantidad de cartas de digievolución.",
  "learn.lesson.drill-iceclad.goal1": "Cómo Iceclad sustituye la comparación de DP en una batalla entre Digimon",
  "learn.lesson.drill-iceclad.goal2": "Por qué las batallas de security siguen comparando DP",
  "learn.lesson.drill-iceclad.done":
    "Las dos fuentes de PolarBearmon superaron las cero de WarGreymon pese a tener menos DP, y Birdramon ganó.",
  "learn.lesson.drill-iceclad.step.intro":
    "PolarBearmon tiene 7000 DP, Iceclad y 2 cartas de digievolución. WarGreymon suspendido tiene 12000 DP, pero ninguna carta de digievolución.",
  "learn.lesson.drill-iceclad.step.intro.hint":
    "Iceclad compara fuentes en lugar de DP fuera de las batallas de security. Más fuentes gana; un empate hace perder a ambos.",
  "learn.lesson.drill-iceclad.step.iceclad":
    "Ataca al WarGreymon suspendido con PolarBearmon. Deja resolver la batalla de Iceclad.",
  "learn.lesson.drill-iceclad.step.iceclad.hint":
    "Compara 2 fuentes contra 0, no 7000 DP contra 12000 DP. PolarBearmon gana y sobrevive.",
  "learn.lesson.drill-iceclad.step.win":
    "WarGreymon ya no está y el bot no tiene security. Ataca al jugador con Birdramon para ganar.",
  "learn.lesson.drill-iceclad.step.win.hint":
    "Un Security Digimon seguiría luchando con sus DP; la comparación de fuentes de Iceclad no se aplica.",
  "learn.lesson.drill-execute.title": "Execute: sacrifica al atacante para romper la defensa",
  "learn.lesson.drill-execute.summary":
    "Ataca a un Blocker no suspendido al final del turno y después acepta la eliminación de tu atacante.",
  "learn.lesson.drill-execute.goal1": "Cómo Execute permite atacar a un Digimon no suspendido al final del turno",
  "learn.lesson.drill-execute.goal2": "Por qué el atacante se elimina al terminar ese ataque",
  "learn.lesson.drill-execute.done":
    "Phantomon venció a Monochromon con Execute y fue eliminado; Birdramon ganó en tu siguiente turno.",
  "learn.lesson.drill-execute.step.intro":
    "Phantomon tiene Execute y 7000 DP. El Monochromon no suspendido del bot tiene 5000 DP y bloquearía a Birdramon.",
  "learn.lesson.drill-execute.step.intro.hint":
    "Execute permite a Phantomon atacar al final de tu turno, incluso a un Digimon rival no suspendido. Será eliminado al terminar el ataque.",
  "learn.lesson.drill-execute.step.execute":
    "Pulsa Fin del turno, acepta Execute y elige a Monochromon. Deja terminar la batalla y la eliminación de Phantomon.",
  "learn.lesson.drill-execute.step.execute.hint":
    "No elijas al jugador: el objetivo es eliminar al Blocker. La eliminación aplazada de Execute ocurre aunque Phantomon gane la batalla.",
  "learn.lesson.drill-execute.step.opponent-turn":
    "Deja terminar el procesamiento de fin de turno y comenzar el turno del bot.",
  "learn.lesson.drill-execute.step.opponent-turn.hint":
    "El ataque de la keyword ocurre antes del cambio real de turno. Después, el bot pasa.",
  "learn.lesson.drill-execute.step.your-turn":
    "Espera a que el bot pase y tu siguiente turno llegue a la fase principal.",
  "learn.lesson.drill-execute.step.your-turn.hint": "Birdramon sigue preparado y ya no hay Blocker.",
  "learn.lesson.drill-execute.step.win": "Ataca al jugador con Birdramon para ganar.",
  "learn.lesson.drill-execute.step.win.hint":
    "El bot no tiene security. El sacrificio de Phantomon eliminó su defensa.",
  "learn.lesson.drill-progress.title": "Progress: resiste un efecto de security al atacar",
  "learn.lesson.drill-progress.summary": "Ataca a través de Cocytus Breath y conserva tu Digimon con Progress.",
  "learn.lesson.drill-progress.goal1": "Cómo Progress protege al atacante de los efectos rivales",
  "learn.lesson.drill-progress.goal2": "Por qué Progress no evita todas las derrotas en batalla",
  "learn.lesson.drill-progress.done":
    "Dimetromon ignoró el efecto de security mientras atacaba y volvió a atacar al siguiente turno para ganar.",
  "learn.lesson.drill-progress.step.intro":
    "Dimetromon tiene Progress: los efectos rivales no le afectan mientras ataca. La última security del bot es Cocytus Breath.",
  "learn.lesson.drill-progress.step.intro.hint":
    "Cocytus Breath normalmente devuelve un Digimon rival a la mano. Progress protege a este atacante durante ese efecto.",
  "learn.lesson.drill-progress.step.progress":
    "Ataca al jugador con Dimetromon. Observa cómo Cocytus Breath se resuelve sin devolver tu atacante a la mano.",
  "learn.lesson.drill-progress.step.progress.hint":
    "La protección actúa contra efectos rivales durante el ataque. No evita la eliminación normal en batalla por un Security Digimon más fuerte.",
  "learn.lesson.drill-progress.step.end-turn": "Dimetromon sigue en el campo. Pulsa Fin del turno.",
  "learn.lesson.drill-progress.step.end-turn.hint": "El bot no tiene Digimon para atacarte.",
  "learn.lesson.drill-progress.step.your-turn": "Espera tu próxima fase principal.",
  "learn.lesson.drill-progress.step.your-turn.hint": "Dimetromon se endereza al comienzo de tu turno.",
  "learn.lesson.drill-progress.step.win": "Ataca al jugador con Dimetromon para ganar.",
  "learn.lesson.drill-progress.step.win.hint": "Sin Progress, tu único atacante habría vuelto a la mano.",
  "learn.lesson.drill-engage.title": "Engage: ataca durante el final del turno",
  "learn.lesson.drill-engage.summary": "Mantén preparado a tu Digimon y acepta un ataque de Engage después de pasar.",
  "learn.lesson.drill-engage.goal1": "Cómo Engage se dispara al final de tu turno",
  "learn.lesson.drill-engage.goal2": "Por qué el ataque se resuelve antes del turno rival",
  "learn.lesson.drill-engage.done":
    "WarGrowlmon usó Engage para atacar durante el procesamiento de fin de turno y ganar.",
  "learn.lesson.drill-engage.step.intro":
    "WarGrowlmon tiene Engage y el bot no tiene security. Ganarás usando su keyword de fin de turno en vez de un ataque normal de fase principal.",
  "learn.lesson.drill-engage.step.intro.hint":
    "Engage es opcional. Su ataque debe estar permitido por las reglas cuando se resuelve el efecto.",
  "learn.lesson.drill-engage.step.keep-ready":
    "Mantén a WarGrowlmon no suspendido para usar Engage. Continúa cuando quieras pasar.",
  "learn.lesson.drill-engage.step.keep-ready.hint":
    "Engage no endereza al Digimon ni elimina la espera normal para atacar de uno recién jugado.",
  "learn.lesson.drill-engage.step.engage":
    "Pulsa Fin del turno, acepta Engage y elige al jugador como objetivo para ganar.",
  "learn.lesson.drill-engage.step.engage.hint":
    "Pasar da 3 de memoria al bot, pero Engage y su ataque se resuelven antes de que comience su turno.",
  "learn.lesson.drill-barrier.title": "Barrier: paga security para conservar tu Digimon",
  "learn.lesson.drill-barrier.summary": "Protege a Angemon de una batalla de security perdida y después gana con él.",
  "learn.lesson.drill-barrier.goal1": "Cómo Barrier impide la eliminación en batalla",
  "learn.lesson.drill-barrier.goal2": "Por qué pagar una security no equivale a chequearla",
  "learn.lesson.drill-barrier.done": "Angemon pagó una security por Barrier, sobrevivió y ganó al siguiente turno.",
  "learn.lesson.drill-barrier.step.intro":
    "Angemon tiene 4000 DP y Barrier. La última security del bot es Ikkakumon con 5000 DP, por lo que Angemon perderá la batalla.",
  "learn.lesson.drill-barrier.step.intro.hint":
    "Tienes 1 security para pagar Barrier y evitar la eliminación de Angemon en batalla.",
  "learn.lesson.drill-barrier.step.barrier":
    "Ataca al jugador con Angemon. Cuando aparezca Barrier, acepta descartar tu security superior para conservarlo.",
  "learn.lesson.drill-barrier.step.barrier.hint":
    "Barrier impide esta eliminación en batalla. La security descartada es un pago y no activa su efecto Security.",
  "learn.lesson.drill-barrier.step.end-turn":
    "Angemon sobrevivió y ambos jugadores están sin security. Pulsa Fin del turno.",
  "learn.lesson.drill-barrier.step.end-turn.hint":
    "El bot no tiene Digimon en el campo, por lo que aquí es seguro pasar.",
  "learn.lesson.drill-barrier.step.your-turn": "Espera tu próxima fase principal.",
  "learn.lesson.drill-barrier.step.your-turn.hint": "Angemon se endereza al comienzo de tu turno.",
  "learn.lesson.drill-barrier.step.win": "Ataca al jugador con Angemon para ganar.",
  "learn.lesson.drill-barrier.step.win.hint":
    "Barrier conservó al único atacante que necesitabas para dar este golpe final.",
  "learn.lesson.drill-training.title": "Training: construye la fuente que gana una batalla",
  "learn.lesson.drill-training.summary":
    "Entrena a Greymon para que su próximo ataque gane suficientes DP contra un Blocker.",
  "learn.lesson.drill-training.goal1":
    "Cómo Training suspende un Digimon y coloca el tope del deck boca abajo debajo de él",
  "learn.lesson.drill-training.goal2": "Cómo fuentes boca abajo adicionales potencian otros efectos de una carta",
  "learn.lesson.drill-training.done":
    "Greymon añadió una fuente boca abajo con Training y otra al atacar; venció al Blocker con 7000 DP y Dracomon ganó.",
  "learn.lesson.drill-training.step.intro":
    "Greymon tiene Training y 5000 DP. Grizzlymon del bot tiene 6000 DP y Blocker. Training puede añadir la fuente que Greymon necesita para ganar esa batalla.",
  "learn.lesson.drill-training.step.intro.hint":
    "El efecto de ataque de Greymon da +1000 DP por cada fuente boca abajo. Una carta entrenada boca abajo no aporta su efecto heredado impreso.",
  "learn.lesson.drill-training.step.train":
    "Haz clic en Greymon y activa Training. Se suspende y coloca el tope de tu deck boca abajo al fondo de sus cartas de digievolución.",
  "learn.lesson.drill-training.step.train.hint":
    "Training no cuesta memoria. Mantén la carta boca abajo: no se pueden consultar su nombre, color ni efectos impresos.",
  "learn.lesson.drill-training.step.end-turn": "Pulsa Fin del turno para preparar a Greymon en tu siguiente turno.",
  "learn.lesson.drill-training.step.end-turn.hint": "En este ejercicio el bot pasará sin atacar.",
  "learn.lesson.drill-training.step.your-turn":
    "Espera tu fase principal. Greymon se endereza y conserva la fuente de Training.",
  "learn.lesson.drill-training.step.your-turn.hint":
    "La fuente de Training permanece en la pila entre turnos; no es un bono temporal de DP.",
  "learn.lesson.drill-training.step.battle":
    "Ataca al jugador con Greymon. Acepta su [When Attacking] para colocar otra carta del deck boca abajo y ganar DP. El bot bloqueará con Grizzlymon.",
  "learn.lesson.drill-training.step.battle.hint":
    "Dos fuentes boca abajo dan +2000 DP: 7000 vence a 6000. Sin Training previo, una fuente daría solo 6000 DP y ambos Digimon perderían.",
  "learn.lesson.drill-training.step.win": "Tras eliminar al Blocker, ataca al jugador con Dracomon para ganar.",
  "learn.lesson.drill-training.step.win.hint":
    "Reserva a Dracomon para el ataque final. Training creó la fuente extra que permitió a Greymon romper la defensa.",
  "learn.lesson.drill-decoy.title": "Decoy: salva a un aliado",
  "learn.lesson.drill-decoy.summary": "Sacrifica a Machmon para proteger a BigMamemon de Gaia Force del bot.",
  "learn.lesson.drill-decoy.goal1": "A qué Digimon puede proteger Decoy",
  "learn.lesson.drill-decoy.goal2": "Paga con el portador de Decoy y después contraataca",
  "learn.lesson.drill-decoy.done": "Machmon pagó Decoy, BigMamemon sobrevivió y el Digimon salvado ganó.",
  "learn.lesson.drill-decoy.step.intro":
    "Decoy (Black) permite a Machmon eliminarse cuando otro de tus Digimon negros sería eliminado por un efecto rival. El bot va a usar Gaia Force contra tu único otro Digimon, BigMamemon.",
  "learn.lesson.drill-decoy.step.intro.hint":
    "Regla 16-18. Protege a otro Digimon válido; Machmon no puede salvarse a sí mismo con Decoy.",
  "learn.lesson.drill-decoy.step.react":
    "Cuando aparezca Decoy, acepta la protección de Machmon. Si debes elegir una protección, elige su Decoy.",
  "learn.lesson.drill-decoy.step.react.hint":
    "Machmon va al trash como pago. BigMamemon permanece en batalla en vez de ser eliminado.",
  "learn.lesson.drill-decoy.step.your-turn":
    "Espera a que el bot termine su turno. BigMamemon sobrevivirá preparado para atacar.",
  "learn.lesson.drill-decoy.step.your-turn.hint":
    "El Agumon rival solo aporta el color de Gaia Force; este bot guiado pasará ahora.",
  "learn.lesson.drill-decoy.step.attack-player":
    "Haz clic en BigMamemon, elige Atacar y apunta a la security vacía del rival para ganar.",
  "learn.lesson.drill-decoy.step.attack-player.hint": "Es el mismo BigMamemon que protegió Decoy.",
  "learn.lesson.drill-armor-purge.title": "Armor Purge: despréndete de la carta superior",
  "learn.lesson.drill-armor-purge.summary":
    "Descarta a Quetzalmon para conservar a Gabumon en juego en vez de perder el Digimon entero.",
  "learn.lesson.drill-armor-purge.goal1": "Descarta la carta superior para impedir la eliminación",
  "learn.lesson.drill-armor-purge.goal2": "Ataca con el Digimon que queda debajo",
  "learn.lesson.drill-armor-purge.done": "Quetzalmon fue descartado, Gabumon sobrevivió a la retirada y ganó.",
  "learn.lesson.drill-armor-purge.step.intro":
    "Quetzalmon tiene Armor Purge y Gabumon debajo. Cuando Gaia Force lo eliminaría, Armor Purge puede descartar solo la carta superior para impedir esa eliminación.",
  "learn.lesson.drill-armor-purge.step.intro.hint":
    "Regla 16-19. Descarta la armadura; no elimina ambas cartas de la pila.",
  "learn.lesson.drill-armor-purge.step.react": "Acepta Armor Purge cuando Gaia Force del bot amenace a Quetzalmon.",
  "learn.lesson.drill-armor-purge.step.react.hint":
    "Quetzalmon va al trash. Gabumon queda expuesto y sigue siendo el mismo Digimon en el campo.",
  "learn.lesson.drill-armor-purge.step.your-turn": "Espera tu fase principal. Gabumon sobrevivió y podrá atacar.",
  "learn.lesson.drill-armor-purge.step.your-turn.hint":
    "Armor Purge impidió esta eliminación; no da protección permanente contra efectos posteriores.",
  "learn.lesson.drill-armor-purge.step.attack-player":
    "Haz clic en Gabumon, elige Atacar y apunta a la security vacía del rival.",
  "learn.lesson.drill-armor-purge.step.attack-player.hint": "La carta que sobrevivió debajo aporta el ataque ganador.",
  "learn.lesson.drill-save.title": "Save: conserva un recurso bajo un Tamer",
  "learn.lesson.drill-save.summary":
    "Salva a Shoutmon y reutiliza esa misma carta para crear un Digimon con Rush y ganar.",
  "learn.lesson.drill-save.goal1": "Salva la carta eliminada bajo tu Tamer",
  "learn.lesson.drill-save.goal2": "Reutiliza una carta salvada como material de DigiXros",
  "learn.lesson.drill-save.done":
    "El Shoutmon salvado se convirtió en fuente de King Version y le dio Rush para ganar.",
  "learn.lesson.drill-save.step.intro":
    "Gaia Force eliminará a Shoutmon. Su On Deletion Save puede colocarlo bajo Taiki en vez de dejarlo en el trash. Tienes a Shoutmon (King Version) en la mano para usarlo en DigiXros.",
  "learn.lesson.drill-save.step.intro.hint":
    "Regla 16-20. Save conserva la carta como recurso; no impide la eliminación de Shoutmon.",
  "learn.lesson.drill-save.step.react":
    "Resuelve el On Deletion de Shoutmon y acepta Save. Elige a Taiki Kudo como Tamer receptor si se solicita.",
  "learn.lesson.drill-save.step.react.hint": "Shoutmon debe quedar bajo Taiki, sin Digimon en tu área de batalla.",
  "learn.lesson.drill-save.step.your-turn":
    "Espera tu fase principal. Tendrás 3 de memoria para reutilizar al Shoutmon salvado.",
  "learn.lesson.drill-save.step.your-turn.hint":
    "Taiki puede suspenderse para permitir materiales de DigiXros bajo tus Tamers.",
  "learn.lesson.drill-save.step.reuse":
    "Elige a Shoutmon (King Version) de tu mano y DigiXros. Selecciona a Taiki como Tamer a suspender y al Shoutmon salvado bajo él como material; confirma.",
  "learn.lesson.drill-save.step.reuse.hint":
    "Un material reduce el coste de 5 a 3. El heredado de Shoutmon concede Rush a este Digimon con Shoutmon en su nombre.",
  "learn.lesson.drill-save.step.attack-player": "Ataca la security vacía del rival con Shoutmon (King Version).",
  "learn.lesson.drill-save.step.attack-player.hint":
    "Sin la fuente salvada, este Digimon recién jugado no tendría el Rush heredado para atacar ahora.",
  "learn.lesson.drill-material-save.title": "Material Save: rescata las fuentes",
  "learn.lesson.drill-material-save.summary":
    "Salva ambos materiales de DigiXros y reconstruye a MetalGreymon para ganar con Rush.",
  "learn.lesson.drill-material-save.goal1": "Rescata los materiales especificados de una pila eliminada",
  "learn.lesson.drill-material-save.goal2": "Paga menos reutilizando las dos cartas rescatadas",
  "learn.lesson.drill-material-save.done":
    "Los materiales rescatados reconstruyeron a MetalGreymon por 3 de memoria y su ataque con Rush ganó.",
  "learn.lesson.drill-material-save.step.intro":
    "MetalGreymon tiene a Greymon y MailBirdramon debajo. Gaia Force va a eliminarlo. Material Save 2 puede colocar esos materiales especificados de DigiXros bajo Kiriha.",
  "learn.lesson.drill-material-save.step.intro.hint":
    "Regla 16-21. Salva fuentes válidas, no al propio MetalGreymon eliminado.",
  "learn.lesson.drill-material-save.step.react":
    "Acepta Material Save 2. Elige a Greymon y MailBirdramon y colócalos bajo Kiriha Aonuma cuando se solicite.",
  "learn.lesson.drill-material-save.step.react.hint":
    "Usa ambas fuentes válidas. MetalGreymon va al trash y sus materiales sobreviven bajo Kiriha.",
  "learn.lesson.drill-material-save.step.your-turn":
    "Espera tu fase principal. Tienes otro MetalGreymon en la mano y 3 de memoria.",
  "learn.lesson.drill-material-save.step.your-turn.hint":
    "Kiriha puede suspenderse para permitir materiales bajo tus Tamers durante DigiXros.",
  "learn.lesson.drill-material-save.step.reuse":
    "Elige al MetalGreymon de la mano y DigiXros. Selecciona a Kiriha para suspenderlo y ambos materiales salvados bajo él; confirma y resuelve las elecciones de On Play.",
  "learn.lesson.drill-material-save.step.reuse.hint":
    "Dos materiales reducen el coste de 7 a 3. Su On Play concede Rush y permite atacar inmediatamente al Digimon reconstruido.",
  "learn.lesson.drill-material-save.step.attack-player":
    "Ataca la security vacía del rival con el MetalGreymon reconstruido.",
  "learn.lesson.drill-material-save.step.attack-player.hint":
    "Las dos cartas rescatadas hicieron asequible el coste. Rush permite que este nuevo Digimon termine la partida.",
  "learn.lesson.drill-evade.title": "Evade: suspende para sobrevivir",
  "learn.lesson.drill-evade.summary": "Usa Evade contra Gaia Force, después endereza y gana en tu turno.",
  "learn.lesson.drill-evade.goal1": "Paga suspendiendo al Digimon amenazado",
  "learn.lesson.drill-evade.goal2": "Conserva tu atacante frente a la retirada rival",
  "learn.lesson.drill-evade.done": "Syakomon se suspendió para evitar la eliminación, después se enderezó y ganó.",
  "learn.lesson.drill-evade.step.intro":
    "Syakomon tiene Evade. Cuando Gaia Force lo eliminaría, puedes suspenderlo para impedirlo. Debe poder suspenderse para pagar.",
  "learn.lesson.drill-evade.step.intro.hint": "Regla 16-22. Syakomon está no suspendido y es tu único atacante.",
  "learn.lesson.drill-evade.step.react":
    "Cuando aparezca Evade, acéptalo. Syakomon se suspende y sobrevive a Gaia Force.",
  "learn.lesson.drill-evade.step.react.hint":
    "Un Digimon suspendido no podría volver a pagar esta condición. Se impide esta eliminación; no es inmunidad.",
  "learn.lesson.drill-evade.step.your-turn":
    "Espera a que el bot pase. Syakomon se endereza en tu siguiente fase de enderezar.",
  "learn.lesson.drill-evade.step.your-turn.hint": "Gaia Force está en el trash rival y Syakomon sigue en el campo.",
  "learn.lesson.drill-evade.step.attack-player":
    "Haz clic en Syakomon, elige Atacar y apunta a la security vacía del rival.",
  "learn.lesson.drill-evade.step.attack-player.hint": "El Digimon que evitó la eliminación es tu atacante ganador.",
  "learn.lesson.drill-fortitude.title": "Fortitude: vuelve tras la eliminación",
  "learn.lesson.drill-fortitude.summary": "Vuelve a jugar a Aquilamon tras Gaia Force y gana con su nueva vida.",
  "learn.lesson.drill-fortitude.goal1": "Fortitude exige una fuente al ser eliminado",
  "learn.lesson.drill-fortitude.goal2": "Un Digimon jugado de nuevo es un Digimon nuevo",
  "learn.lesson.drill-fortitude.done": "Aquilamon volvió sin su fuente y ganó en tu siguiente turno.",
  "learn.lesson.drill-fortitude.step.intro":
    "Aquilamon tiene Fortitude y Kunemon debajo. Si es eliminado con una fuente, Fortitude vuelve a jugar a Aquilamon sin pagar su coste.",
  "learn.lesson.drill-fortitude.step.intro.hint":
    "Regla 16-27. No impide la eliminación. El Digimon que vuelve es nuevo y sus fuentes anteriores quedan en el trash.",
  "learn.lesson.drill-fortitude.step.react":
    "Deja que Gaia Force elimine a Aquilamon. Resuelve Fortitude; confirma el efecto obligatorio si lo pide el panel de disparos.",
  "learn.lesson.drill-fortitude.step.react.hint":
    "Aquilamon vuelve sin fuentes y con una nueva identidad en el campo. Kunemon queda en el trash.",
  "learn.lesson.drill-fortitude.step.your-turn":
    "Espera tu turno. Aquilamon volvió durante el turno del bot y podrá atacar en el tuyo.",
  "learn.lesson.drill-fortitude.step.your-turn.hint":
    "Sin una fuente, una eliminación posterior no dispararía otra vez este Fortitude.",
  "learn.lesson.drill-fortitude.step.attack-player": "Ataca la security vacía del rival con el Aquilamon que volvió.",
  "learn.lesson.drill-fortitude.step.attack-player.hint":
    "Ganaste con la carta que Fortitude trajo de vuelta, no con el permanente original.",
  "learn.lesson.drill-partition.title": "Partition: divídete en dos Digimon",
  "learn.lesson.drill-partition.summary": "Convierte una eliminación rival en dos Digimon de nivel 4 en juego.",
  "learn.lesson.drill-partition.goal1": "Son necesarias las dos fuentes especificadas",
  "learn.lesson.drill-partition.goal2": "Juega ambas partes antes de que salga la carta superior",
  "learn.lesson.drill-partition.done": "Paildramon se dividió en Ikkakumon y Togemon, e Ikkakumon ganó.",
  "learn.lesson.drill-partition.step.intro":
    "Paildramon tiene Partition (nivel 4 azul y nivel 4 verde). Ikkakumon y Togemon debajo cumplen los requisitos. Gaia Force intentará retirar a Paildramon.",
  "learn.lesson.drill-partition.step.intro.hint":
    "Regla 16-29. Partition funciona contra efectos rivales, no contra retirada en batalla ni tus propios efectos.",
  "learn.lesson.drill-partition.step.react":
    "Acepta Partition. Elige al Ikkakumon azul y al Togemon verde para jugar ambos sin pagar.",
  "learn.lesson.drill-partition.step.react.hint":
    "Debes jugar uno de cada categoría exigida. Paildramon sigue saliendo; Partition no impide su eliminación.",
  "learn.lesson.drill-partition.step.your-turn":
    "Espera tu fase principal. Las dos fuentes ahora son Digimon separados.",
  "learn.lesson.drill-partition.step.your-turn.hint":
    "Entraron durante el turno rival y podrán atacar cuando llegue el tuyo.",
  "learn.lesson.drill-partition.step.attack-player": "Ataca la security vacía del rival con Ikkakumon.",
  "learn.lesson.drill-partition.step.attack-player.hint":
    "También puedes inspeccionar a Togemon: ambas fuentes se jugaron mediante el mismo Partition.",
  "learn.lesson.drill-scapegoat.title": "Scapegoat: sacrifica a un aliado",
  "learn.lesson.drill-scapegoat.summary": "Elimina a Agumon para que Bastemon sobreviva a Gaia Force del bot.",
  "learn.lesson.drill-scapegoat.goal1": "Elige a otro Digimon como pago",
  "learn.lesson.drill-scapegoat.goal2": "Impide la eliminación del Digimon amenazado",
  "learn.lesson.drill-scapegoat.done": "Agumon pagó Scapegoat y Bastemon sobrevivió para ganar.",
  "learn.lesson.drill-scapegoat.step.intro":
    "Bastemon tiene Scapegoat. Si sería eliminado sin ser por tus propios efectos, puede eliminar a otro de tus Digimon para impedirlo. Agumon está disponible como pago.",
  "learn.lesson.drill-scapegoat.step.intro.hint":
    "Regla 16-32. Salvas a Bastemon sacrificando un Digimon distinto, no al propio Bastemon.",
  "learn.lesson.drill-scapegoat.step.react": "Acepta Scapegoat y elige a tu Agumon como Digimon a eliminar.",
  "learn.lesson.drill-scapegoat.step.react.hint": "Agumon va al trash y Bastemon permanece. No rechaces la protección.",
  "learn.lesson.drill-scapegoat.step.your-turn": "Espera tu turno tras la resolución de Gaia Force y el pase del bot.",
  "learn.lesson.drill-scapegoat.step.your-turn.hint": "Bastemon sigue siendo el mismo Digimon y podrá atacar.",
  "learn.lesson.drill-scapegoat.step.attack-player": "Ataca la security vacía del rival con Bastemon.",
  "learn.lesson.drill-scapegoat.step.attack-player.hint": "El sacrificio conservó tu Digimon más fuerte para ganar.",
  "learn.lesson.drill-decode.title": "Decode: juega una fuente antes de salir",
  "learn.lesson.drill-decode.summary":
    "Salva a Sistermon Blanc de la pila cuando su forma despertada vuelva a la mano.",
  "learn.lesson.drill-decode.goal1": "Decode responde a una salida que no es por batalla",
  "learn.lesson.drill-decode.goal2": "Juega la fuente especificada sin pagar",
  "learn.lesson.drill-decode.done": "Sistermon Blanc salió de la pila mediante Decode y realizó el ataque ganador.",
  "learn.lesson.drill-decode.step.intro":
    "Sistermon Blanc (Awakened) tiene Decode (Sistermon Blanc) y esa carta de nombre exacto debajo. Cocytus Breath del bot devolverá la carta despertada a tu mano.",
  "learn.lesson.drill-decode.step.intro.hint":
    "Regla 16-36. Decode responde a este retorno porque no es retirada por batalla.",
  "learn.lesson.drill-decode.step.react":
    "Acepta Decode y elige a Sistermon Blanc entre las fuentes. Resuelve su On Play Draw 1 si se solicita.",
  "learn.lesson.drill-decode.step.react.hint":
    "Blanc se juega como Digimon separado. La carta despertada vuelve a tu mano: Decode no impide esa salida.",
  "learn.lesson.drill-decode.step.your-turn":
    "Espera tu fase principal. La Sistermon Blanc jugada por Decode es ahora tu único Digimon.",
  "learn.lesson.drill-decode.step.your-turn.hint": "Fue jugada durante el turno del bot y puede atacar en el tuyo.",
  "learn.lesson.drill-decode.step.attack-player": "Ataca la security vacía del rival con Sistermon Blanc.",
  "learn.lesson.drill-decode.step.attack-player.hint":
    "Sin Decode, la fuente habría sido descartada cuando saliera la pila.",
  "learn.lesson.drill-fragment.title": "Fragment: paga con tus fuentes",
  "learn.lesson.drill-fragment.summary": "Descarta dos fuentes para que Giromon sobreviva a Gaia Force.",
  "learn.lesson.drill-fragment.goal1": "Fragment exige la cantidad completa de fuentes indicada",
  "learn.lesson.drill-fragment.goal2": "Impide la eliminación pagando exactamente dos cartas",
  "learn.lesson.drill-fragment.done": "Giromon pagó Fragment 2 con sus dos fuentes, sobrevivió y ganó.",
  "learn.lesson.drill-fragment.step.intro":
    "Giromon tiene Fragment (2), con Jazamon y Jazardmon debajo. Cuando Gaia Force lo eliminaría, Fragment puede descartar dos fuentes para impedirlo.",
  "learn.lesson.drill-fragment.step.intro.hint":
    "Regla 16-37. Una fuente no basta; Giromon tiene exactamente las dos necesarias.",
  "learn.lesson.drill-fragment.step.react":
    "Acepta Fragment y selecciona a Jazamon y Jazardmon como fuentes a descartar.",
  "learn.lesson.drill-fragment.step.react.hint":
    "Giromon permanece en juego sin fuentes. Las dos cartas elegidas van al trash.",
  "learn.lesson.drill-fragment.step.your-turn": "Espera tu fase principal después de que pase el bot.",
  "learn.lesson.drill-fragment.step.your-turn.hint":
    "Giromon sobrevivió a esta eliminación, pero no tiene fuentes para pagar Fragment otra vez.",
  "learn.lesson.drill-fragment.step.attack-player": "Ataca la security vacía del rival con Giromon.",
  "learn.lesson.drill-fragment.step.attack-player.hint":
    "El mismo Giromon que pagó Fragment realiza el ataque ganador.",
  "learn.lesson.drill-guard.title": "Guard: protege frente a un retorno",
  "learn.lesson.drill-guard.summary":
    "Sacrifica a Gladimon para que Cocytus Breath no devuelva a BigMamemon a la mano.",
  "learn.lesson.drill-guard.goal1": "Guard protege a otro Digimon frente a la retirada rival",
  "learn.lesson.drill-guard.goal2": "También se puede impedir un retorno a la mano",
  "learn.lesson.drill-guard.done": "Gladimon pagó Guard para impedir el retorno y BigMamemon permaneció para ganar.",
  "learn.lesson.drill-guard.step.intro":
    "Gladimon tiene Guard. Si otro de tus Digimon saldría de batalla por efecto rival, Gladimon puede eliminarse para impedirlo. El bot apuntará a BigMamemon con Cocytus Breath.",
  "learn.lesson.drill-guard.step.intro.hint":
    "Regla 16-45. A diferencia de proteger solo contra eliminación, Guard también impide este retorno a la mano.",
  "learn.lesson.drill-guard.step.react":
    "Acepta Guard de Gladimon cuando se ofrezca. Si debes ordenar reacciones, elige Guard.",
  "learn.lesson.drill-guard.step.react.hint":
    "Gladimon se elimina como pago. BigMamemon permanece en batalla en vez de entrar en tu mano.",
  "learn.lesson.drill-guard.step.your-turn":
    "Espera tu turno tras el pase del bot. Resuelve cualquier oferta de On Deletion de Gladimon que aparezca.",
  "learn.lesson.drill-guard.step.your-turn.hint":
    "Gabumon del bot ya es nivel 3 y no tiene fuentes, así que Gladimon no puede retirar su carta superior.",
  "learn.lesson.drill-guard.step.attack-player": "Ataca la security vacía del rival con BigMamemon.",
  "learn.lesson.drill-guard.step.attack-player.hint": "Guard conservó en el campo a tu único atacante restante.",
  "learn.lesson.drill-digisorption.title": "Digisorption: suspende para ahorrar memoria",
  "learn.lesson.drill-digisorption.summary":
    "Digievoluciona a Pistmon por 1 de memoria suspendiendo a Kunemon y después ataca con Pistmon.",
  "learn.lesson.drill-digisorption.goal1": "Paga la suspensión exigida por Digisorption",
  "learn.lesson.drill-digisorption.goal2": "Mantén preparado para atacar al Digimon que evoluciona",
  "learn.lesson.drill-digisorption.done": "Pagaste Digisorption y ganaste con Pistmon no suspendido.",
  "learn.lesson.drill-digisorption.step.intro":
    "Solo tienes 1 de memoria. Pistmon tiene Digisorption -2: digievolucionar normalmente cuesta 3, pero suspender otro Digimon lo reduce a 1 y mantiene tu turno.",
  "learn.lesson.drill-digisorption.step.intro.hint":
    "Suspende a Kunemon en vez de Lighdramon para mantener preparado al atacante.",
  "learn.lesson.drill-digisorption.step.digivolve":
    "Digievoluciona a Lighdramon en Pistmon. Acepta Digisorption y elige a Kunemon para suspenderlo.",
  "learn.lesson.drill-digisorption.step.digivolve.hint":
    "Paga 1 de memoria, queda en 0 y conserva a Pistmon no suspendido. Sin la reducción, pagar 3 pasaría la memoria al rival antes de atacar.",
  "learn.lesson.drill-digisorption.step.attack-player": "Ataca al jugador con Pistmon para ganar.",
  "learn.lesson.drill-digisorption.step.attack-player.hint":
    "El rival no tiene security y Pistmon ya estaba en juego como Lighdramon.",
  "learn.lesson.drill-digi-burst.title": "Digi-Burst: gasta tus fuentes",
  "learn.lesson.drill-digi-burst.summary": "Descarta dos fuentes para suspender al Blocker antes de atacar.",
  "learn.lesson.drill-digi-burst.goal1": "Activa un efecto Main de Digi-Burst",
  "learn.lesson.drill-digi-burst.goal2": "Paga exactamente dos cartas de digievolución",
  "learn.lesson.drill-digi-burst.done":
    "HerculesKabuterimon gastó dos fuentes, inutilizó al Blocker y abrió el ataque ganador.",
  "learn.lesson.drill-digi-burst.step.intro":
    "HerculesKabuterimon tiene Main: Digi-Burst 2. Descartar dos fuentes permite suspender a un Digimon rival.",
  "learn.lesson.drill-digi-burst.step.intro.hint":
    "Monochromon puede bloquear si no está suspendido. Suspéndelo primero.",
  "learn.lesson.drill-digi-burst.step.burst":
    "Selecciona a HerculesKabuterimon y activa Digi-Burst. Elige a Kunemon y Kabuterimon como fuentes a descartar y después a Monochromon para suspenderlo.",
  "learn.lesson.drill-digi-burst.step.burst.hint": "HerculesKabuterimon del tope no es una fuente que puedas gastar.",
  "learn.lesson.drill-digi-burst.step.attack-security":
    "Ataca al jugador con HerculesKabuterimon para chequear la última security.",
  "learn.lesson.drill-digi-burst.step.attack-security.hint": "Monochromon suspendido no puede bloquear.",
  "learn.lesson.drill-digi-burst.step.attack-player": "Ataca al jugador con Birdramon para ganar.",
  "learn.lesson.drill-digi-burst.step.attack-player.hint": "Retirar la última security no ganó por sí solo.",
  "learn.lesson.drill-delay.title": "Delay: aprovecha una Option preparada",
  "learn.lesson.drill-delay.summary":
    "Usa Reinforcing Memory Boost! para conseguir la memoria del ataque ganador con Rush.",
  "learn.lesson.drill-delay.goal1": "Activa Delay después del turno de colocación",
  "learn.lesson.drill-delay.goal2": "Convierte una Option guardada en tres de memoria",
  "learn.lesson.drill-delay.done": "Delay pagó a BushiAgumon, que ganó con Rush.",
  "learn.lesson.drill-delay.step.intro":
    "Reinforcing Memory Boost! se colocó en batalla en un turno anterior. Su Delay está listo. Solo tienes 2 de memoria.",
  "learn.lesson.drill-delay.step.intro.hint": "No puedes usar Delay en el mismo turno en que se coloca su carta.",
  "learn.lesson.drill-delay.step.delay":
    "Selecciona Reinforcing Memory Boost! y activa Delay. Descártala para ganar 3 de memoria.",
  "learn.lesson.drill-delay.step.delay.hint": "Tu memoria aumenta de 2 a 5.",
  "learn.lesson.drill-delay.step.play-rush": "Juega a BushiAgumon de tu mano por 5 de memoria.",
  "learn.lesson.drill-delay.step.play-rush.hint": "La memoria de Delay permite pagar y quedar en 0.",
  "learn.lesson.drill-delay.step.attack-player": "Ataca al jugador con BushiAgumon para ganar.",
  "learn.lesson.drill-delay.step.attack-player.hint": "Rush permite atacar a este Digimon recién jugado.",
  "learn.lesson.drill-blast-digivolve.title": "Blast Digivolve: evoluciona durante un ataque",
  "learn.lesson.drill-blast-digivolve.summary":
    "Responde al ataque del bot con WarGreymon, bloquea y gana en el siguiente turno.",
  "learn.lesson.drill-blast-digivolve.goal1": "Usa el momento de Counter para digievolucionar gratis",
  "learn.lesson.drill-blast-digivolve.goal2": "Obtén Blocker antes del momento de bloqueo",
  "learn.lesson.drill-blast-digivolve.done":
    "Blast Digivolve creó a WarGreymon a tiempo para bloquear un ataque letal y ganar después.",
  "learn.lesson.drill-blast-digivolve.step.intro":
    "El bot atacará cuando tengas 0 security. Tu MetalGreymon no tiene Blocker, pero WarGreymon en tu mano puede usar Blast Digivolve y convertirse en bloqueador.",
  "learn.lesson.drill-blast-digivolve.step.intro.hint": "El momento de Counter ocurre antes del momento de bloqueo.",
  "learn.lesson.drill-blast-digivolve.step.counter":
    "En la oferta de Counter, selecciona a WarGreymon en tu mano y usa Blast Digivolve sobre MetalGreymon.",
  "learn.lesson.drill-blast-digivolve.step.counter.hint":
    "La digievolución válida no cuesta memoria y aún roba una carta.",
  "learn.lesson.drill-blast-digivolve.step.block": "Bloquea al Ikkakumon atacante con tu nuevo WarGreymon.",
  "learn.lesson.drill-blast-digivolve.step.block.hint": "WarGreymon tiene 11000 DP frente a los 5000 DP de Ikkakumon.",
  "learn.lesson.drill-blast-digivolve.step.your-turn":
    "Sobreviviste. Espera a que pase el bot y tu Digimon se enderece.",
  "learn.lesson.drill-blast-digivolve.step.your-turn.hint": "El Counter no inició tu propio turno.",
  "learn.lesson.drill-blast-digivolve.step.attack-player": "Ataca al jugador con WarGreymon para ganar.",
  "learn.lesson.drill-blast-digivolve.step.attack-player.hint": "El bot no tiene security ni bloqueadores restantes.",
  "learn.lesson.drill-mind-link.title": "Mind Link: convierte a un Tamer en fuente",
  "learn.lesson.drill-mind-link.summary": "Vincula a Eiji con Loogarmon, usa Alliance concedido y termina la partida.",
  "learn.lesson.drill-mind-link.goal1": "Coloca a un Tamer válido entre las cartas de digievolución",
  "learn.lesson.drill-mind-link.goal2": "Usa un efecto heredado obtenido mediante Mind Link",
  "learn.lesson.drill-mind-link.done":
    "Eiji se convirtió en fuente, concedió Alliance y ayudó a Loogarmon a retirar ambas security.",
  "learn.lesson.drill-mind-link.step.intro":
    "Eiji Nagasumi puede usar Mind Link con un Digimon Dark Animal o SoC sin Tamers en sus fuentes. Loogarmon es válido.",
  "learn.lesson.drill-mind-link.step.intro.hint":
    "Una vez vinculado, Eiji concede Alliance y Blocker desde su caja de efecto heredado.",
  "learn.lesson.drill-mind-link.step.mind-link":
    "Selecciona a Eiji, activa su Main Mind Link y elige a Loogarmon como destino.",
  "learn.lesson.drill-mind-link.step.mind-link.hint":
    "Eiji pasa bajo Loogarmon y deja de ser un Tamer separado en batalla.",
  "learn.lesson.drill-mind-link.step.alliance":
    "Ataca al jugador con Loogarmon. Resuelve sus disparos de ataque en cualquier orden. Para Alliance, acepta y suspende a Birdramon como apoyo. Puedes rechazar el efecto opcional de Loogarmon con coste de mano o descartar 1 carta para resolverlo. Termina ambos disparos antes de chequear las 2 security.",
  "learn.lesson.drill-mind-link.step.alliance.hint":
    "Elige a Birdramon para Alliance y reserva a Dracomon no suspendido para el ataque final.",
  "learn.lesson.drill-mind-link.step.attack-player": "Ataca al jugador con Dracomon para ganar.",
  "learn.lesson.drill-mind-link.step.attack-player.hint": "Dracomon sigue preparado porque Birdramon pagó Alliance.",
  "learn.lesson.drill-blast-dna-digivolve.title": "Blast DNA Digivolve: combina campo y mano",
  "learn.lesson.drill-blast-dna-digivolve.summary":
    "Crea a RagnaLoardmon en Counter usando un Digimon del campo y un material de la mano.",
  "learn.lesson.drill-blast-dna-digivolve.goal1": "Aporta los dos materiales especificados de DNA durante Counter",
  "learn.lesson.drill-blast-dna-digivolve.goal2":
    "Resuelve la retirada exclusiva de DNA antes de que continúe el ataque",
  "learn.lesson.drill-blast-dna-digivolve.done":
    "RagnaLoardmon combinó gratis ambos materiales, eliminó al atacante y ganó al siguiente turno.",
  "learn.lesson.drill-blast-dna-digivolve.step.intro":
    "El bot ataca cuando tienes 0 security. Durandamon está en batalla; BryweLudramon y RagnaLoardmon están en tu mano.",
  "learn.lesson.drill-blast-dna-digivolve.step.intro.hint":
    "Blast DNA Digivolve necesita el Digimon especificado en campo y la otra carta especificada en la mano.",
  "learn.lesson.drill-blast-dna-digivolve.step.counter":
    "En Counter, usa a RagnaLoardmon. Elige a Durandamon y al BryweLudramon de tu mano para Blast DNA Digivolve. Resuelve sus efectos y elige al Plesiomon atacante para eliminarlo.",
  "learn.lesson.drill-blast-dna-digivolve.step.counter.hint":
    "Su digievolución descarta la última security rival y el efecto exclusivo de DNA elimina al atacante antes de que te golpee.",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn":
    "Espera a que el bot pase. Tu nuevo RagnaLoardmon estará listo para tu turno.",
  "learn.lesson.drill-blast-dna-digivolve.step.your-turn.hint":
    "DNA crea un Digimon nuevo y combina ambos materiales entre sus fuentes.",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player": "Ataca al jugador con RagnaLoardmon para ganar.",
  "learn.lesson.drill-blast-dna-digivolve.step.attack-player.hint":
    "El atacante fue eliminado durante Counter y sobreviviste sin security.",
  "learn.lesson.drill-link.title": "Link +: conserva un link adicional",
  "learn.lesson.drill-link.summary": "Dale a Deusmon un segundo link sin reemplazar el primero.",
  "learn.lesson.drill-link.goal1": "Vincula una carta de la mano pagando su coste de link",
  "learn.lesson.drill-link.goal2": "Usa Link +1 para conservar dos cartas de link",
  "learn.lesson.drill-link.done":
    "Deusmon conservó ambos Navimon, chequeó security y dejó a Birdramon el ataque ganador.",
  "learn.lesson.drill-link.step.intro":
    "Normalmente un Digimon conserva solo 1 link. Deusmon tiene Link +1 y su límite es 2. Ya tiene un Navimon vinculado.",
  "learn.lesson.drill-link.step.intro.hint": "Las cartas de link se colocan de lado y no son fuentes de digievolución.",
  "learn.lesson.drill-link.step.link":
    "Elige a Navimon de tu mano, selecciona Link y elige a Deusmon. Paga su coste de 1 de memoria.",
  "learn.lesson.drill-link.step.link.hint": "Ambos Navimon permanecen vinculados porque Deusmon tiene espacio para 2.",
  "learn.lesson.drill-link.step.attack-security": "Ataca al jugador con Deusmon para chequear la última security.",
  "learn.lesson.drill-link.step.attack-security.hint":
    "Los bonos de DP de link permanecen activos mientras ambos están vinculados.",
  "learn.lesson.drill-link.step.attack-player": "Ataca al jugador con Birdramon para ganar.",
  "learn.lesson.drill-link.step.attack-player.hint": "El ataque final es independiente de los security checks.",
  "learn.lesson.drill-use-req.title": "Use Req.: cumple un rasgo en vez de una condición de color",
  "learn.lesson.drill-use-req.summary": "Usa e-Pulse blanca aunque tu campo solo aporte amarillo.",
  "learn.lesson.drill-use-req.goal1": "Lee la condición especificada de Use Req.",
  "learn.lesson.drill-use-req.goal2": "Paga la Option ignorando solo sus requisitos de color",
  "learn.lesson.drill-use-req.done":
    "Liollmon cumplió Use Req., e-Pulse reclutó otro Digimon y tu Liollmon original ganó.",
  "learn.lesson.drill-use-req.step.intro":
    "e-Pulse es blanca, pero solo tienes a Liollmon amarillo en batalla. Su Use Req. acepta una carta BEATBREAK en tu campo.",
  "learn.lesson.drill-use-req.step.intro.hint":
    "Liollmon tiene BEATBREAK, por lo que puedes ignorar la condición de color blanco.",
  "learn.lesson.drill-use-req.step.use-option":
    "Usa e-Pulse de tu mano por 3 de memoria. Acepta su efecto y juega al otro Liollmon de tu mano sin pagar su coste de juego.",
  "learn.lesson.drill-use-req.step.use-option.hint":
    "Use Req. ignora el color, no el coste de uso de 3 de memoria. Después, e-Pulse queda en batalla.",
  "learn.lesson.drill-use-req.step.attack-player":
    "Ataca al jugador con el Liollmon que ya estaba en batalla para ganar.",
  "learn.lesson.drill-use-req.step.attack-player.hint":
    "El Liollmon recién jugado no puede atacar este turno; elige el original.",
  "learn.lesson.drill-ascension.title": "Ascension: convierte la eliminación en security",
  "learn.lesson.drill-ascension.summary":
    "Convierte a ScourgeChiropmon en security para sobrevivir al bot y ganar después.",
  "learn.lesson.drill-ascension.goal1": "Resuelve Ascension tras una eliminación real en batalla",
  "learn.lesson.drill-ascension.goal2": "Usa la security añadida para sobrevivir un turno",
  "learn.lesson.drill-ascension.done":
    "ScourgeChiropmon ascendió a security, absorbió el ataque del bot y permitió ganar a Birdramon.",
  "learn.lesson.drill-ascension.step.intro":
    "Tienes 0 security. Birdramon fue jugado este turno y debe esperar. ScourgeChiropmon tiene Ascension y puede convertirse en security tras ser eliminado.",
  "learn.lesson.drill-ascension.step.intro.hint": "El bot atacará en su turno: necesitas una security antes de pasar.",
  "learn.lesson.drill-ascension.step.ascend":
    "Ataca al Plesiomon suspendido con ScourgeChiropmon. Pierde la batalla. Acepta Ascension y coloca a ScourgeChiropmon encima de tu security.",
  "learn.lesson.drill-ascension.step.ascend.hint":
    "ScourgeChiropmon tiene 8000 DP frente a los 12000 DP de Plesiomon. No hay Tamer para pagar su otro efecto de eliminación.",
  "learn.lesson.drill-ascension.step.end-turn": "Tu nueva security está lista. Termina tu turno.",
  "learn.lesson.drill-ascension.step.end-turn.hint": "Birdramon aún no puede atacar en el turno en que fue jugado.",
  "learn.lesson.drill-ascension.step.your-turn": "Deja que el bot ataque tu nueva security y espera tu turno.",
  "learn.lesson.drill-ascension.step.your-turn.hint": "Sin Ascension, ese ataque te habría derrotado con 0 security.",
  "learn.lesson.drill-ascension.step.attack-player": "Ataca al jugador con Birdramon para ganar.",
  "learn.lesson.drill-ascension.step.attack-player.hint": "Birdramon ya puede atacar y el bot no tiene security.",
  "learn.lesson.drill-detach.title": "Detach: gasta un link para permanecer en juego",
  "learn.lesson.drill-detach.summary": "Impide Cocytus Breath desprendiendo un link válido de Seven Code.",
  "learn.lesson.drill-detach.goal1": "Usa Detach cuando un efecto rival retiraría a tu Digimon",
  "learn.lesson.drill-detach.goal2": "Paga con un link válido en vez de una fuente",
  "learn.lesson.drill-detach.done": "Weatherdramon perdió su link, permaneció en batalla y ganó en tu turno.",
  "learn.lesson.drill-detach.step.intro":
    "El bot usará Cocytus Breath para devolver a Weatherdramon a tu mano. Weatherdramon tiene Detach para links Seven Code.",
  "learn.lesson.drill-detach.step.intro.hint": "El Roleplaymon vinculado tiene el rasgo Seven Code requerido.",
  "learn.lesson.drill-detach.step.detach":
    "Cuando aparezca la retirada, acepta Detach y descarta al Roleplaymon vinculado. Conserva a Weatherdramon en batalla.",
  "learn.lesson.drill-detach.step.detach.hint":
    "El link va al trash. Weatherdramon pierde sus DP de link, pero no vuelve a tu mano.",
  "learn.lesson.drill-detach.step.your-turn": "El bot ya gastó su Option. Espera a que pase.",
  "learn.lesson.drill-detach.step.your-turn.hint": "Detach impide la retirada; no vuelve a jugar a Weatherdramon.",
  "learn.lesson.drill-detach.step.attack-player": "Ataca al jugador con Weatherdramon para ganar.",
  "learn.lesson.drill-detach.step.attack-player.hint":
    "Al conservar su presencia en el campo, puede atacar en tu turno.",
  "learn.lesson.drill-succession.title": "Succession: usa el efecto normal de una fuente",
  "learn.lesson.drill-succession.summary":
    "Usa el texto normal de la fuente Ceresmon mediante Succession para eliminar un Blocker durante el ataque de Palmon.",
  "learn.lesson.drill-succession.goal1": "Lee la fuente válida más cercana al tope que elige Succession",
  "learn.lesson.drill-succession.goal2": "Resuelve un efecto normal copiado en vez de una caja de heredado",
  "learn.lesson.drill-succession.done":
    "Succession copió la reacción normal de Ceresmon a suspender, eliminó a Monmon y permitió a Palmon retirar la security antes de que ganara Dracomon.",
  "learn.lesson.drill-succession.step.intro":
    "Tu Ceresmon superior tiene Succession (Ceresmon). Su fuente Ceresmon tiene un efecto normal All Turns que da -3000 DP a un rival por cada Digimon suspendido. Succession copia ese efecto normal.",
  "learn.lesson.drill-succession.step.intro.hint":
    "El texto está en la caja de efecto normal de la fuente, no en el heredado. Monmon solo tiene 1000 DP. Los 2000 DP de Palmon superan al Security Digimon de 1000 DP.",
  "learn.lesson.drill-succession.step.copy-effect":
    "Ataca al jugador con Palmon. Su suspensión dispara el efecto que Ceresmon recibió por Succession. Elige a Monmon para -3000 DP: será eliminado antes de bloquear. Palmon chequea la última security y sobrevive.",
  "learn.lesson.drill-succession.step.copy-effect.hint":
    "Resuelve la reacción copiada de Ceresmon antes del momento de bloqueo.",
  "learn.lesson.drill-succession.step.attack-player":
    "Cuando Palmon termine el security check, ataca al jugador con Dracomon para ganar.",
  "learn.lesson.drill-succession.step.attack-player.hint":
    "El último security check no ganó por sí solo. Dracomon realiza el ataque ganador separado.",
  "learn.lesson.practice-game-preparation.title": "De la mano inicial a la batalla ganadora",
  "learn.lesson.practice-game-preparation.summary":
    "Comienza con cero de memoria, decks legales, manos de cinco cartas y cinco security; desarrolla tu atacante y gana.",
  "learn.lesson.practice-game-preparation.goal1":
    "Reconoce la mano inicial, la security, el deck de Digi-Eggs y la excepción de robo del primer turno",
  "learn.lesson.practice-game-preparation.goal2":
    "Desarrolla un Digimon y usa varios turnos para retirar cinco security antes de un ataque directo final",
  "learn.lesson.practice-game-preparation.done":
    "Jugaste desde una apertura preparada normalmente, pasando por crianza, digievolución, cambios de memoria y el ataque final.",
  "learn.lesson.practice-game-preparation.step.intro":
    "Esta partida comienza con decks de cincuenta cartas, cinco cartas en cada mano, cinco security y cero de memoria. Juegas primero y omites el primer robo normal. El bot pasa para practicar toda la secuencia.",
  "learn.lesson.practice-game-preparation.step.intro.hint":
    "Quedan cuarenta cartas en cada deck principal tras separar cinco para la mano y cinco para security. El deck de Digi-Eggs está separado.",
  "learn.lesson.practice-game-preparation.step.hatch":
    "Haz eclosionar a Koromon desde tu deck de Digi-Eggs al área de crianza vacía.",
  "learn.lesson.practice-game-preparation.step.hatch.hint":
    "Eclosionar no cuesta memoria ni roba carta. Termina la acción de crianza de este turno.",
  "learn.lesson.practice-game-preparation.step.rookie":
    "Digievoluciona a Koromon en Agumon en crianza. Esta ruta cuesta cero de memoria y roba una carta.",
  "learn.lesson.practice-game-preparation.step.rookie.hint":
    "Usa a Agumon ST1-03 de tu mano y selecciona a Koromon como base.",
  "learn.lesson.practice-game-preparation.step.champion":
    "Digievoluciona al Agumon en crianza en Greymon. Paga dos de memoria; el turno pasa al bot cuando termina el procesamiento.",
  "learn.lesson.practice-game-preparation.step.champion.hint":
    "Digievolucionar roba carta también en crianza y en el primer turno. La memoria pasa de cero a dos del rival.",
  "learn.lesson.practice-game-preparation.step.move":
    "Espera a que el bot pase. En tu siguiente fase de crianza, mueve a Greymon a batalla.",
  "learn.lesson.practice-game-preparation.step.move.hint":
    "Mover no es jugar un Digimon nuevo. Greymon puede atacar este turno tras salir de crianza.",
  "learn.lesson.practice-game-preparation.step.ultimate":
    "Digievoluciona a Greymon en Garudamon por tres de memoria. El Security Attack +1 heredado de Greymon dará dos checks a Garudamon.",
  "learn.lesson.practice-game-preparation.step.ultimate.hint":
    "El efecto normal de una fuente es distinto del heredado. Lee la caja inferior de Greymon.",
  "learn.lesson.practice-game-preparation.step.first-checks":
    "Ataca al jugador con Garudamon. Chequea dos de las cinco security del bot, una cada vez.",
  "learn.lesson.practice-game-preparation.step.first-checks.hint":
    "Garudamon tiene suficientes DP para sobrevivir a estas batallas de security. Al bot le quedarán tres security.",
  "learn.lesson.practice-game-preparation.step.second-attacker":
    "Juega a Biyomon por dos de memoria. Pasas el turno al bot; reserva a Biyomon para el ataque ganador.",
  "learn.lesson.practice-game-preparation.step.second-attacker.hint":
    "Un Digimon recién jugado normalmente no puede atacar ese turno. Biyomon estará listo cuando pase el bot.",
  "learn.lesson.practice-game-preparation.step.clear-security":
    "En tus turnos, ataca con Garudamon y pasa cuando esté suspendido. Repite hasta dejar al bot sin security; mantén preparado a Biyomon para el ataque final.",
  "learn.lesson.practice-game-preparation.step.clear-security.hint":
    "Omite crianza si no hay una acción disponible. Garudamon chequea dos por ataque. Un check sobrante no se convierte en otro golpe directo tras la última security.",
  "learn.lesson.practice-game-preparation.step.win":
    "El bot no tiene security. Ataca al jugador con Biyomon para ganar.",
  "learn.lesson.practice-game-preparation.step.win.hint":
    "Aún necesitas este ataque separado tras retirar la security. Biyomon fue jugado en un turno anterior y ya puede atacar.",
  "learn.lesson.practice-rule-checks.title": "Comprobaciones de reglas: elimina un Digimon a cero DP",
  "learn.lesson.practice-rule-checks.summary":
    "Usa una Option amarilla para reducir los DP de un Blocker por debajo de cero, observa su eliminación por regla y gana con Salamon.",
  "learn.lesson.practice-rule-checks.goal1": "Cumple la condición de color de una Option y resuelve su reducción de DP",
  "learn.lesson.practice-rule-checks.goal2":
    "Distingue la eliminación por comprobación de reglas de la instruida directamente por un efecto",
  "learn.lesson.practice-rule-checks.done":
    "Seven Heavens redujo los DP de Monochromon; una comprobación de reglas lo eliminó y permitió el ataque ganador de Salamon.",
  "learn.lesson.practice-rule-checks.step.intro":
    "El bot no tiene security, pero Monochromon puede bloquear a Salamon. Seven Heavens da -10000 DP; las reglas eliminan a un Digimon en batalla con cero DP o menos.",
  "learn.lesson.practice-rule-checks.step.intro.hint":
    "Salamon aporta amarillo para el requisito de color. Tienes nueve de memoria y la Option cuesta siete.",
  "learn.lesson.practice-rule-checks.step.reduce-dp":
    "Usa Seven Heavens de tu mano y elige al Monochromon del bot. Confirma el objetivo y observa cómo va al trash tras resolver el efecto.",
  "learn.lesson.practice-rule-checks.step.reduce-dp.hint":
    "La Option solo reduce DP. La regla 17-1-3-1-1 realiza la eliminación si los DP resultantes son cero o menos.",
  "learn.lesson.practice-rule-checks.step.win": "El Blocker ya no está. Ataca al jugador con Salamon para ganar.",
  "learn.lesson.practice-rule-checks.step.win.hint":
    "Salamon ya estaba en batalla antes de este turno. La Option deja dos de memoria, así que el turno sigue siendo tuyo.",
} satisfies Record<keyof typeof newDrillsEn, string>;
