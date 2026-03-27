# Requirements Management Web Application

A web application for requirements management that supports the
company's requirements model and requirements process.

<!-- cSpell:disable-next-line -->
*En webbapplikation för kravhantering som stödjer företagets
kravmodell och kravprocess.*

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) 16 (React 19)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 4
- **Database:** Cloudflare D1 (SQLite) via Drizzle ORM
- **Internationalization:** next-intl (Swedish & English)
- **Hosting:** Cloudflare Workers
  (via [OpenNext](https://opennext.js.org/cloudflare))
- **Testing:** Vitest (unit) · Playwright (integration)
- **Linting:** Biome · Pyright · markdownlint · cspell

## Prerequisites

- Node.js >= 24
- npm

## Getting Started

```bash
# Install dependencies
npm install

# Set up the local database (reset, migrate & seed)
npm run db:setup

# Start the development server
npm run dev
```

The app will be available at `http://localhost:3000`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup,
database management, and coding guidelines.

## MCP Server

This project also includes an in-app MCP server for requirements management.

- User guide: [docs/mcp-server-user-guide.md](docs/mcp-server-user-guide.md)
- Contributor guide:
  [docs/mcp-server-contributor-guide.md](docs/mcp-server-contributor-guide.md)

## License

This project is licensed under the
[MIT License](LICENSE). © 2026 Viscalyx
