# Buildesk Convertor

Professional DOCX ↔ HTML bidirectional document editor.

## Run

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (typically http://localhost:5173).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Typecheck and production build |
| `npm run preview` | Preview production build |
| `npm test` | Run round-trip and unit tests |
| `npm run lint` | Lint with oxlint |

## Round-trip workflow

1. Upload a `.docx` (or create a blank document)
2. Edit in the visual document panel — HTML updates automatically
3. Edit HTML in the source panel — the visual document updates when HTML is valid
4. Export DOCX or HTML
5. Re-upload exported HTML to restore the internal document model (via embedded metadata)

## Architecture

Canonical **internal document model** is the source of truth. DOCX, HTML, and the visual editor all serialize to/from that model. See `src/core/`.
