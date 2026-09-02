export interface PlantProps {
  large?: boolean
  animate?: boolean
}

export function Plant({ large = false, animate = true }: PlantProps) {
  return (
    <div className={`${large ? 'plant large' : 'plant'} ${animate ? 'animate' : ''}`}>
      <div className="stem" />
      <i className="leaf a" />
      <i className="leaf b" />
      <i className="leaf c" />
      <div className="pot"><span>• ˚ •</span></div>
      <div className="soil" />
    </div>
  )
}
