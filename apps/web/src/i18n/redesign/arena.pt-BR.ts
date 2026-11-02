import type { arenaEn } from "./arena.en";

export const arenaPtBR: Record<keyof typeof arenaEn, string> = {
  "settings.arenaInput": "Teclado e controle",
  "settings.arenaInputDesc": "Mova um cursor com as setas ou um controle e veja o botão de cada ação.",
  "game.input.controls": "Teclado e controle",
  "game.input.navigate": "Navegar",
  "game.input.select": "Selecionar",
  "game.input.inspect": "Inspecionar",
  "game.input.region": "Região",
  "game.input.scroll": "Rolar",
  "game.input.reorder": "Enter/A: mover item; setas: reordenar; Enter/A: concluir; Esc/B: desfazer",

  "redesign.arena.look.open": "Configurações da partida",
  "redesign.arena.look.title": "Configurações da partida",
  "redesign.arena.look.description": "Cores do tabuleiro, cenário e som. As mudanças valem na hora.",
  "redesign.arena.audio.title": "Som",
  "redesign.arena.audio.music": "Música",
  "redesign.arena.audio.musicVolume": "Volume da música",
  "redesign.arena.audio.musicTrack": "Trilha sonora",
  "redesign.arena.audio.effects": "Efeitos sonoros e sinais",
  "redesign.arena.audio.effectsVolume": "Volume dos efeitos",
  "redesign.arena.board.title": "Tabuleiro",

  "redesign.arena.badge.stackTitle": "Pilha de digivolução",
  "redesign.arena.badge.stack": "{count} cartas de digivolução sob este Digimon.",
  "redesign.arena.badge.dpTitle": "{dp} DP",
  "redesign.arena.badge.dpUp": "DP impresso {base}, aumentado em {amount} por efeitos.",
  "redesign.arena.badge.dpDown": "DP impresso {base}, reduzido em {amount} por efeitos.",
  "redesign.arena.badge.dpChanged": "Efeitos mudaram o DP deste Digimon.",
  "redesign.arena.badge.moreTitle": "Mais efeitos neste Digimon",
  "redesign.arena.badge.keywordsMore": "Mais {count} palavras-chave. Abra a carta para ler todas.",

  "redesign.arena.restriction.immuneToOpponentEffects": "Os efeitos do oponente não afetam este Digimon.",
  "redesign.arena.restriction.immuneToOpponentDigimonEffects":
    "Os efeitos dos Digimon do oponente não afetam este Digimon.",
  "redesign.arena.restriction.immuneToOpponentOptionEffects":
    "Os efeitos das cartas de Opção do oponente não afetam este Digimon.",
  "redesign.arena.restriction.immuneToOpponentTamerEffects":
    "Os efeitos dos Tamers do oponente não afetam este Digimon.",
  "redesign.arena.restriction.protectedFromDpReduction": "Os efeitos do oponente não podem reduzir o DP deste Digimon.",
  "redesign.arena.restriction.protectedFromDeDigivolve":
    "Os efeitos do oponente não podem descartar cartas do topo deste Digimon.",
  "redesign.arena.restriction.protectedFromEffectDeletion": "Os efeitos do oponente não podem deletar este Digimon.",
  "redesign.arena.restriction.protectedFromEffectReturn":
    "Os efeitos do oponente não podem devolver este Digimon para a mão ou para o deck.",
  "redesign.arena.restriction.attacksAtStartOfMainPhase":
    "Um efeito faz este Digimon atacar no início da fase principal, se puder.",
  "redesign.arena.restriction.attacksAtStartOfMainPhaseGranted": "{card} concedeu: {clause}",
  "redesign.arena.restriction.cannotAttack": "Um efeito impede este Digimon de atacar.",
  "redesign.arena.restriction.cannotBlock": "Um efeito impede este Digimon de bloquear.",
  "redesign.arena.restriction.cannotSuspend": "Um efeito impede este Digimon de ser suspenso.",
  "redesign.arena.restriction.cannotUnsuspend": "Um efeito mantém este Digimon suspenso na fase de ativação.",
  "redesign.arena.restriction.cannotDigivolve": "Um efeito impede esta carta de digivolver.",
  "redesign.arena.restriction.cannotActivateWhenDigivolving":
    "Um efeito impede que os efeitos [When Digivolving] deste Digimon sejam ativados.",

  "redesign.arena.keyword.SecurityAttackUp": "Este Digimon verifica {count} carta(s) de segurança a mais.",
  "redesign.arena.keyword.SecurityAttackDown": "Este Digimon verifica {count} carta(s) de segurança a menos.",
  "redesign.arena.keyword.unlisted": "Impressa nesta carta. Abra a carta para ler o efeito completo.",
};
