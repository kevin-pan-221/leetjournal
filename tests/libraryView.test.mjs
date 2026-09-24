import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultBookView, readBookView, saveBookView, readOpenBook, saveOpenBook } from '../src/utils/libraryView.ts'

test('library views survive remounts and stay independent per book', () => {
  const data = new Map()
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  }
  assert.deepEqual(readBookView('neetcode'), defaultBookView)
  const view = { query: 'sum', difficulty: 'Medium', status: 'Unseen', category: 'Arrays & Hashing' }
  saveBookView('neetcode', view)
  saveOpenBook('neetcode')
  assert.deepEqual(readBookView('neetcode'), view)
  assert.equal(readOpenBook(), 'neetcode')
  assert.deepEqual(readBookView('another-book'), defaultBookView)
  saveOpenBook(null)
  assert.equal(readOpenBook(), null)
  assert.deepEqual(readBookView('neetcode'), view)
})

test('invalid or unavailable storage falls back safely', () => {
  globalThis.localStorage = { getItem: () => '{broken' }
  assert.deepEqual(readBookView('neetcode'), defaultBookView)
  globalThis.localStorage = { getItem: () => JSON.stringify({ difficulty: 'Impossible', query: 5, status: 'Gone' }) }
  assert.deepEqual(readBookView('neetcode'), defaultBookView)
  assert.equal(readOpenBook(), null)
  globalThis.localStorage = {
    getItem: () => { throw new Error('Unavailable') },
    setItem: () => { throw new Error('Full') },
  }
  assert.deepEqual(readBookView('neetcode'), defaultBookView)
  assert.doesNotThrow(() => saveBookView('neetcode', defaultBookView))
  assert.doesNotThrow(() => saveOpenBook('neetcode'))
})
