import type { L2CompareOp, L2Expr } from '@cfb/core-types'
import type { L2RuntimeContext } from './context.js'
import { numericFieldValue } from './context.js'

export function evalExpr(ctx: L2RuntimeContext, expr: L2Expr): number {
  switch (expr.type) {
    case 'literal':
      return expr.value
    case 'field':
      return numericFieldValue(ctx, expr.field)
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
      }
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
