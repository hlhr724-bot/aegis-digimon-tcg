import type { arenaEn } from "./arena.en";

export const arenaEs: Record<keyof typeof arenaEn, string> = {
  "settings.arenaInput": "Teclado y mando",
  "settings.arenaInputDesc": "Mueve un cursor con las flechas o un mando y muestra el botón de cada acción.",
  "game.input.controls": "Teclado y mando",
  "game.input.navigate": "Navegar",
  "game.input.select": "Seleccionar",
  "game.input.inspect": "Inspeccionar",
  "game.input.region": "Zona",
  "game.input.scroll": "Desplazar",
  "game.input.reorder": "Enter/A: mover; flechas: ordenar; Enter/A: terminar; Esc/B: deshacer",

  "redesign.arena.look.open": "Configuración de la partida",
  "redesign.arena.look.title": "Configuración de la partida",
  "redesign.arena.look.description":
    "Colores del tablero, campo de batalla y sonido. Los cambios se aplican al instante.",
  "redesign.arena.audio.title": "Sonido",
  "redesign.arena.board.title": "Tablero",
  "redesign.arena.audio.music": "Música",
  "redesign.arena.audio.musicTrack": "Banda sonora",
  "redesign.arena.audio.musicVolume": "Volumen de la música",
  "redesign.arena.audio.effects": "Efectos de sonido y avisos",
  "redesign.arena.audio.effectsVolume": "Volumen de los efectos",
  "redesign.arena.badge.stackTitle": "Pila de digievolución",
  "redesign.arena.badge.stack": "{count} cartas de digievolución debajo de este Digimon.",
  "redesign.arena.badge.dpTitle": "{dp} DP",
  "redesign.arena.badge.dpUp": "{base} DP impresos, aumentados en {amount} por efectos.",
  "redesign.arena.badge.dpDown": "{base} DP impresos, reducidos en {amount} por efectos.",
  "redesign.arena.badge.dpChanged": "Hay efectos que cambiaron el DP de este Digimon.",
  "redesign.arena.badge.moreTitle": "Más efectos en este Digimon",
  "redesign.arena.badge.keywordsMore": "{count} palabras clave más. Abre la carta para leerlas todas.",
  "redesign.arena.restriction.immuneToOpponentEffects": "Los efectos de tu oponente no pueden afectar a este Digimon.",
  "redesign.arena.restriction.immuneToOpponentDigimonEffects":
    "Los efectos de los Digimon de tu oponente no pueden afectar a este Digimon.",
  "redesign.arena.restriction.immuneToOpponentOptionEffects":
    "Los efectos de las cartas Option de tu oponente no pueden afectar a este Digimon.",
  "redesign.arena.restriction.immuneToOpponentTamerEffects":
    "Los efectos de los Tamers de tu oponente no pueden afectar a este Digimon.",
  "redesign.arena.restriction.protectedFromDpReduction":
    "Los efectos de tu oponente no pueden reducir el DP de este Digimon.",
  "redesign.arena.restriction.protectedFromDeDigivolve":
    "Los efectos de tu oponente no pueden descartar cartas de la parte superior de este Digimon.",
  "redesign.arena.restriction.protectedFromEffectDeletion":
    "Los efectos de tu oponente no pueden eliminar a este Digimon.",
  "redesign.arena.restriction.protectedFromEffectReturn":
    "Los efectos de tu oponente no pueden devolver a este Digimon a la mano ni al deck.",
  "redesign.arena.restriction.attacksAtStartOfMainPhase":
    "Un efecto hace que este Digimon ataque al inicio de su fase principal, si puede.",
  "redesign.arena.restriction.attacksAtStartOfMainPhaseGranted": "{card} otorgó: {clause}",
  "redesign.arena.restriction.cannotAttack": "Un efecto impide que este Digimon ataque.",
  "redesign.arena.restriction.cannotBlock": "Un efecto impide que este Digimon bloquee.",
  "redesign.arena.restriction.cannotSuspend": "Un efecto impide que este Digimon se suspenda.",
  "redesign.arena.restriction.cannotUnsuspend":
    "Un efecto mantiene a este Digimon suspendido en la fase de reactivación.",
  "redesign.arena.restriction.cannotDigivolve": "Un efecto impide que esta carta digievolucione.",
  "redesign.arena.restriction.cannotActivateWhenDigivolving":
    "Un efecto impide que se activen los efectos [When Digivolving] de este Digimon.",
  "redesign.arena.keyword.SecurityAttackUp": "Este Digimon revisa {count} carta(s) de seguridad adicional(es).",
  "redesign.arena.keyword.SecurityAttackDown": "Este Digimon revisa {count} carta(s) de seguridad menos.",
  "redesign.arena.keyword.unlisted": "Impreso en esta carta. Abre la carta para leer su efecto completo.",
};
