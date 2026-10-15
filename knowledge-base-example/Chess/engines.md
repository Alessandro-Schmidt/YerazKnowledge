# 🤖 Chess engines

Programs that play chess. Claude Shannon's 1950 paper *Programming a Computer for Playing Chess* started the field.

## How they work

- **Board**: 64-bit bitboards → [Number theory](/Mathematics/algebra/number-theory.md).
- **Search**: minimax with alpha-beta pruning → [Game theory](/Mathematics/game-theory.md).
- **Evaluation**: hand-written once, now neural networks (NNUE).
- **Endings**: [tablebase](/Chess/endgames.md) lookups.

## Milestones

- **1997**: Deep Blue beats Kasparov, the reigning world champion, 3½–2½.
- **2017**: AlphaZero learns chess from self-play alone.
- Today Stockfish is rated well above any human.
