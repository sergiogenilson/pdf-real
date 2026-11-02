# Fixtures de teste

PDFs de exemplo gerados por `npm run fixtures` (`scripts/generate-fixtures.mjs`).

| Arquivo | Cenário |
| --- | --- |
| `white-on-white.pdf` | Texto branco sobre fundo branco + injection |
| `alpha-zero.pdf` | Texto com ExtGState `ca=0` |
| `tr3-invisible.pdf` | Modo de renderização de texto 3 |
| `tiny-text.pdf` | Fonte minúscula |
| `off-page.pdf` | Texto fora da MediaBox |
| `occluded-text.pdf` | Texto sob retângulo |
| `visible-injection.pdf` | Prompt injection visível |
| `hidden-injection.pdf` | Prompt injection em baixo contraste |
| `invisible-unicode.pdf` | Caracteres de largura zero |
| `metadata-injection.pdf` | Injection em metadados |
| `scanned-placeholder.pdf` | Página só com imagem (sem OCR) |
| `clean.pdf` | Documento sem conteúdo suspeito |
| `feira-da-fruta.pdf` | Demo completa: frutas exóticas visíveis + injections ocultas com frutas comuns BR |

Gere a demo com `npm run feira`.
