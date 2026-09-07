// PROTOTYPE — mounts the camera prototype without App.tsx.
import { createRoot } from 'react-dom/client'
import { CameraPrototype } from './index.js'

createRoot(document.getElementById('root')!).render(<CameraPrototype />)
