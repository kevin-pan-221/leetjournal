import { Check, ChevronRight, Sprout } from 'lucide-react'
import type { Problem, Review } from '../domain'
import { Card, Chip, EmptyState, PageHeader } from '../components/ui'
import { formatReviewDate, localDateKey, reviewTiming } from '../utils/dates'

interface ReviewsPageProps {
  reviews: Review[]
  onStart: (problem: Problem) => void
}

function ReviewRow({ review, due, onStart }: { review: Review; due: boolean; onStart: (problem: Problem) => void }) {
  return (
    <button
      type="button"
      className="review-queue-row"
      onClick={() => onStart(review.problem)}
      aria-label={`${due ? 'Start' : 'Review early'} ${review.problem.title}`}
    >
      <span className={`review-icon ${due ? 'due' : ''}`}>↻</span>
      <span className="review-problem">
        <b>{review.problem.title}</b>
        <small>
          <Chip tone={review.problem.difficulty.toLowerCase()}>{review.problem.difficulty}</Chip>
          {review.problem.category} · Memory step {review.reviewLevel + 1} · Last: {review.lastOutcome}
        </small>
      </span>
      <span className="review-date">
        <b>{reviewTiming(review.nextReviewDate)}</b>
        <small>{formatReviewDate(review.nextReviewDate)}</small>
      </span>
      <ChevronRight size={16} />
    </button>
  )
}

export function ReviewsPage({ reviews, onStart }: ReviewsPageProps) {
  const today = localDateKey()
  const due = reviews.filter((review) => review.nextReviewDate <= today)
  const upcoming = reviews.filter((review) => review.nextReviewDate > today)
  const concepts = Object.entries(due.reduce<Record<string, number>>((counts, review) => {
    counts[review.problem.category] = (counts[review.problem.category] ?? 0) + 1
    return counts
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3)

  return (
    <div className="page reviews-page">
      <PageHeader title="Reviews" subtitle="Reinforce what you’ve learned." />
      {!reviews.length ? (
        <EmptyState
          title="No reviews scheduled yet"
          text="Finish a focus session and its next review will appear here."
        />
      ) : (
        <>
          {due.length ? (
            <>
              <Card className="concepts">
                <h3>Concepts due</h3>
                <div>
                  {concepts.map(([category, count]) => (
                    <article key={category}>
                      <Sprout />
                      <b>{category}</b>
                      <small>{count} {count === 1 ? 'problem' : 'problems'} due</small>
                    </article>
                  ))}
                </div>
              </Card>
              <Card className="review-queue">
                <div className="review-section-head">
                  <div><h3>Ready to review</h3><p>Work through the most overdue items first.</p></div>
                  <span>{due.length} due</span>
                </div>
                {due.map((review) => (
                  <ReviewRow key={review.problem.id} review={review} due onStart={onStart} />
                ))}
                <button className="primary review-start" onClick={() => onStart(due[0].problem)}>
                  Start next review
                </button>
              </Card>
            </>
          ) : (
            <Card className="review-status">
              <span className="review-status-icon"><Check size={20} /></span>
              <div>
                <h2>You’re caught up for today</h2>
                <p>Your next review is {formatReviewDate(upcoming[0].nextReviewDate)}.</p>
              </div>
            </Card>
          )}
          {upcoming.length > 0 && (
            <Card className="review-queue upcoming-reviews">
              <div className="review-section-head">
                <div><h3>Coming up</h3><p>Your scheduled spaced-repetition queue.</p></div>
                <span>{upcoming.length} scheduled</span>
              </div>
              {upcoming.map((review) => (
                <ReviewRow key={review.problem.id} review={review} due={false} onStart={onStart} />
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
