# ♟️ Game theory

The study of strategic decisions between rational players. Von Neumann and Morgenstern founded it in 1944.

## Chess is a solved *kind* of game

Chess is finite, deterministic, has two players and gives both full information. **Zermelo's theorem (1913)**: in such a game, either White can force a win, or Black can, or both sides can force at least a draw. Nobody knows which, because the tree is too big → [Combinatorics](/Mathematics/combinatorics.md).

## Minimax

To choose a move, assume the opponent replies with their best move, and repeat down the tree. **Alpha-beta pruning** skips branches that cannot change the result. It is the core of classical [Chess engines](/Chess/engines.md).
