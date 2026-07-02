'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter as useNextRouter, usePathname, useParams as useNextParams } from 'next/navigation'
import Link from 'next/link'

const RouterStateContext = createContext({
  state: {},
  setRouteState: () => {}
})

export function RouterStateProvider({ children }) {
  const [state, setState] = useState({})
  const [restored, setRestored] = useState(false)
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('next_router_states')
      if (saved) {
        try {
          setState(JSON.parse(saved))
        } catch (e) {
          console.error('Failed to parse router states', e)
        }
      }
      setRestored(true)
    }
  }, [])

  const setRouteState = (pathname, routeState) => {
    setState(prev => {
      const next = { ...prev, [pathname]: routeState }
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('next_router_states', JSON.stringify(next))
      }
      return next
    })
  }

  if (!restored) {
    return null
  }

  return (
    <RouterStateContext.Provider value={{ state, setRouteState }}>
      {children}
    </RouterStateContext.Provider>
  )
}

export { Link }

export function NavLink({ to, className, children, ...props }) {
  const pathname = usePathname()
  const isActive = pathname === to
  
  let resolvedClassName = className
  if (typeof className === 'function') {
    resolvedClassName = className({ isActive })
  } else if (className) {
    resolvedClassName = `${className} ${isActive ? 'active' : ''}`
  } else {
    resolvedClassName = isActive ? 'active' : ''
  }

  return (
    <Link href={to} className={resolvedClassName} {...props}>
      {children}
    </Link>
  )
}

export function useNavigate() {
  const nextRouter = useNextRouter()
  const { setRouteState } = useContext(RouterStateContext)

  return useCallback((to, options) => {
    if (typeof to === 'number') {
      if (to === -1) {
        nextRouter.back()
      } else {
        nextRouter.back()
      }
      return
    }

    if (options && options.state !== undefined) {
      setRouteState(to, options.state)
    }

    nextRouter.push(to)
  }, [nextRouter, setRouteState])
}

export function useLocation() {
  const pathname = usePathname()
  const { state } = useContext(RouterStateContext)

  return {
    pathname,
    state: state[pathname] || null,
    search: typeof window !== 'undefined' ? window.location.search : ''
  }
}

export function useParams() {
  const params = useNextParams()
  return params || {}
}
