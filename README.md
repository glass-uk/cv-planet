# CV Planet

**Try it live → [glass-uk.github.io/cv-planet](https://glass-uk.github.io/cv-planet/)**

An interactive CV you drive around. Steer a little rover over a low-poly 3D planet and read the CV off voxel signposts scattered across its surface.

Built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). No build step required to view it — `index.html` ships an import map and runs straight from a static server.

## Try it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

To produce a static bundle:

```bash
npm run build      # outputs to dist/
npm run preview    # serves the built bundle
```

## Controls

| Action          | Keyboard                | Touch              |
| --------------- | ----------------------- | ------------------ |
| Drive           | `W` `A` `S` `D` / arrows | On-screen D-pad   |
| Boost           | `Shift`                 | ⚡ button          |
| Travel to a CV  | Click a landmark / sign | Tap                |
| Rotate camera   | Click + drag            | Drag               |
| Photo mode      | `P`                     | ▣ button           |
| Sound           | —                       | Sound toggle       |

The rover stays parked at the top of the globe — driving rotates the whole planet underneath it, so the world scrolls into view. Clicking a landmark slerps the planet's orientation until that sign sits upright in front of the camera.

## Editing your CV

All content lives in [`src/cvData.js`](src/cvData.js). No 3D knowledge needed.

```js
export const profile = {
  name: 'Your Name',
  role: 'What you do',
  tagline: 'Drive around to explore my work →',
};

export const stations = [
  {
    id: 'about',
    title: 'About',
    color: '#FF6F59',
    lat: 22,      // -90 (south pole) … +90 (north pole)
    lon: 0,       //   0 … 360 around the equator
    items: [
      { head: 'Headline line', sub: 'Supporting detail' },
      // …
    ],
  },
  // add / remove / reorder stations freely
];
```

Each station becomes a voxel signpost at its lat/lon, linked into a road loop that visits every landmark.

## Project layout

```
index.html        page shell, HUD, styles, import map
src/
  cvData.js       your CV content (the only file you need to edit)
  main.js         orchestrator: renderer, scene, camera, planet group, tick loop
  terrain.js      height field + the lat/lon ↔ sphere helpers everything builds on
  world.js        on-planet content: biomes, water, scenery, road, signs, collisions
  builders.js     make* functions for each voxel structure (mosque, windmill, sheep…)
  voxel.js        vbox() cube primitive + mesh-merging for performance + palettes
  atmosphere.js   sky, sun, day/night cycle, and per-frame scenery animation
  rover.js        the rover model and its driving/bob animation
  signs.js        renders a station's CV card to a canvas texture
  ui.js           HUD: identity, landmark list, compass, photo mode
  input.js        keyboard, touch d-pad, click-to-travel picking
  particles.js    dust and debris
  audio.js        WebAudio engine hum and crash sounds
vite.config.js    minimal Vite config
package.json      three + vite
```

Each module is a `createX(...)` factory that builds its own meshes and returns a small handle; `main.js` wires them together. Tunables (planet radius, drive speed, palette) live at the top of `src/main.js` in the `CONFIG` block; biome definitions live at the top of `src/world.js`.

## License

Personal project — fork it and make it your own.
