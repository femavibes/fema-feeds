export interface ListitemEvent {
  operation: 'create' | 'delete'
  /** at://…/app.bsky.graph.listitem/… */
  listitemUri: string
  /** List owner DID (record author). */
  ownerDid: string
  /** Present on create. */
  listUri?: string
  /** Present on create. */
  subjectDid?: string
}

export interface ListitemJetstreamOptions {
  jetstreamUrl?: string
  /** When set, Jetstream filters to these DIDs (list owners). */
  wantedDids?: string[]
  onListitem: (event: ListitemEvent) => void | Promise<void>
  onError?: (err: unknown) => void
}

const DEFAULT_JETSTREAM_URL = 'wss://jetstream1.us-east.bsky.network/subscribe'
const COLLECTION = 'app.bsky.graph.listitem'

function subjectDidFromRecord(record: unknown): string | null {
  if (!record || typeof record !== 'object') return null
  const subject = (record as { subject?: unknown }).subject
  if (typeof subject === 'string' && subject.startsWith('did:')) return subject
  if (subject && typeof subject === 'object' && 'did' in subject) {
    const did = (subject as { did?: string }).did
    if (typeof did === 'string') return did
  }
  return null
}

function listUriFromRecord(record: unknown): string | null {
  if (!record || typeof record !== 'object') return null
  const list = (record as { list?: unknown }).list
  return typeof list === 'string' && list.startsWith('at://') ? list : null
}

function listitemUriFromEvent(did: string, rkey: string): string {
  return `at://${did}/${COLLECTION}/${rkey}`
}

/**
 * Jetstream consumer for Bluesky list membership (create/delete listitem).
 * Prefer wantedDids = list owner DIDs from author_list_cache.
 */
export async function startListitemJetstream(
  options: ListitemJetstreamOptions,
): Promise<{ stop: () => void; updateWantedDids: (dids: string[]) => void }> {
  const { Jetstream } = await import('@skyware/jetstream')
  const endpoint = options.jetstreamUrl ?? process.env.JETSTREAM_URL ?? DEFAULT_JETSTREAM_URL

  const client = new Jetstream({
    endpoint,
    wantedCollections: [COLLECTION],
    ...(options.wantedDids?.length ? { wantedDids: options.wantedDids } : {}),
  })

  client.onCreate(COLLECTION, (event) => {
    const rkey = event.commit.rkey
    if (typeof rkey !== 'string') return
    const listUri = listUriFromRecord(event.commit.record)
    const subjectDid = subjectDidFromRecord(event.commit.record)
    if (!listUri || !subjectDid) return
    void options.onListitem({
      operation: 'create',
      listitemUri: listitemUriFromEvent(event.did, rkey),
      ownerDid: event.did,
      listUri,
      subjectDid,
    })
  })

  client.onDelete(COLLECTION, (event) => {
    const rkey = event.commit.rkey
    if (typeof rkey !== 'string') return
    void options.onListitem({
      operation: 'delete',
      listitemUri: listitemUriFromEvent(event.did, rkey),
      ownerDid: event.did,
    })
  })

  client.on('error', (err: unknown) => options.onError?.(err))
  client.start()

  return {
    stop: () => client.close(),
    updateWantedDids: (dids: string[]) => {
      try {
        client.updateOptions({ wantedDids: dids })
      } catch (err) {
        options.onError?.(err)
      }
    },
  }
}
