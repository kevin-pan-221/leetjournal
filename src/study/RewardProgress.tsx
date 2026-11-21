import { ItemSprite } from './ItemSprite'
import { itemName, type StudyState } from './types'

export function RewardProgress({
  reward,
}: {
  reward: StudyState['nextReward']
}) {
  const progress = Math.max(0, Math.min(100, 100 - reward.xpRequired))
  return (
    <div className="study-reward">
      <div className="study-reward-icon">
        <ItemSprite
          item={{ ...reward, id: -1, earnedAt: '', enchantments: [] }}
        />
      </div>
      <div className="study-reward-detail">
        <small>Next unlock</small>
        <strong>{itemName(reward)}</strong>
        <div
          className="study-reward-track"
          role="progressbar"
          aria-label={`Progress toward ${itemName(reward)}`}
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: `${progress}%` }} />
        </div>
        <span>{reward.xpRequired} XP to earn</span>
      </div>
    </div>
  )
}
