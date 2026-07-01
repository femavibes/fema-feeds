import type { L2Expr, L2NumericField, L2CompareOp } from '@cfb/core-types'

// --- Field aliases (what users type → actual L2NumericField) ---
export const FORMULA_FIELDS: Record<string, L2NumericField> = {
  likes: 'like_count',
  reposts: 'repost_count',
  replies: 'reply_count',
  quotes: 'quote_count',
  bookmarks: 'bookmark_count',
  followers: 'author_follower_count',
  follows: 'author_follows_count',
  posts: 'author_posts_count',
  text_len: 'text_length',
  images: 'image_count',
  video_size: 'video_size_bytes',
  hashtags: 'facet_tag_count',
  links: 'facet_link_count',
  mentions: 'facet_mention_count',
  editor_score: 'editor_score',
  age_hours: 'post_age_hours',
}

/** Personalization fields — viewer-relative signals available at serve time. */
export const PERSONALIZATION_FIELDS: Record<string, L2NumericField | string> = {
  // All sorting fields available too
  ...FORMULA_FIELDS,
  // Viewer-relative fields
  base_score: 'base_score',
  is_followed: 'is_followed',
  is_mutual: 'is_mutual',
  times_seen: 'times_seen',
  hours_since_seen: 'hours_since_seen',
  hours_since_last_open: 'hours_since_last_open',
  // Feed-scoped affinity (interactions via this feed)
  feed_affinity: 'feed_affinity',
  feed_affinity_likes: 'feed_affinity_likes',
  feed_affinity_reposts: 'feed_affinity_reposts',
  feed_affinity_replies: 'feed_affinity_replies',
  feed_affinity_quotes: 'feed_affinity_quotes',
  days_since_interaction: 'days_since_interaction',
}

export const FORMULA_FUNCTIONS = ['log', 'sqrt', 'abs', 'floor', 'ceil', 'min', 'max', 'clamp', 'pow', 'if'] as const

// --- Tokenizer ---
type TokenType = 'number' | 'ident' | 'op' | 'paren' | 'comma' | 'compare' | 'eof'
interface Token { type: TokenType; value: string; pos: number }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    if (input[i] === ' ' || input[i] === '\t' || input[i] === '\n') { i++; continue }

    // Numbers
    if (/[0-9.]/.test(input[i]!)) {
      const start = i
      while (i < input.length && /[0-9.]/.test(input[i]!)) i++
      tokens.push({ type: 'number', value: input.slice(start, i), pos: start })
      continue
    }

    // Identifiers / keywords
    if (/[a-zA-Z_]/.test(input[i]!)) {
      const start = i
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i]!)) i++
      tokens.push({ type: 'ident', value: input.slice(start, i), pos: start })
      continue
    }

    // Compare operators (2-char)
    if (i + 1 < input.length && ['>=', '<=', '==', '!='].includes(input.slice(i, i + 2))) {
      tokens.push({ type: 'compare', value: input.slice(i, i + 2), pos: i })
      i += 2
      continue
    }

    // Compare operators (1-char > <)
    if (input[i] === '>' || input[i] === '<') {
      tokens.push({ type: 'compare', value: input[i]!, pos: i })
      i++
      continue
    }

    // ** (power)
    if (input[i] === '*' && i + 1 < input.length && input[i + 1] === '*') {
      tokens.push({ type: 'op', value: '**', pos: i })
      i += 2
      continue
    }

    // Operators
    if ('+-*/'.includes(input[i]!)) {
      tokens.push({ type: 'op', value: input[i]!, pos: i })
      i++
      continue
    }

    // Parens
    if (input[i] === '(' || input[i] === ')') {
      tokens.push({ type: 'paren', value: input[i]!, pos: i })
      i++
      continue
    }

    // Comma
    if (input[i] === ',') {
      tokens.push({ type: 'comma', value: ',', pos: i })
      i++
      continue
    }

    // Unknown char — skip
    i++
  }
  tokens.push({ type: 'eof', value: '', pos: input.length })
  return tokens
}

// --- Parser (recursive descent, precedence climbing) ---
export interface ParseError { message: string; pos: number }
export type ParseResult = { ok: true; expr: L2Expr } | { ok: false; error: ParseError }

class Parser {
  private tokens: Token[]
  private pos = 0
  private fields: Record<string, string>

