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
  main.js         the whole 3D scene: planet, terrain, scenery, rover, signs, input
  cvData.js       your CV content (the only file you need to edit)
vite.config.js    minimal Vite config
package.json      three + vite
```

Tunables (planet radius, drive speed, palette) live at the top of `src/main.js` in the `CONFIG` block.

## License

Personal project — fork it and make it your own.
