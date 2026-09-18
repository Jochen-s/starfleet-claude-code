# Hypershot Arena

A fan-made, single-file browser FPS inspired by the Roblox game *Hypershot*
(Frosted Studio / PhoenixSigns). It is not an asset rip: the arena geometry is
an approximation of a symmetric two-base / raised-center layout built from
primitives in Three.js, since no map layout is publicly documented.

Open `index.html` in a desktop browser (it needs a mouse and keyboard):

- Five bots with blocky Roblox-style R6 avatars patrol a waypoint graph, strafe
  and fire when they have line of sight, and respawn after 3.5 s.
- You carry the M16 with the Azure Polarized skin: deep blue metallic body with
  cyan bands that shift hue. Left click fires a 3-round burst, `R` reloads,
  headshots deal 2.2x.
- Movement mirrors Hypershot's kit: sprint (`Shift`), slide (`C` while
  sprinting), dash (`Q`, 5 s cooldown) and a double jump.
- First to 20 kills wins the round.

Three.js r128 is loaded from cdnjs; everything else is inline.
