# Box Fight Lab

A third-person building and editing sandbox that runs in the browser. It uses plain HTML, CSS and JavaScript, with [three.js](https://threejs.org/) r128 loaded from a CDN.

## Run it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
```

Then go to http://localhost:8000.

When the page is served by a server that answers `/__version` with a value that changes whenever the files change, it reloads itself automatically and keeps your builds.

## What's in it

- **Building.** Walls, floors, stairs (open treads between two side rails) and cones go on a 5.12 m × 3.84 m grid, the same proportions as Fortnite. A blue preview shows where the next piece goes. Hold the mouse button to turbo build. Builds start at 10% health and build up over time (wood 150 HP, brick 300 HP, metal 500 HP).
- **Structural support.** Every piece has to connect to the ground through other pieces. Break a supporting piece and anything left floating collapses.
- **Editing.** It follows [Fortnite's edit chart](https://i.redd.it/ab59co4rh2821.png). Selections the chart doesn't allow are rejected, and the edit's name shows when you confirm.
  - *Walls (3×3):* wall, window, door, half wall, double window, half wall door, low wall, small low wall, door + window, side wall, small side wall, triangle, arch and half arch. This includes their shifted, rotated and mirrored versions. Door edits get a door that swings open as you walk up.
  - *Floors (2×2):* floor, 3/4 floor, half floor, corner (a quarter circle) and bridge (a diagonal plank).
  - *Stairs (2×2):* drag a path across the tiles. Two tiles make a half ramp, three an L-shaped ramp, and four in a loop a U-shaped ramp. Cutting diagonally through all four makes a full ramp.
  - *Pyramids (2×2):* selected corners flip up. One tile gives the 1/4 pyramid, two on a side the ramp pyramid, two diagonal the half inverted pyramid, and three the 1/4 inverted pyramid.
- **Placement.** Builds follow your crosshair within reach and snap to your cell or one of the eight around it. The level depends on where you look. When you run up your own stairs, the next flight goes one level higher.
- **Combat.** A pickaxe for harvesting wood, brick and metal, and an assault rifle with aim down sights (right-click, or LT on a controller). There are target dummies to shoot, and sentry turrets that fire at you, and their shots break your builds.
- **Performance.** An FPS counter plus a frame rate limit, render resolution and shadow settings, all in the pause menu.
- **Controls.** All keyboard binds can be changed in the pause menu and are saved in your browser. Controllers use the Builder Pro layout through the Gamepad API.

## Default keys

| Action | Key |
| --- | --- |
| Move / jump | W A S D / Space |
| Pickaxe / rifle | 1 / 2 |
| Wall / floor / stairs / cone | Q / F / C / V |
| Place, fire, select edit tiles | Left mouse |
| Switch material, aim down sights, reset edit | Right mouse |
| Edit / confirm | G |
| Rotate build / reset edit | R |
| Pause | Esc |

## Files

- `index.html`: page markup, HUD and menu
- `styles.css`: HUD and menu styles
- `app.js`: rendering, physics, building, editing and input
