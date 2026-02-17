# WKT Editor

A browser-based editor for creating and editing [Well-Known Text (WKT)](https://en.wikipedia.org/wiki/Well-known_text_representation_of_geometry) geometry. Draw shapes on an interactive canvas and get live WKT output, or paste WKT to visualize it on the grid.

## Features

- **Draw geometries** — Point, LineString, and Polygon via Leaflet.draw toolbar
- **Bidirectional editing** — draw shapes to generate WKT, or paste/edit WKT to render on the map
- **Graph paper canvas** — clean grid background with adaptive spacing (no map tiles)
- **Quantize** — round all coordinates to 2 decimal places with one click
- **Keyboard shortcuts** — press Enter to finish drawing or save edits
- **Persistent state** — geometry is saved to localStorage and restored on reload

## Getting Started

```bash
npm install
npm run dev
```

The dev server listens on all network interfaces by default, so you can access it from other devices on your LAN.

## Building

```bash
npm run build
```

Output goes to `dist/`.

## Deploying to Cloudflare Pages

1. Push the repo to GitHub
2. In the Cloudflare dashboard, create a new Pages project connected to the repo
3. Set:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Deploy

No server-side code — it's a fully static SPA.

## Tech Stack

- [React](https://react.dev) + TypeScript
- [Vite](https://vite.dev)
- [Leaflet](https://leafletjs.com) + [Leaflet.draw](https://github.com/Leaflet/Leaflet.draw)
- [Tailwind CSS](https://tailwindcss.com)

## License

MIT
