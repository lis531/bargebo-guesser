import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import SongPicker from './SongPicker.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <SongPicker />
  </StrictMode>,
)
