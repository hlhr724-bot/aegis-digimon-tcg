# Pesquisa: decks e resultados no perfil Ranked

Pesquisa realizada em 25 de outubro de 2026. O pedido cobre referências de apresentação e avaliação da base existente; a proposta resultante foi implementada no painel do jogador. O comportamento entregue está descrito em [RANKED.md](RANKED.md#player-deck-results).

## Referências verificadas

| Produto e fonte primária                                                                         | O que a fonte mostra                                                                                                                                                                                                                                          | Aplicação sugerida no Aegis                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [Limitless — decks de Digimon](https://play.limitlesstcg.com/decks?game=DCG)                     | Tabela com deck, quantidade, participação, placar e porcentagem de vitórias; filtros de formato e conjunto; opção de combinar variantes em um arquétipo.                                                                                                      | Usar uma lista comparável de decks com partidas, V/D/E e taxa de vitória, mantendo arquétipo e lista exata como níveis distintos.  |
| [Untapped.gg — Companion](https://mtga.untapped.gg/companion)                                    | Histórico pessoal, progresso no ranking, desempenho por deck e estatísticas de confrontos.                                                                                                                                                                    | Mostrar um resumo compacto e abrir histórico/confrontos somente quando o jogador selecionar um deck.                               |
| [HSReplay — decks](https://hsreplay.net/decks/)                                                  | Resultados de pesquisa indexados da página mostram taxa de vitória e quantidade de jogos, além de filtros de período, modo, rank e região e opção para dados esparsos. A página depende de conteúdo dinâmico; a extração HTML direta não expõe toda a tabela. | Colocar tamanho da amostra ao lado da taxa e explicitar o período dos dados. Não comparar números sem o mesmo recorte.             |
| [HSReplay — My Decks](https://help.hearthsim.net/en/articles/2747681-why-is-my-decks-incomplete) | O desempenho pessoal dos decks depende da análise de replays enviados e vinculados à conta correta.                                                                                                                                                           | Derivar resultados das partidas autoritativas do usuário, com uma ligação verificável entre participante, resultado e lista usada. |

Essas referências sustentam os padrões descritos. O layout e as regras propostos abaixo são recomendações para o Aegis, não funcionalidades atribuídas aos produtos pesquisados.

## Apresentação recomendada

No painel do jogador, manter nome e estatísticas gerais no topo e substituir o bloco fixo de cadeado por uma seção **Decks usados nesta temporada**. Exibir uma lista, ordenada inicialmente por número de partidas:

| Deck / arquétipo                   | Partidas | V / D / E  | Taxa de vitória         | Última partida | Ações                 |
| ---------------------------------- | -------- | ---------- | ----------------------- | -------------- | --------------------- |
| UlforceVeedramon · lista publicada | 24       | 15 / 8 / 1 | 62,5%                   | Há 2 horas     | Ver lista · Histórico |
| Red Hybrid · composição privada    | 9        | 5 / 4 / 0  | 55,6% · amostra pequena | Ontem          | Histórico permitido   |

Os números da tabela são apenas exemplos de apresentação. Em celular, cada linha vira um card: identidade do deck, V/D/E e taxa juntos, quantidade de partidas e última utilização abaixo. Evitar um gráfico de pizza nesse painel: ele mostra participação, mas não ajuda a comparar resultados por deck.

Selecionar uma linha abre a lista histórica correspondente, quando sua publicação permitir, e o histórico de resultados. O histórico pode apresentar adversário, resultado, data, mudança de rating e replay disponível. Confrontos por arquétipo ficam em uma expansão, sem sobrecarregar o resumo inicial.

O cabeçalho deve informar temporada e formato. Se o painel for aberto de um leaderboard filtrado, preservar esse recorte. Um histórico de todas as temporadas precisa ser uma seleção explícita.

## Métricas e interpretação

- Partidas = vitórias + derrotas + empates. Taxa de vitória = vitórias / partidas, coerente com o comportamento atual do Aegis. Não incluir meio ponto por empate sem renomear e explicar outra métrica.
- Exibir V/D/E e quantidade de partidas mesmo quando houver poucas observações. Uma taxa pessoal com 3 partidas não deve parecer tão conclusiva quanto uma com 100.
- Uma indicação de “amostra pequena” abaixo de 10 partidas seria uma convenção de produto a validar, não uma garantia estatística.
- A regra atual de Meta, que exige 30 aparições e 10 jogadores, serve ao agregado comunitário. Aplicá-la ao perfil individual impediria a exibição de qualquer taxa pessoal por exigir vários jogadores.
- Excluir partidas anuladas e bots dos resultados competitivos; separar Ranked e torneios. Não comparar diretamente uma lista de Standard com a mesma composição jogada em outro formato.

## O que já existe no repositório

- [`AccountStore.recordMatch`](../apps/api/src/accounts/AccountStore.ts) grava `match_deck_snapshots`: participante, partida, identidade do deck, nome, main deck, egg deck e resultado. Portanto, apagar `ranked_queue` ao terminar a partida não implica perder a lista usada. A tabela já existe na [migração inicial](../apps/api/src/db/migrations/001-initial-schema.ts).
- [`AccountStore.profile`](../apps/api/src/accounts/AccountStore.ts) já agrega vitórias, derrotas, empates e partidas por `snapshot_id`. A [rota `/account/profile`](../apps/api/src/accounts/routes.ts) usa a identidade da sessão; não é um endpoint público de outro jogador e sua agregação atual não filtra temporada, formato ou origem.
- [`CommunityDeckStore.publish`](../apps/api/src/community/CommunityDeckStore.ts) e [`public_decks`](../apps/api/src/db/migrations/019-community-decks.ts) já fornecem publicação de uma cópia do deck, independente de edições posteriores no deck salvo. Há infraestrutura de listas públicas a reutilizar.
- A preferência `shareDeckAfterMatch` é verificada em [`AegisRoom`](../apps/api/src/rooms/AegisRoom.ts) para disponibilizar o deck ao adversário após a partida. Isso não equivale a autorizar sua exposição permanente no perfil público.
- [`recordCompetitiveFacts`](../apps/api/src/ranked/recordCompetitiveFacts.ts) grava resultado e contexto por participante. A classificação real ainda usa `unknown` e versão 0; os arquétipos preenchidos pelo seed local não demonstram um classificador pronto.
- [`RankedMetaStore`](../apps/api/src/ranked/RankedMetaStore.ts) agrega arquétipos da temporada. [`RankedPlayerDrawer`](../apps/web/src/ranked/RankedPlayerDrawer.tsx) ainda apresenta apenas os totais do jogador e um aviso fixo para decks.

## Lacunas e cuidados para uma implementação

A próxima etapa pode reutilizar os snapshots existentes e criar uma consulta do jogador com temporada e formato, unindo `match_deck_snapshots`, `match_records` e `ranked_pairs`. Calcular na API V/D/E, última utilização e total da lista. Um registro público deve devolver apenas os campos autorizados.

Agrupar versões por uma representação canônica das quantidades de cartas em main/egg, não pelo nome do deck nem pelo ID editável. O hash atual usa os arrays diretamente; reordenar a mesma composição pode produzir outro `snapshot_id`. Preservar a lista histórica exata mesmo quando o deck salvo ou a publicação forem atualizados. O arquétipo pode reunir essas versões em um nível superior, sem somar listas diferentes como se fossem idênticas.

Resultados anulados requerem filtro explícito: [`RankedReportStore`](../apps/api/src/ranked/RankedReportStore.ts) marca `ranked_pairs.voided_at` e remove fatos competitivos, mas os snapshots históricos permanecem. Contar snapshots sem essa junção pode ressuscitar uma partida anulada nas estatísticas do deck.

A associação com uma lista pública deve comparar a composição histórica com a composição publicada. Apenas compartilhar `source_deck_id` não prova que a versão usada é a publicada. Quando não existir autorização ou correspondência exata, manter as estatísticas permitidas e explicar que a composição não foi publicada; não dizer genericamente que todas as listas são privadas.

O seed original criou partidas e fatos agregados sem `match_deck_snapshots`. Durante a implementação, o seed local foi complementado com composições legais do catálogo e publicações de demonstração. Um nome de arquétipo sozinho não permite reconstruir as cartas que foram usadas.
