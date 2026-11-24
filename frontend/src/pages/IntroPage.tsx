import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '../components/ui'

const FastCanvas = lazy(() => import('../three/FastCanvas').then((m) => ({ default: m.FastCanvas })))
const IntroScene = lazy(() => import('../three/scenes/IntroScene').then((m) => ({ default: m.IntroScene })))

const pillars = [
  {
    title: 'See',
    body: 'A camera watches a bounded test bed. Our trained YOLO model separates crops from weeds in live or recorded video.',
  },
  {
    title: 'Locate',
    body: 'Calibration maps image pixels to real X–Y workspace millimetres so the treatment head knows where to go.',
  },
  {
    title: 'Treat safely',
    body: 'Commands go through a Central Control Unit (Raspberry Pi) with Wi‑Fi, Bluetooth backup, interlocks and E‑Stop.',
  },
]

export function IntroPage() {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-5.5rem)] max-w-6xl gap-8 px-4 py-8 lg:grid-cols-2 lg:items-center">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <p className="text-sm font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--brand)' }}>
          Final Year Project · UET Taxila
        </p>
        <h1 className="brand-display page-title mt-3">
          WEEDELEO
        </h1>
        <p className="page-sub text-lg">
          Vision-guided weed detection and precision laser-treatment system — a camera finds the weed, calibration
          places it in the real world, and a safety-gated control unit aims treatment only when it is safe.
        </p>

        <div className="mt-6 space-y-4">
          {pillars.map((p) => (
            <div key={p.title} className="panel p-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                {p.title}
              </h2>
              <p className="mt-1 text-base" style={{ color: 'var(--text-soft)' }}>
                {p.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/app">
            <Button>Enter dashboard</Button>
          </Link>
          <Link to="/app/live">
            <Button variant="secondary">Go to live vision</Button>
          </Link>
        </div>
        <p className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>
          Team: Afreen Gul (23-CS-84) · Areeba Ali (23-CS-114) · Supervisor: Dr. Farrukh Zeeshan Khan
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="panel overflow-hidden"
        style={{ minHeight: 420 }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
          <strong>How the machine moves</strong>
          <span className="chip">Lightweight 3D preview</span>
        </div>
        <div style={{ height: 400, position: 'relative' }}>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
                Loading 3D preview…
              </div>
            }
          >
            <FastCanvas className="h-full w-full" camera={[4.4, 3.4, 4.4]}>
              <IntroScene />
            </FastCanvas>
          </Suspense>
        </div>
        <p className="px-4 py-3 text-sm" style={{ color: 'var(--text-soft)' }}>
          Watch the gantry lock onto weeds and fire the treatment tip — weeds wilt; taller fruiting plants are crops and
          stay untouched. Drag to rotate.
        </p>
      </motion.div>
    </div>
  )
}
