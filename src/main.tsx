import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/archivo'
import '@fontsource-variable/newsreader'
import '@fontsource/ibm-plex-mono'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
