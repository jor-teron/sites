// App.jsx
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

function Hero() {
  const group = useRef()

  // slow turntable
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.3
  })

  // reusable material helper — no textures, just factors
  const mat = (color, metal = 0, rough = 0.6, emissive = null) => (
    <meshStandardMaterial
      color={color}
      metalness={metal}
      roughness={rough}
      emissive={emissive || '#000000'}
      emissiveIntensity={emissive ? 1.5 : 0}
      flatShading
    />
  )

  return (
    <group ref={group} position={[0, -1, 0]}>
      {/* Torso */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[0.9, 1.1, 0.5]} />
        {mat('#2a5bd7')}
      </mesh>

      {/* Chest armor */}
      <mesh position={[0, 1.4, 0.28]} castShadow>
        <boxGeometry args={[0.95, 0.6, 0.15]} />
        {mat('#d43a2a', 0.8, 0.3)}
      </mesh>

      {/* Head */}
      <mesh position={[0, 2.05, 0]} castShadow>
        <boxGeometry args={[0.55, 0.55, 0.55]} />
        {mat('#e8b98a')}
      </mesh>

      {/* Helmet */}
      <mesh position={[0, 2.25, 0]} castShadow>
        <boxGeometry args={[0.65, 0.35, 0.65]} />
        {mat('#1a1a2e', 0.7, 0.4)}
      </mesh>

      {/* Eyes (emissive) */}
      <mesh position={[-0.14, 2.08, 0.29]}>
        <boxGeometry args={[0.08, 0.08, 0.02]} />
        {mat('#00e5ff', 0, 0.2, '#00e5ff')}
      </mesh>
      <mesh position={[0.14, 2.08, 0.29]}>
        <boxGeometry args={[0.08, 0.08, 0.02]} />
        {mat('#00e5ff', 0, 0.2, '#00e5ff')}
      </mesh>

      {/* Left arm */}
      <mesh position={[-0.65, 1.35, 0]} castShadow>
        <boxGeometry args={[0.28, 0.95, 0.28]} />
        {mat('#2a5bd7')}
      </mesh>
      <mesh position={[-0.65, 0.75, 0]} castShadow>
        <boxGeometry args={[0.32, 0.32, 0.32]} />
        {mat('#e8b98a')}
      </mesh>

      {/* Right arm */}
      <mesh position={[0.65, 1.35, 0]} castShadow>
        <boxGeometry args={[0.28, 0.95, 0.28]} />
        {mat('#2a5bd7')}
      </mesh>
      <mesh position={[0.65, 0.75, 0]} castShadow>
        <boxGeometry args={[0.32, 0.32, 0.32]} />
        {mat('#e8b98a')}
      </mesh>

      {/* Legs */}
      <mesh position={[-0.25, 0.25, 0]} castShadow>
        <boxGeometry args={[0.32, 1.0, 0.32]} />
        {mat('#1a1a2e')}
      </mesh>
      <mesh position={[0.25, 0.25, 0]} castShadow>
        <boxGeometry args={[0.32, 1.0, 0.32]} />
        {mat('#1a1a2e')}
      </mesh>
    </group>
  )
}

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a1a' }}>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{ position: [0, 1.5, 5], fov: 45 }}
      >
        <color attach="background" args={['#0a0a1a']} />
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[5, 10, 5]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <Environment preset="studio" />
        <Hero />
        <ContactShadows
          position={[0, -1.5, 0]}
          opacity={0.5}
          scale={10}
          blur={2.5}
          resolution={256}
        />
        <OrbitControls
          enablePan={false}
          minDistance={3}
          maxDistance={9}
          maxPolarAngle={Math.PI / 2}
        />
      </Canvas>
    </div>
  )
}