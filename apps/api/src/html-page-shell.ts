/** Standalone HTML pages — hardcoded colors (no CSS vars / color-scheme). */
export const CFB_HTML_STYLES = `
  html, body {
    margin: 0;
    min-height: 100vh;
    background-color: #0f1219;
    color: #e8ecf4;
    font-family: system-ui, -apple-system, sans-serif;
    line-height: 1.45;
  }
  main {
    margin: 1.5rem auto;
    max-width: 52rem;
    padding: 0 1.25rem 2rem;
  }
  h1 {
    font-size: 1.25rem;
    margin: 0 0 0.5rem;
    color: #e8ecf4;
  }
  p {
    color: #e8ecf4;
  }
  .meta {
    color: #8b95a8;
    font-size: 0.9rem;
    margin: 0 0 1rem;
  }
  ol {
    margin: 0;
    padding-left: 1.5rem;
  }
  li {
    margin: 0.4rem 0;
    word-break: break-all;
    font-size: 0.85rem;
    color: #e8ecf4;
  }
  li::marker {
    color: #8b95a8;
    font-weight: 600;
  }
  li.empty {
    list-style: none;
    margin-left: -1.5rem;
    color: #8b95a8;
  }
  code {
    font-size: 0.85em;
    background: #1c2230;
    color: #e8ecf4;
    padding: 0.1em 0.35em;
    border-radius: 4px;
    border: 1px solid #2a3344;
  }
  a {
    color: #b8d4ff;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  a:hover {
    color: #dbe8ff;
  }
  strong {
    color: #e8ecf4;
  }
`

export function buildCfbHtmlPage(title: string, mainHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en" style="background-color:#0f1219;color:#e8ecf4">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>${title}</title>
  <style>${CFB_HTML_STYLES}</style>
</head>
<body style="background-color:#0f1219;color:#e8ecf4">
  <main>
${mainHtml}
  </main>
</body>
</html>`
}

export function buildSkeletonLoginRequiredHtml(): string {
  return buildCfbHtmlPage(
    'Login required',
    `    <h1>Login required</h1>
    <p class="meta">Open <a href="/">Custom Feed Builder</a>, sign in, then use <strong>Test feed skeleton</strong> from the Deploy panel (or reload this page while signed in).</p>`,
  )
}
