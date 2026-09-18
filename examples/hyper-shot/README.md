# Hypershot Arena

A fan-made, single-file browser FPS inspired by the Roblox game *Hypershot*
(Frosted Studio / PhoenixSigns).

The map is a reconstruction of **City Arena**, one of the map names listed on
the community wiki. No layout, screenshots or callouts were reachable from the
build environment, so the geometry is built from the name and the game's known
classic-Roblox city style seen in gameplay screenshots: a studded green baseplate, a main street and cross street, a tiered plaza with
a big red R, blue-glass office blocks with yellow trim and exterior stairs to the rooftops, trees, yellow arches, back
alleys, parked cars, bus shelters and a bus across each spawn end. It is not an
asset rip and is not an exact copy.

Open `index.html` in a browser:

- **Desktop**: WASD, mouse look, left click fires a 3-round burst, `Shift`
  sprint, `C` slide while sprinting, `Q` dash (5 s cooldown), Space double jump,
  `R` reload.
- **Phone / tablet**: touch controls appear automatically. Left thumb is a
  floating joystick (push far to sprint), right thumb drags to look, and there
  are fire, jump, dash, slide, reload and pause buttons. Landscape works best.
- Five bots with blocky Roblox-style R6 avatars patrol a waypoint graph that is
  generated from the map's walkable ground, strafe and fire when they have line
  of sight, and respawn after 3.5 s.
- You carry the M16 with the Azure Polarized skin: deep blue metallic body with
  cyan bands that shift hue. Headshots deal 2.2x. First to 20 kills wins.

Three.js r128 is loaded from cdnjs; everything else is inline.
