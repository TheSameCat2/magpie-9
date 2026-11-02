import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkBudgets, chunkName } from './check-bundle-size.js'

test('chunkName drops the Vite content hash', () => {
  assert.equal(chunkName('assets/index-CHfMUJbL.css'), 'index.css')
  assert.equal(chunkName('assets/three-DDIVtEjf.js'), 'three.js')
  assert.equal(chunkName('assets/index-Bk5R_7J7.js'), 'index.js')
  assert.equal(chunkName('index.html'), 'index.html')
})

test('checkBudgets passes chunks inside their budget', () => {
  const { errors, rows } = checkBudgets([{ file: 'assets/three-aaaaaaaa.js', gzip: 90 }], { 'three.js': 100 })
  assert.deepEqual(errors, [])
  assert.equal(rows[0].budget, 100)
})

test('checkBudgets flags a chunk over budget', () => {
  const { errors } = checkBudgets([{ file: 'assets/three-aaaaaaaa.js', gzip: 101 }], { 'three.js': 100 })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /over its 100 B budget/)
})

test('checkBudgets flags an unbudgeted chunk and a missing one', () => {
  const { errors } = checkBudgets([{ file: 'assets/extra-aaaaaaaa.js', gzip: 1 }], { 'three.js': 100 })
  assert.equal(errors.length, 2)
  assert.match(errors[0], /no budget for "extra.js"/)
  assert.match(errors[1], /"three.js" has a budget but was not built/)
})
