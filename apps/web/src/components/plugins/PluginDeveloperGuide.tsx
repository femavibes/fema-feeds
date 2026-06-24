import type { ReactNode } from 'react'

import {

  BUILD_COMMANDS,

  EXAMPLE_INJECTOR_RUST,

  EXAMPLE_RANKER_RUST,

  EXAMPLE_REPO_PATH,

  EXAMPLE_WASM_NAME,

  EXAMPLE_WASM_URL,

  INJECTOR_REQUEST_EXAMPLE,

  INJECTOR_RESPONSE_EXAMPLE,

  MANIFEST_EXAMPLE,

  PIPELINE_STEPS,

  PLUGIN_HOOKS,

  PLUGIN_LIMITS,

  RANKER_REQUEST_EXAMPLE,

  RANKER_RESPONSE_EXAMPLE,

  RUNTIME_ROWS,

  VERIFICATION_ROWS,

} from '../../lib/plugin-developer-spec'



function CodeBlock({ children }: { children: string }) {

  return (

    <pre className="plugin-dev-code">

      <code>{children}</code>

    </pre>

  )

}



function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {

  return (

    <section id={id} className="plugin-dev-section">

      <h3>{title}</h3>

      {children}

    </section>

  )

}



export function PluginDeveloperGuide() {

  return (

    <article className="plugin-developer-guide">

      <header className="plugin-dev-head">

        <h2>Plugin developer guide</h2>

        <p className="card-hint">

          Technical requirements for custom code packages — rankers and injectors — including WASM

          contracts, host limits, verification, and publishing.

        </p>

      </header>



      <nav className="plugin-dev-toc" aria-label="Guide sections">

        <a href="#overview">Overview</a>

        <a href="#pipeline">Pipeline</a>

        <a href="#verification">Verification</a>

        <a href="#runtimes">Runtimes</a>

        <a href="#ranker">Ranker contract</a>

        <a href="#injector">Injector contract</a>

        <a href="#remote">Remote API</a>

        <a href="#manifest">Manifest</a>

        <a href="#limits">Host limits</a>

        <a href="#publish">Publish flow</a>

        <a href="#build">Build WASM</a>

        <a href="#example">Example plugin</a>

      </nav>



      <Section id="overview" title="Overview">

        <p>

          CFB extensions fall into two tiers. <strong>Native JSON</strong> packages (logic blocks,

          sort packs) are edited in the UI and need no verification. <strong>Custom code</strong>{' '}

          packages (rankers, injectors) run at skeleton serve time and require{' '}

          <strong>publisher verification</strong> before you can create or publish them.

        </p>

        <table className="plugin-dev-table">

          <thead>

            <tr>

              <th>Kind</th>

              <th>When it runs</th>

              <th>Custom code?</th>

            </tr>

          </thead>

          <tbody>

            <tr>

              <td>Sort pack</td>

              <td>Candidate pool build (pool sort)</td>

              <td>No — native JSON formulas</td>

            </tr>

            <tr>

              <td>Ranker</td>

              <td>Skeleton serve (`{PLUGIN_HOOKS.ranker}`)</td>

              <td>Yes — WASM, worker, remote, or native adapter</td>

            </tr>

            <tr>

              <td>Injector</td>

              <td>After ranker (`{PLUGIN_HOOKS.injector}`)</td>

              <td>Yes — WASM, worker, remote, or native adapter</td>

            </tr>

          </tbody>

        </table>

      </Section>



      <Section id="pipeline" title="Serve-time pipeline">

        <p>Order is fixed on every skeleton page request:</p>

        <ol className="plugin-dev-pipeline">

          {PIPELINE_STEPS.map((step) => (

            <li key={step}>{step}</li>

          ))}

        </ol>

        <p className="card-hint">

          Rankers receive the organic candidate list after DB/pool sort. Injectors run on the ranked

          list and return URIs that CFB merges using per-feed slot rules (`every`, `maxPerPage`).

        </p>

      </Section>



      <Section id="verification" title="Publisher verification">

        <table className="plugin-dev-table">

          <thead>

            <tr>

              <th>Action</th>

              <th>Requirement</th>

            </tr>

          </thead>

          <tbody>

            {VERIFICATION_ROWS.map((row) => (

              <tr key={row.action}>

                <td>{row.action}</td>

                <td>{row.requirement}</td>

              </tr>

            ))}

          </tbody>

        </table>

        <p className="card-hint">

          Ask your deployment master for deployment verification, or the global marketplace operator

          (fema.monster) for global listings. Use <strong>Marketplace → Verify publisher</strong> to

          start the process.

        </p>

      </Section>



      <Section id="runtimes" title="Runtimes">

        <table className="plugin-dev-table">

          <thead>

            <tr>

              <th>Runtime</th>

              <th>Typical latency</th>

              <th>Notes</th>

            </tr>

          </thead>

          <tbody>

            {RUNTIME_ROWS.map((row) => (

              <tr key={row.id}>

                <td>

                  <code>{row.id}</code>

                </td>

                <td>{row.latency}</td>

                <td>{row.notes}</td>

              </tr>

            ))}

          </tbody>

        </table>

      </Section>



      <Section id="ranker" title={`Ranker — export ${PLUGIN_HOOKS.ranker}`}>

        <p>

          WASM and worker rankers must export <code>{PLUGIN_HOOKS.ranker}</code> via the{' '}

          <a href="https://extism.org/docs/quickstart/plugin-quickstart" target="_blank" rel="noreferrer">

            Extism PDK

          </a>

          . Input and output are JSON strings.

        </p>

        <p className="plugin-dev-label">Request</p>

        <CodeBlock>{RANKER_REQUEST_EXAMPLE}</CodeBlock>

        <p className="plugin-dev-label">Response</p>

        <CodeBlock>{RANKER_RESPONSE_EXAMPLE}</CodeBlock>

        <ul className="plugin-dev-list">

          <li>

            Return a reordering of <code>candidates</code>. Subsets are allowed — missing URIs are

            appended in original order by the host.

          </li>

          <li>Only <code>at://</code> URIs are kept; others are dropped.</li>

          <li>

            Duplicates and unknown URIs are ignored. Host validates against the candidate set.

          </li>

          <li>

            Per-feed <code>config</code> is passed through from the feed Sorting tab subscription.

          </li>

          <li>

            <code>candidatePosts</code> — optional enrichment from CFB pool data (engagement, author

            followers, media/alt, indexed time). Scoring plugins should declare{' '}

            <code>ranker:enriched_candidates</code> in the manifest. See{' '}

            <code>publisher-workspace/fema-personalized-rank</code> for a reference implementation.

          </li>

        </ul>

      </Section>



      <Section id="injector" title={`Injector — export ${PLUGIN_HOOKS.injector}`}>

        <p>

          WASM and worker injectors must export <code>{PLUGIN_HOOKS.injector}</code>. The host passes

          slot rules from the feed; your plugin cannot override caps.

        </p>

        <p className="plugin-dev-label">Request</p>

        <CodeBlock>{INJECTOR_REQUEST_EXAMPLE}</CodeBlock>

        <p className="plugin-dev-label">Response</p>

        <CodeBlock>{INJECTOR_RESPONSE_EXAMPLE}</CodeBlock>

        <ul className="plugin-dev-list">

          <li>

            <code>slots.every</code> — insert after every N organic posts (minimum 1).

          </li>

          <li>

            <code>slots.maxPerPage</code> — max injected URIs per skeleton page (CFB enforces).

          </li>

          <li>URIs already in the organic page are skipped when merging.</li>

          <li>Response URIs must start with <code>at://</code>.</li>

        </ul>

      </Section>



      <Section id="remote" title="Remote endpoints">

        <p>

          For <code>runtime: remote</code>, CFB POSTs the same JSON bodies to your HTTPS endpoint

          when serving a skeleton page.

        </p>

        <ul className="plugin-dev-list">

          <li>

            Ranker: POST body = ranker request JSON → respond with <code>{`{ "uris": [...] }`}</code>

          </li>

          <li>

            Injector: POST body = injector request JSON → respond with{' '}

            <code>{`{ "uris": [...] }`}</code>

          </li>

          <li>Headers: <code>content-type: application/json</code>, <code>accept: application/json</code></li>

          <li>Non-2xx responses fail the hook; CFB falls back to organic order (ranker) or no injects.</li>

        </ul>

      </Section>



      <Section id="manifest" title="Package manifest">

        <p>Every custom code listing stores a manifest alongside metadata:</p>

        <CodeBlock>{MANIFEST_EXAMPLE}</CodeBlock>

        <ul className="plugin-dev-list">

          <li>

            <code>hooks</code> must include <code>{PLUGIN_HOOKS.ranker}</code> or{' '}

            <code>{PLUGIN_HOOKS.injector}</code> matching <code>kind</code>.

          </li>

          <li>

            <code>permissions</code> is reserved for future host capabilities (network, storage).

            Currently empty.

          </li>

          <li>

            <code>configSchema</code> documents feed-level config; optional JSON Schema object.

          </li>

        </ul>

      </Section>



      <Section id="limits" title="Host limits (enforced)">

        <table className="plugin-dev-table">

          <tbody>

            <tr>

              <td>Hook timeout</td>

              <td>

                <strong>{PLUGIN_LIMITS.hookTimeoutMs} ms</strong> per call (WASM / worker)

              </td>

            </tr>

            <tr>

              <td>WASM linear memory</td>

              <td>

                <strong>{PLUGIN_LIMITS.wasmMaxMemoryBytes / (1024 * 1024)} MB</strong> (

                {PLUGIN_LIMITS.wasmMaxMemoryPages} pages)

              </td>

            </tr>

            <tr>

              <td>Artifact upload size</td>

              <td>

                <strong>{PLUGIN_LIMITS.wasmMaxBytes / (1024 * 1024)} MB</strong> max per version

              </td>

            </tr>

            <tr>

              <td>Skeleton page size</td>

              <td>Up to {PLUGIN_LIMITS.skeletonPageMax} URIs per request</td>

            </tr>

            <tr>

              <td>Sandbox</td>

              <td>Extism / WASI — no database or network from guest unless host adds functions</td>

            </tr>

            <tr>

              <td>Module cache</td>

              <td>Keyed by artifact sha256; evicted on re-upload</td>

            </tr>

          </tbody>

        </table>

      </Section>



      <Section id="publish" title="Publish flow">

        <ol className="plugin-dev-list">

          <li>

            <strong>New custom code</strong> (sidebar) — pick kind (ranker / injector) and runtime.

          </li>

          <li>

            For WASM or worker: upload <code>.wasm</code> in collection detail (required before

            publish).

          </li>

          <li>Test from your collection; publish to deployment or submit to global marketplace.</li>

          <li>Subscribers install from Marketplace → apply on feed <strong>Sorting</strong> tab.</li>

          <li>Preview skeleton to verify behavior (e.g. reversed order with the example ranker).</li>

        </ol>

        <p className="card-hint">

          API: <code>POST /api/plugins</code>, <code>POST /api/plugins/:id/wasm-artifact</code>{' '}

          (base64 body), <code>PATCH /api/plugins/:id</code>, publish visibility endpoints.

        </p>

      </Section>



      <Section id="build" title="Build WASM (Rust)">

        <p>

          Use any Extism-supported language; Rust is the reference path in this repo. Target{' '}

          <code>wasm32-wasip1</code> and export the hook as a PDK function.

        </p>

        <CodeBlock>{BUILD_COMMANDS}</CodeBlock>

        <p className="plugin-dev-label">Ranker template (Rust)</p>

        <CodeBlock>{EXAMPLE_RANKER_RUST}</CodeBlock>

        <p className="plugin-dev-label">Injector template (Rust)</p>

        <CodeBlock>{EXAMPLE_INJECTOR_RUST}</CodeBlock>

      </Section>



      <Section id="example" title="Example: reverse ranker">

        <p>

          The repo ships a working ranker that reverses the candidate list — useful to validate upload,

          publish, and feed wiring end-to-end.

        </p>

        <div className="plugin-dev-example-actions">

          <a className="btn btn-primary btn-sm" href={EXAMPLE_WASM_URL} download={EXAMPLE_WASM_NAME}>

            Download {EXAMPLE_WASM_NAME}

          </a>

          <span className="card-hint">

            Source: <code>{EXAMPLE_REPO_PATH}</code> · ~235 KB compiled

          </span>

        </div>

        <ol className="plugin-dev-list">

          <li>Verified publisher → <strong>New custom code</strong> → Ranker, runtime WASM.</li>

          <li>Upload the downloaded <code>{EXAMPLE_WASM_NAME}</code> in collection detail.</li>

          <li>Publish → subscribe → set as serve-time ranker on a feed Sorting tab.</li>

          <li>Preview skeleton — order should be reversed vs pool sort alone.</li>

        </ol>

        <p className="plugin-dev-label">Example source ({PLUGIN_HOOKS.ranker})</p>

        <CodeBlock>{EXAMPLE_RANKER_RUST}</CodeBlock>

        <p className="card-hint">

          Also documented in <code>docs/WASM_PLUGINS.md</code> and{' '}

          <code>{EXAMPLE_REPO_PATH}/README.md</code>.

        </p>

      </Section>

    </article>

  )

}


