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

export function IntroScene() {
  const head = useRef<Group>(null)
  const treatingRef = useRef(false)
  const [treating, setTreating] = useState(false)

  useFrame(() => {
    if (treatingRef.current !== treating) setTreating(treatingRef.current)
  })

  const plants = useMemo(
    () => [
      { id: 'c1', pos: [-1.2, 0, 0.7] as [number, number, number], weed: false, seed: 1 },
      { id: 'c2', pos: [-0.4, 0, -0.9] as [number, number, number], weed: false, seed: 2 },
      { id: 'c3', pos: [0.55, 0, 0.5] as [number, number, number], weed: false, seed: 3 },
      { id: 'c4', pos: [1.25, 0, -0.4] as [number, number, number], weed: false, seed: 4 },
      { id: 'c5', pos: [0.05, 0, 1.15] as [number, number, number], weed: false, seed: 5 },
      { id: 'w1', pos: [-0.8, 0, -0.2] as [number, number, number], weed: true, seed: 10 },
      { id: 'w2', pos: [0.9, 0, 0.9] as [number, number, number], weed: true, seed: 11 },
      { id: 'w3', pos: [0.25, 0, -1.15] as [number, number, number], weed: true, seed: 12 },
      { id: 'w4', pos: [1.05, 0, 0.15] as [number, number, number], weed: true, seed: 13 },
    ],
    [],
  )

  return (
    <>
      <SceneAtmosphere variant="lab" />
      <SoilBed size={4.6} />
      <WeedHuntController headRef={head} plants={plants} treatingRef={treatingRef} />
      <GantrySystem headRef={head} railSpan={4.2} height={1.15} active treating={treating} />
      <group position={[-1.7, 0, 1.55]} rotation={[0, 0.75, 0]}>
        <FieldRover scale={0.75} />
      </group>
      <SafeOrbit autoRotate min={3.4} max={9} />
    </>
  )
}
