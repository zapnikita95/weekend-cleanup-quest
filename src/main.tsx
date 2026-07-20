import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const rootElement = document.getElementById('root')

const renderFallback = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Неизвестная ошибка запуска'
  document.body.innerHTML = `
    <main class="boot-error">
      <section>
        <p>Weekend Cleanup Quest</p>
        <h1>Игра не стартовала</h1>
        <span>${message}</span>
        <button type="button" id="reset-local-game">Очистить локальные настройки и перезагрузить</button>
      </section>
    </main>
  `
  document.getElementById('reset-local-game')?.addEventListener('click', () => {
    window.localStorage.removeItem('wcq-players')
    window.localStorage.removeItem('wcq-chores')
    window.location.reload()
  })
}

try {
  if (!rootElement) throw new Error('Root element not found')
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  const prerender = document.getElementById('seo-prerender')
  if (prerender) {
    prerender.hidden = true
    prerender.remove()
  }
} catch (error) {
  renderFallback(error)
}
