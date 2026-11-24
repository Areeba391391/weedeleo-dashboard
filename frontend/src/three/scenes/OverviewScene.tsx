import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import {
  FieldRover,
  GantrySystem,
  SafeOrbit,
  SceneAtmosphere,
  SoilBed,
  WeedHuntController,
} from '../realistic/FieldProps'

export function OverviewScene({
  weedCount = 0,
  cropCount = 0,
}: {
  weedCount?: number
  cropCount?: number
  running?: boolean
}) {
  const head = useRef<Group>(null)
  const treatingRef = useRef(false)
  const [treating, setTreating] = useState(false)

  useFrame(() => {
    if (treatingRef.current !== treating) setTreating(treatingRef.current)
  })

  const plants = useMemo(() => {
    const nCrop = Math.min(7, Math.max(4, cropCount || 5))
    const nWeed = Math.min(5, Math.max(3, weedCount || 3))
    const list: { id: string; pos: [number, number, number]; weed: boolean; seed: number }[] = []
    for (let i = 0; i < nCrop; i++) {
      const a = (i / nCrop) * Math.PI * 2
      const r = 0.7 + (i % 3) * 0.25
      list.push({ id: `c${i}`, pos: [Math.cos(a) * r, 0, Math.sin(a) * r], weed: false, seed: i + 1 })
    }
    for (let i = 0; i < nWeed; i++) {
      const a = (i / nWeed) * Math.PI * 2 + 0.4
      const r = 1.2 + (i % 2) * 0.2
      list.push({ id: `w${i}`, pos: [Math.cos(a) * r, 0, Math.sin(a) * r], weed: true, seed: i + 20 })
    }
    return list
  }, [weedCount, cropCount])

  return (
    <>
      <SceneAtmosphere variant="field" />
      <SoilBed size={5} />
      <WeedHuntController headRef={head} plants={plants} treatingRef={treatingRef} />
      <GantrySystem headRef={head} railSpan={4.5} height={1.15} active treating={treating} />
      <group position={[-1.9, 0, 1.65]} rotation={[0, 0.55, 0]}>
        <FieldRover scale={0.8} />
      </group>
      <SafeOrbit autoRotate min={3.5} max={8.5} />
    </>
  )
}
