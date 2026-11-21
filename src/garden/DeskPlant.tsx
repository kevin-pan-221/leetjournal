interface DeskPlantProps {
  stage: number
  variety?: number
  animate?: boolean
}

/** Original vector artwork: no canvas engine, downloaded assets, or frame loop. */
export function DeskPlant({ stage, variety = 0, animate = true }: DeskPlantProps) {
  const species = variety % 3
  const petals = species === 2 ? 10 : species === 1 ? 8 : 12
  const flowerColor = ['#fff7db', '#d89b91', '#b4a0cb'][species]
  return (
    <svg className={`desk-plant ${animate ? 'desk-plant-animated' : ''}`} viewBox="0 0 200 240" aria-hidden="true">
      <ellipse cx="100" cy="224" rx="48" ry="7" fill="#554432" opacity=".09" />
      <path d="M61 172 L70 218 Q100 231 130 218 L139 172Z" fill={['#cda47e', '#9da98b', '#d0b9a0'][species]} />
      <path d="M64 180 L72 215 Q84 222 91 222 L83 181Z" fill="#fff" opacity=".12" />
      <ellipse cx="100" cy="173" rx="40" ry="12" fill="#e3c4a0" />
      <ellipse cx="100" cy="173" rx="33" ry="7" fill="#715845" />
      {stage === 0 ? <ellipse cx="100" cy="170" rx="5" ry="3" fill="#d9c6a2" transform="rotate(-25 100 170)" /> : (
        <g className="desk-plant-stem" key={stage}>
          <path d={stage === 1 ? 'M100 174 Q104 144 99 127' : 'M100 174 Q108 128 100 69'} fill="none" stroke="#657b4f" strokeWidth="4" strokeLinecap="round" />
          <path d="M102 153 Q65 157 63 132 Q90 128 102 153" fill="#80975e" />
          <path d="M100 139 Q105 110 130 111 Q133 137 100 139" fill="#9cae73" />
          <path d="M100 151 L73 137 M102 136 L123 117" fill="none" stroke="#5c7547" opacity=".4" />
          {stage >= 2 && <g className="desk-new-leaves">
            <path d="M103 117 Q71 113 68 91 Q97 88 103 117" fill="#718955" />
            <path d="M102 99 Q115 73 137 83 Q133 104 102 99" fill="#91a663" />
            <path d="M101 81 Q82 68 91 53 Q107 55 101 81" fill="#a7b97e" />
            {species === 2 && <><path d="M101 160 Q126 142 142 153 Q130 171 101 160" fill="#788f59" /><path d="M98 164 Q79 177 59 160 Q76 145 98 164" fill="#9aad70" /></>}
          </g>}
          {stage >= 3 && <g className="desk-flower">
            {Array.from({ length: petals }, (_, i) => <ellipse key={i} cx="100" cy="40" rx={species === 1 ? 9 : 6} ry="17" fill={flowerColor} stroke="#79644b" strokeOpacity=".1" transform={`rotate(${i * 360 / petals} 100 59)`} />)}
            <circle cx="100" cy="59" r="10" fill="#d4ac58" /><circle cx="97" cy="56" r="3" fill="#edcc7b" />
          </g>}
        </g>
      )}
      <path d="M63 179 Q100 190 137 179" fill="none" stroke="#b28963" strokeWidth="3" opacity=".4" />
      <path d="M95 200 Q100 194 105 200 Q101 207 96 206Z" fill="none" stroke="#fff9e7" strokeWidth="1.5" opacity=".6" />
    </svg>
  )
}