  constructor(tokens: Token[], fields?: Record<string, string>) {
    this.tokens = tokens
    this.fields = fields ?? FORMULA_FIELDS
  }

  private peek(): Token { return this.tokens[this.pos] ?? { type: 'eof', value: '', pos: 0 } }
  private advance(): Token { return this.tokens[this.pos++] ?? { type: 'eof', value: '', pos: 0 } }
  private expect(type: TokenType, value?: string): Token {
    const t = this.peek()
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw { message: `Expected ${value ?? type}, got "${t.value}"`, pos: t.pos } as ParseError
    }
    return this.advance()
  }

  parse(): L2Expr {
    const expr = this.parseExpr()
    if (this.peek().type !== 'eof') {
      throw { message: `Unexpected "${this.peek().value}"`, pos: this.peek().pos } as ParseError
    }
    return expr
  }

  private parseExpr(): L2Expr {
    return this.parseAddSub()
  }

  private parseAddSub(): L2Expr {
    let left = this.parseMulDiv()
    while (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.advance().value as '+' | '-'
      const right = this.parseMulDiv()
      left = { type: 'binary', op, left, right }
    }
    return left
  }

  private parseMulDiv(): L2Expr {
    let left = this.parsePower()
    while (this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.advance().value as '*' | '/'
      const right = this.parsePower()
      left = { type: 'binary', op, left, right }
    }
    return left
  }

  private parsePower(): L2Expr {
    let left = this.parseUnary()
    if (this.peek().type === 'op' && this.peek().value === '**') {
      this.advance()
      const right = this.parseUnary()
      left = { type: 'binary', op: '**', left, right }
    }
    return left
  }

  private parseUnary(): L2Expr {
    if (this.peek().type === 'op' && this.peek().value === '-') {
      this.advance()
      const operand = this.parseAtom()
      return { type: 'unary', op: 'neg', operand }
    }
    return this.parseAtom()
  }

  private parseAtom(): L2Expr {
    const t = this.peek()

    // Number literal
    if (t.type === 'number') {
      this.advance()
      return { type: 'literal', value: parseFloat(t.value) }
    }

    // Parenthesized expression
    if (t.type === 'paren' && t.value === '(') {
      this.advance()
      const expr = this.parseExpr()
      this.expect('paren', ')')
      return expr
    }

    // Identifier: field or function call
    if (t.type === 'ident') {
      this.advance()
      const name = t.value

      // Function call
      if (this.peek().type === 'paren' && this.peek().value === '(') {
        return this.parseFunctionCall(name, t.pos)
      }

      // Field reference
      const field = this.fields[name]
      if (field) {
        return { type: 'field', field: field as L2NumericField }
      }

      // Enrichment field: enrichment.enricherId.fieldName
      if (name === 'enrichment' && this.peek().type === 'ident') {
        // Expect dot-separated: we tokenize dots as part of ident or as separate?
        // Since our tokenizer doesn't handle dots in identifiers, handle via underscores:
        // enrichment_videoanalyzer_bitrate OR use a different syntax
        throw { message: `Use enrichment("enricherId", "field") syntax`, pos: t.pos } as ParseError
      }

      throw { message: `Unknown field "${name}"`, pos: t.pos } as ParseError
    }

    throw { message: `Unexpected "${t.value || 'end'}"`, pos: t.pos } as ParseError
  }

  private parseFunctionCall(name: string, pos: number): L2Expr {
    this.expect('paren', '(')
    const args = this.parseArgList()
    this.expect('paren', ')')

    switch (name) {
      case 'log':
      case 'sqrt':
      case 'abs':
      case 'floor':
      case 'ceil':
        if (args.length !== 1) throw { message: `${name}() takes 1 argument`, pos } as ParseError
        return { type: 'unary', op: name, operand: args[0]! }

      case 'min':
      case 'max':
        if (args.length !== 2) throw { message: `${name}() takes 2 arguments`, pos } as ParseError
        return { type: 'binary', op: name, left: args[0]!, right: args[1]! }

      case 'pow':
        if (args.length !== 2) throw { message: `pow() takes 2 arguments`, pos } as ParseError
        return { type: 'binary', op: '**', left: args[0]!, right: args[1]! }

      case 'clamp':
        if (args.length !== 3) throw { message: `clamp() takes 3 arguments (value, min, max)`, pos } as ParseError
        return { type: 'clamp', value: args[0]!, min: args[1]!, max: args[2]! }

      case 'if':
        // parseCondOrExpr already built the full cond node as args[0]
        if (args.length === 1 && args[0]?.type === 'cond') return args[0]
        throw { message: 'if() syntax: if(field > value, then_expr, else_expr)', pos } as ParseError

      case 'enrich': {
        // enrich(enricher_id, field_name) — not yet supported in text parser
        throw { message: 'enrich() not yet supported in text mode — use the JSON editor to add enrichment_field nodes', pos } as ParseError
      }

      default:
        throw { message: `Unknown function "${name}"`, pos } as ParseError
    }
  }

  private parseArgList(): L2Expr[] {
    const args: L2Expr[] = []
    if (this.peek().type === 'paren' && this.peek().value === ')') return args

    // First arg: might be a condition (for if())
    args.push(this.parseCondOrExpr())
    while (this.peek().type === 'comma') {
      this.advance()
      args.push(this.parseExpr())
    }
    return args
  }

  private parseCondOrExpr(): L2Expr {
    const left = this.parseExpr()
    if (this.peek().type === 'compare') {
      const op = this.advance().value as L2CompareOp
      const right = this.parseExpr()
      this.expect('comma')
      const thenExpr = this.parseExpr()
      this.expect('comma')
      const elseExpr = this.parseExpr()
      return { type: 'cond', op, left, right, then: thenExpr, else: elseExpr }
    }
    return left
  }
}

