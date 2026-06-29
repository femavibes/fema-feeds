import type { L2CompareOp, L2Expr } from '@cfb/core-types'
import type { L2RuntimeContext } from './context.js'
import { numericFieldValue } from './context.js'

export function evalExpr(ctx: L2RuntimeContext, expr: L2Expr): number {
  switch (expr.type) {
    case 'literal':
      return expr.value
    case 'field':
      return numericFieldValue(ctx, expr.field)
    case 'enrichment_field': {
      const data = ctx.enrichment?.[expr.enricherId]
      if (!data) return 0
      const val = data[expr.field]
      return typeof val === 'number' ? val : 0
    }
    case 'binary': {
      const left = evalExpr(ctx, expr.left)
      const right = evalExpr(ctx, expr.right)
      switch (expr.op) {
        case '+':
          return left + right
        case '-':
          return left - right
        case '*':
          return left * right
        case '/':
          return right === 0 ? 0 : left / right
        case '**':
          return Math.pow(left, right)
        case 'min':
          return Math.min(left, right)
        case 'max':
          return Math.max(left, right)
      }
      return 0
    }
    case 'unary': {
      const val = evalExpr(ctx, expr.operand)
      switch (expr.op) {
        case 'log':
          return val > 0 ? Math.log(val) : 0
        case 'sqrt':
          return val >= 0 ? Math.sqrt(val) : 0
        case 'abs':
          return Math.abs(val)
        case 'floor':
          return Math.floor(val)
        case 'ceil':
          return Math.ceil(val)
        case 'neg':
          return -val
      }
      return 0
    }
    case 'clamp': {
      const val = evalExpr(ctx, expr.value)
      const min = evalExpr(ctx, expr.min)
      const max = evalExpr(ctx, expr.max)
      return Math.min(Math.max(val, min), max)
    }
    case 'cond': {
      const left = evalExpr(ctx, expr.left)
      const right = evalExpr(ctx, expr.right)
      const passed = compareNumbers(left, expr.op, right)
      return evalExpr(ctx, passed ? expr.then : expr.else)
    }
    case 'ratio': {
      const num = evalExpr(ctx, expr.numerator)
      const den = evalExpr(ctx, expr.denominator)
      const guard = expr.guard ?? 1
      return den + guard === 0 ? 0 : num / (den + guard)
    }
  }
}

export function compareNumbers(left: number, op: L2CompareOp, right: number): boolean {
  switch (op) {
    case '==':
      return left === right
    case '!=':
      return left !== right
    case '<':
      return left < right
    case '<=':
      return left <= right
    case '>':
      return left > right
    case '>=':
      return left >= right
  }
}
