# Hyper Shot Arena

A fan-made, single-file browser FPS inspired by the Roblox game *Hyper Shot*. It is
not an asset rip: the arena geometry is an approximation of the symmetric
two-base / raised-center layout, built from primitives in Three.js.

Open `index.html` in a desktop browser (it needs a mouse and keyboard):

- Five bots with blocky Roblox-style R6 avatars patrol a waypoint graph, strafe
  and fire when they have line of sight, and respawn after 3.5 s.
- You carry an M16 with a Polaroid-style skin (white body, rainbow stripe).
  Left click fires a 3-round burst, `R` reloads, headshots deal 2.2x.
- First to 20 kills wins the round.

Three.js r128 is loaded from cdnjs; everything else is inline.
