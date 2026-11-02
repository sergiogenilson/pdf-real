# pdf-real

**pdf-real** — PDF Prompt Injection Scanner.

Ferramenta gratuita que roda **inteiramente no navegador** para detectar, revelar e analisar instruções ocultas em documentos PDF — especialmente tentativas de *prompt injection* destinadas a manipular modelos de linguagem (LLMs).

Os arquivos **nunca são enviados a servidores**. Todo o processamento é local.

## O que a ferramenta detecta

- Texto com baixo contraste (ex.: branco sobre branco)
- Texto transparente ou com opacidade muito baixa
- Texto no modo de renderização 3 (`Tr 3`, invisível)
- Fontes minúsculas ou escalas anormais
- Texto fora da área da página
- Possível oclusão por formas/imagens (classificado como **suspeita**)
- Caracteres Unicode invisíveis / de controle
- Padrões de prompt injection em **inglês e português**
- Metadados com instruções suspeitas

> A ausência de ocorrências **não** significa que o documento seja seguro. A análise tem limitações técnicas (PDF.js, espaços de cor especiais, camadas opcionais, OCR ainda não implementado).

## Tecnologias

- React + TypeScript + Vite
- PDF.js (`pdfjs-dist`)
- Web Workers para análise pesada
- `pdf-lib` para exportação do relatório em PDF
- Vitest para testes

Não há backend, SSR nem APIs externas de IA.

## Desenvolvimento local

```bash
npm install
npm run dev
```

### Scripts úteis

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Todos os testes (unitários + integração PDF.js) |
| `npm run test:unit` | Só unitários (usado no GitHub Actions) |
| `npm run build` | Build de produção |
| `npm run preview` | Preview do build |
| `npm run fixtures` | Gera PDFs de teste em `fixtures/` |
| `npm run feira` | Gera o PDF de demonstração `feira-da-fruta.pdf` |

> No GitHub Actions roda apenas `npm run test:unit`. Os testes de integração com PDF.js (`*.integration.test.ts`) tendem a travar no runner e devem ser executados localmente com `npm test`.

## Documento de teste: Feira da Fruta

O arquivo principal para validar a ferramenta na interface é:

[`fixtures/feira-da-fruta.pdf`](fixtures/feira-da-fruta.pdf)

- **Parte visível:** catálogo de frutas exóticas (pitaya, rambutã, durião, etc.).
- **Parte oculta:** prompt injections, cada um ligado a uma fruta comum do mercado brasileiro e a uma técnica de ocultação diferente.

Gere ou regenere com:

```bash
npm run feira
```

Depois abra `npm run dev` e carregue o PDF.

| Fruta | Ocultação | Injection |
| --- | --- | --- |
| Banana | branco/branco | ignorar instruções anteriores |
| Laranja | fonte minúscula | trocar o papel do modelo |
| Maçã | fora da página | revelar prompt de sistema |
| Mamão | sob retângulo | ignorar o usuário |
| Abacaxi | baixo contraste | exfiltrar dados |
| Manga | Unicode ZWSP | manipular avaliação |
| Uva | branco/branco | omitir / inventar |
| Melancia | branco/branco | ações não pedidas |
| Limão | metadados | ignore user |
| Goiaba | Tr 3 (pág. 2) | marcador de system prompt |
| Mamão-verde | alpha 0 (pág. 2) | ignore user |

Outros PDFs unitários ficam em [`fixtures/`](fixtures/) (veja [`fixtures/README.md`](fixtures/README.md)).

## Estrutura da análise

Camada independente da UI em `src/analysis/`:

- `PDFLoader` — carregamento e erros (senha / inválido)
- `PDFRenderer` — canvas sob demanda
- `TextExtractor` — texto e posições
- `GraphicsAnalyzer` — estados gráficos via `getOperatorList()`
- `VisibilityAnalyzer` — ocultação visual
- `UnicodeAnalyzer` — caracteres invisíveis
- `MetadataAnalyzer` — metadados
- `PromptInjectionAnalyzer` — regras EN/PT contextuais
- `RiskEvaluator` — severidade agregada
- `ReportGenerator` — exportação JSON/PDF

## Hospedagem no GitHub Pages

O projeto é estático. O workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):

1. Instala dependências (`npm ci`)
2. Executa testes (`npm test`)
3. Gera o build (`npm run build`)
4. Publica o diretório `dist`

### Configuração no repositório

1. Em **Settings → Pages**, escolha a fonte **GitHub Actions**.
2. Faça push na branch `main` (ou `master`) ou dispare o workflow manualmente.

### Project pages (`https://usuario.github.io/pdf-real/`)

Se **não** existir um arquivo `CNAME` na raiz, o workflow define:

```bash
VITE_BASE_PATH=/pdf-real/
```

O Vite usa esse valor em `base`, garantindo que assets e o worker do PDF.js funcionem no subcaminho.

### Domínio personalizado (raiz `/`)

1. Crie um arquivo `CNAME` na raiz do repositório com o domínio (ex.: `scanner.exemplo.com`).
2. Configure o DNS conforme a documentação do GitHub Pages.
3. O workflow detecta o `CNAME` e usa `VITE_BASE_PATH=/`.

### Build local com base path

```bash
VITE_BASE_PATH=/pdf-real/ npm run build
```

## Privacidade e segurança

- Processamento 100% local
- Sem upload de PDFs
- Sem transmissão do texto extraído
- Anotações/JavaScript do PDF não são executados (`annotationMode` desabilitado)
- Instruções encontradas no documento **não** são tratadas como comandos da aplicação
- Recursos são liberados ao remover o documento

## Licença

Uso livre para fins educacionais e de segurança. Contribuições são bem-vindas.