export function parseFormula(input: string, fields?: Record<string, string>): ParseResult {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: { message: 'Empty formula', pos: 0 } }
  try {
    const tokens = tokenize(trimmed)
    const parser = new Parser(tokens, fields)
    const expr = parser.parse()
    return { ok: true, expr }
  } catch (e) {
    if (e && typeof e === 'object' && 'message' in e && 'pos' in e) {
      return { ok: false, error: e as ParseError }
    }
    return { ok: false, error: { message: 'Parse error', pos: 0 } }
  }
}

// --- Decompiler: L2Expr → human-readable formula text ---
export function exprToFormula(expr: L2Expr, fields?: Record<string, string>): string {
  const fieldMap = fields ?? FORMULA_FIELDS
  return _decompile(expr, fieldMap)
}

function _decompile(expr: L2Expr, fieldMap: Record<string, string>): string {
  switch (expr.type) {
    case 'literal':
      return expr.value % 1 === 0 ? String(expr.value) : expr.value.toFixed(2)
    case 'field': {
      const alias = Object.entries(fieldMap).find(([, v]) => v === expr.field)
      return alias ? alias[0] : expr.field
    }
    case 'enrichment_field':
      return `enrich(${expr.enricherId}, ${expr.field})`
    case 'binary': {
      const l = _decompile(expr.left, fieldMap)
      const r = _decompile(expr.right, fieldMap)
      if (expr.op === 'min' || expr.op === 'max') return `${expr.op}(${l}, ${r})`
      if (expr.op === '**') return `pow(${l}, ${r})`
      const lWrap = expr.left.type === 'binary' && precedence(expr.left.op) < precedence(expr.op) ? `(${l})` : l
      const rWrap = expr.right.type === 'binary' && precedence(expr.right.op) <= precedence(expr.op) ? `(${r})` : r
      return `${lWrap} ${expr.op} ${rWrap}`
    }
    case 'unary':
      if (expr.op === 'neg') return `-${_decompile(expr.operand, fieldMap)}`
      return `${expr.op}(${_decompile(expr.operand, fieldMap)})`
    case 'clamp':
      return `clamp(${_decompile(expr.value, fieldMap)}, ${_decompile(expr.min, fieldMap)}, ${_decompile(expr.max, fieldMap)})`
    case 'cond':
      return `if(${_decompile(expr.left, fieldMap)} ${expr.op} ${_decompile(expr.right, fieldMap)}, ${_decompile(expr.then, fieldMap)}, ${_decompile(expr.else, fieldMap)})`
    case 'ratio':
      return `${_decompile(expr.numerator, fieldMap)} / (${_decompile(expr.denominator, fieldMap)} + ${expr.guard ?? 1})`
  }
}

function precedence(op: string): number {
  switch (op) {
    case '+': case '-': return 1
    case '*': case '/': return 2
    case '**': return 3
    default: return 0
  }
}
