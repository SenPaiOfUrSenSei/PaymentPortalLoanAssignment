import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, FileText, Download, Search, Calendar, 
  CreditCard, Shield, AlertTriangle, Receipt
} from 'lucide-react'
import { isAuthenticated, authFetch } from '../utils/auth'

export default function Statement() {
  const navigate = useNavigate()
  const [statements, setStatements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterType, setFilterType] = useState('ALL') // ALL, MANUAL_PAYMENT, SETTLEMENT, AUTOPAY_DEBIT
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/auth')
      return
    }

    setLoading(true)
    authFetch('/api/statements/list')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch statements history')
        return res.json()
      })
      .then(data => {
        setStatements(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [navigate])

  const formatRupees = (paise) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(paise / 100)
  }

  const formatDate = (isoString) => {
    const d = new Date(isoString)
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Filter & Search statements
  const filteredStatements = statements.filter(item => {
    const matchesFilter = filterType === 'ALL' || item.type === filterType
    const matchesSearch = item.loanAccountNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesFilter && matchesSearch
  })

  // Simulated download handler
  const handleDownload = (item) => {
    alert(`Downloading receipt for ${item.description}...\nDocument ID: ${item.id}\nLoan Acc: ${item.loanAccountNumber}`)
  }

  return (
    <div className="container animate-fade-in" style={{ maxWidth: '1000px', margin: '2rem auto', padding: '0 1rem' }}>
      <button 
        className="btn btn-secondary" 
        style={{ padding: '0.5rem 1rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }} 
        onClick={() => navigate('/')}
      >
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transactions & Documents</span>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>Account <span className="gradient-text">Statements</span></h1>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.15)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {/* Filters & Search controls */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.2rem', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {['ALL', 'MANUAL_PAYMENT', 'SETTLEMENT', 'AUTOPAY_DEBIT'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                borderRadius: '8px',
                border: '1px solid var(--glass-border)',
                background: filterType === type ? 'var(--primary-gradient)' : 'transparent',
                color: filterType === type ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {type === 'ALL' && 'All Documents'}
              {type === 'MANUAL_PAYMENT' && 'BBPS Payments'}
              {type === 'SETTLEMENT' && 'Settlements'}
              {type === 'AUTOPAY_DEBIT' && 'AutoPay Debits'}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search account # or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '0.5rem 1rem 0.5rem 2.3rem', width: '100%', fontSize: '0.85rem' }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <Receipt size={40} className="animate-spin" color="#4f46e5" style={{ marginBottom: '1rem' }} />
          <p style={{ color: 'var(--text-muted)' }}>Compiling aggregate financial statements...</p>
        </div>
      ) : filteredStatements.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)' }}>
          <FileText size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <h3 style={{ color: 'var(--text-primary)' }}>No Statements Found</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>No transaction history matches your search or selected filters.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {filteredStatements.map(item => (
            <div 
              key={item.id}
              className="glass-panel" 
              style={{
                padding: '1.5rem',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--glass-border)',
                borderRadius: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1.5rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.01)'
              }}
            >
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{
                  width: '45px',
                  height: '45px',
                  borderRadius: '10px',
                  background: item.type === 'SETTLEMENT' ? 'rgba(16, 185, 129, 0.08)' : (item.type === 'AUTOPAY_DEBIT' ? 'rgba(79, 70, 229, 0.08)' : 'rgba(99, 102, 241, 0.08)'),
                  color: item.type === 'SETTLEMENT' ? '#10b981' : '#4f46e5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {item.type === 'SETTLEMENT' ? <Shield size={22} /> : (item.type === 'AUTOPAY_DEBIT' ? <Calendar size={22} /> : <CreditCard size={22} />)}
                </div>
                
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <h4 style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{item.description}</h4>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.5rem',
                      borderRadius: '12px',
                      background: item.status === 'SUCCESS' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                      color: item.status === 'SUCCESS' ? '#10b981' : '#ef4444'
                    }}>
                      {item.status}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    Loan Account: <strong>{item.loanAccountNumber}</strong> • Date: {formatDate(item.date)}
                  </p>
                  
                  {/* Detailed specific items */}
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {item.type === 'MANUAL_PAYMENT' && (
                      <>
                        <span>Ref ID: {item.details.paymentRefId}</span>
                        <span>Gateway: {item.details.paymentGateway}</span>
                      </>
                    )}
                    {item.type === 'SETTLEMENT' && (
                      <>
                        <span>Lender: {item.details.billerName}</span>
                        <span>Principal: {formatRupees(item.details.principalOutstanding)}</span>
                      </>
                    )}
                    {item.type === 'AUTOPAY_DEBIT' && (
                      <>
                        <span>UMN: {item.details.umn}</span>
                        <span>VPA: {item.details.vpa}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
                    {formatRupees(item.amount)}
                  </span>
                </div>
                <button 
                  className="btn btn-secondary" 
                  style={{
                    padding: '0.5rem 0.8rem',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    cursor: 'pointer'
                  }}
                  onClick={() => handleDownload(item)}
                >
                  <Download size={14} /> Receipt
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
