import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

const positions = new Map<string, number>()

// Bij teruggaan weer op dezelfde plek uitkomen; bij een nieuwe pagina bovenaan beginnen
export function useScrollRestoration() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const currentKey = useRef(location.key)

  // Scrollpositie per pagina bijhouden terwijl je scrolt
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    const onScroll = () => positions.set(currentKey.current, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    currentKey.current = location.key
    if (navigationType !== 'POP') {
      window.scrollTo(0, 0)
      return
    }
    const y = positions.get(location.key) ?? 0
    window.scrollTo(0, y)
    // Als de pagina nog niet hoog genoeg is (inhoud laadt nog), het even later nogmaals proberen
    const retry = window.setTimeout(() => window.scrollY < y && window.scrollTo(0, y), 150)
    return () => window.clearTimeout(retry)
  }, [location.key, navigationType])
}
