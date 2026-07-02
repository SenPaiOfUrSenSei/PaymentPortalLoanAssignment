'use client'

import React, { useState, useEffect } from 'react'
import { useNavigate } from '../../utils/router'
import { Search, Building2, AlertTriangle, ArrowLeft } from 'lucide-react'

export default function Billers() {
  const [billers, setBillers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/billers')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load billers from backend')
        return res.json()
      })
      .then(data => {
        setBillers(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const filteredBillers = billers.filter(b => 
    b.name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="loading-wrapper">
        <div className="spinner"></div>
        <h2>Loading Loan Providers</h2>
        <p>Connecting with BBPS central directory...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
        <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '1rem' }} />
        <h2>Connection Error</h2>
        <p style={{ margin: '1rem 0' }}>{error}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }} onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> Back
        </button>
      </div>
      
      <h2>Select Your <span className="gradient-text">Loan Provider</span></h2>
      <p style={{ marginBottom: '2.5rem' }}>Choose from list of BBPS enabled banking partners and NBFCs</p>

      <div className="search-bar-container">
        <Search className="search-icon" size={20} />
        <input 
          type="text" 
          placeholder="Search by provider name..." 
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredBillers.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem' }}>
          <Building2 size={40} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
          <h3>No providers found</h3>
          <p>Try searching for a different loan provider.</p>
        </div>
      ) : (
        <div className="grid-container">
          {filteredBillers.map(b => (
            <div 
              key={b.id} 
              className="glass-panel glass-panel-hoverable biller-card"
              onClick={() => navigate(`/biller/${b.id}/identify`, { state: { biller: b } })}
            >
              <div className="biller-icon-placeholder">
                {b.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="biller-info">
                <h3>{b.name}</h3>
                <div className="biller-category">{b.category_name}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
