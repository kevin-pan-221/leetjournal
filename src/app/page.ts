export type Page =
  | 'today'
  | 'focus'
  | 'review-focus'
  | 'garden-focus'
  | 'problems'
  | 'journal'
  | 'reviews'
  | 'garden'
  | 'settings'

export function isFocusPage(page: Page): boolean {
  return page === 'focus' || page === 'review-focus' || page === 'garden-focus'
}
