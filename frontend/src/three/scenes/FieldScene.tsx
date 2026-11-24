import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import type { Detection } from '../../lib/types'
import { DetectionMarker, GantrySystem, SafeOrbit, SceneAtmosphere, SoilBed } from '../realistic/FieldProps'

export function FieldScene({
  detections,
  frameW = 640,
  frameH = 480,
  selectedId,
}: {
  detections: Detection[]
  frameW?: number
  frameH?: number
  selectedId?: number | null
}) {
  const head = useRef<Group>(null)
  const [treated, setTreated] = useState<Record<number, boolean>>({})
  const [treatingId, setTreatingId] = useState<number | null>(null)
  const hold = useRef(0)
  const lastId = useRef<number | null>(null)

  const mapped = useMemo(() => {
    if (!detections.length) {
      return [
        { id: -1, x: -1.1, z: 0.7, weed: false },
        { id: -2, x: 0.55, z: -0.85, weed: false },
        { id: -3, x: 1.05, z: 0.75, weed: true },
        { id: -4, x: -0.45, z: -0.35, weed: true },
        { id: -5, x: 0.15, z: 1.15, weed: false },
        { id: -6, x: 0.85, z: -0.15, weed: true },
        { id: -7, x: -0.95, z: 0.95, weed: false },
        { id: -8, x: 0.2, z: -1.1, weed: true },
      ]
    }
    return detections.slice(0, 24).map((d) => ({
      id: d.id,
      x: ((d.cx / Math.max(1, frameW)) - 0.5) * 3.4,
      z: ((d.cy / Math.max(1, frameH)) - 0.5) * 3.4,
      weed: d.role === 'weed' || !!d.treatable,
    }))
  }, [detections, frameW, frameH])

  const target = useMemo(() => {
    const sel = mapped.find((d) => d.id === selectedId)
    if (sel) return sel
    return mapped.find((d) => d.weed && !treated[d.id]) || mapped.find((d) => d.weed) || mapped[0]
  }, [mapped, selectedId, treated])

  useFrame((_, dt) => {
    if (!head.current || !target) return
    head.current.position.x += (target.x - head.current.position.x) * Math.min(1, dt * 2.4)
    head.current.position.z += (target.z - head.current.position.z) * Math.min(1, dt * 2.4)
    head.current.position.y = 1.15
    if (!target.weed || treated[target.id]) {
      if (treatingId != null) setTreatingId(null)
      return
    }
    const dist = Math.hypot(head.current.position.x - target.x, head.current.position.z - target.z)
    if (dist < 0.18) {
      if (lastId.current !== target.id) {
        lastId.current = target.id
        setTreatingId(target.id)
        hold.current = 0
      }
      hold.current += dt
      if (hold.current > 1.15) {
        setTreated((t) => ({ ...t, [target.id]: true }))
        setTreatingId(null)
        lastId.current = null
        hold.current = 0
      }
    }
  })

  return (
    <>
      <SceneAtmosphere variant="field" />
      <SoilBed size={5.2} />
      {mapped.map((d) => (
        <DetectionMarker
          key={d.id}
          position={[d.x, 0, d.z]}
          weed={d.weed}
          selected={selectedId === d.id}
          seed={Math.abs(d.id) + 3}
          treated={!!treated[d.id]}
          treating={treatingId === d.id}
        />
      ))}
      <GantrySystem headRef={head} railSpan={4.8} height={1.15} active treating={treatingId != null} />
      <SafeOrbit min={3.5} max={11} />
    </>
  )
}
