# Outside Today

Outside Today is a small daily outdoor safety helper for `outsidetoday.stanho.dev`.

It helps users decide whether it is a good time to go outside using:

- UV index
- Air quality
- Feels-like temperature
- Rain chance
- Wind speed
- Better outdoor time windows

Data comes from [Open-Meteo](https://open-meteo.com/), so the MVP does not need a backend or API keys.

## Tech Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- GitHub Pages

## Local Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Deployment

The site is configured for GitHub Pages with `.github/workflows/deploy.yml`.

After pushing to a GitHub repository:

1. Go to repository `Settings > Pages`.
2. Set the source to `GitHub Actions`.
3. Make sure your DNS for `outsidetoday.stanho.dev` points to GitHub Pages.
4. Push to `main`.

The `public/CNAME` file sets the custom domain to `outsidetoday.stanho.dev`.
