import { describe, expect, it } from 'vitest'
import { appendToast, removeToast, type Toast } from '../useToasts'

const toast = (id: number): Toast => ({ id, message: `toast ${id}` })

describe('toast stack', () => {
  it('keeps only the three newest toasts', () => {
    const stack = [1, 2, 3, 4].reduce<Toast[]>((current, id) => appendToast(current, toast(id)), [])
    expect(stack.map((item) => item.id)).toEqual([2, 3, 4])
  })

  it('removes one toast without disturbing the others', () => {
    const stack = [1, 2, 3].map(toast)
    expect(removeToast(stack, 2).map((item) => item.id)).toEqual([1, 3])
  })

  it('leaves the stack alone when the id is unknown', () => {
    const stack = [1, 2].map(toast)
    expect(removeToast(stack, 99)).toEqual(stack)
  })
})
