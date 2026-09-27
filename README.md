# Box Fight Lab

A third-person building and editing sandbox that runs in the browser. It uses plain HTML, CSS and JavaScript, with [three.js](https://threejs.org/) r128 loaded from a CDN.

## Run it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
```

Then go to http://localhost:8000.

## What's in it

- **Building.** Walls, floors, stairs and cones go on a 5.12 m × 3.84 m grid, the same proportions as Fortnite. A blue preview shows where the next piece goes. Hold the mouse button to turbo build. Builds start at 10% health and build up over time (wood 150 HP, brick 300 HP, metal 500 HP).
- **Structural support.** Every piece has to connect to the ground through other pieces. Break a supporting piece and anything left floating collapses.
- **Editing.** Walls have a 3×3 grid and floors and cones have 2×2. Cut-outs get rounded corners, and wide openings that reach the ground become arches. An edit that would leave floating wall chunks is rejected. You can confirm on release or with the edit key. Drag across stairs to turn them around.
- **Combat.** A pickaxe for harvesting wood, brick and metal, and an assault rifle with aim down sights (right-click, or LT on a controller). There are target dummies to shoot, and sentry turrets that fire at you, and their shots break your builds.
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
