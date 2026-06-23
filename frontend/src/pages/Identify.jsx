import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, UserCheck, ShieldCheck } from 'lucide-react'

export default function Identify() {
  const { billerId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  
  const [biller, setBiller] = useState(location.state?.biller || null)
  const [mobile, setMobile] = useState('')
  const [params, setParams] = useState({})
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [globalError, setGlobalError] = useState('')

  useEffect(() => {
    if (!biller) {
      // If user directly browsed to this URL, load from list
      fetch('/api/billers')
        .then(res => res.json())
        .then(data => {
          const found = data.find(b => b.id === billerId)
          if (found) {
            setBiller(found)
          } else {
            setGlobalError('Biller not found')
          }
        })
        .catch(err => {
          setGlobalError('Failed to retrieve biller details')
        })
    }
  }, [billerId, biller])

  const handleParamChange = (name, val) => {
    setParams(prev => ({ ...prev, [name]: val }))
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const validate = () => {
    const newErrors = {}
    
    // Validate Mobile
    const mobileRegex = /^[0-9]{10}$/
    if (!mobileRegex.test(mobile)) {
      newErrors['mobile'] = 'Please enter a valid 10-digit mobile number'
    }

    // Validate Biller Parameters
    if (biller && biller.customer_params) {
      biller.customer_params.forEach(p => {
        let val = params[p.paramName] || ''
        if (p.paramName === 'Mobile Number') {
          val = mobile
        }
        
        if (!p.optional && !val) {
          newErrors[p.paramName] = `${p.paramName} is required`
          return
        }

        if (val) {
          if (p.minLength && val.length < p.minLength) {
            newErrors[p.paramName] = `Minimum length is ${p.minLength} characters`
          }
          if (p.maxLength && val.length > p.maxLength) {
            newErrors[p.paramName] = `Maximum length is ${p.maxLength} characters`
          }
          if (p.regex) {
            const re = new RegExp(p.regex)
            if (!re.test(val)) {
              newErrors[p.paramName] = `Invalid format for ${p.paramName}`
            }
          }
        }
      })
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setGlobalError('')

    const finalParams = { ...params }
    if (biller && biller.customer_params) {
      biller.customer_params.forEach(p => {
        if (p.paramName === 'Mobile Number') {
          finalParams['Mobile Number'] = mobile
        }
      })
    }

    const payload = {
      billerId: biller.id,
      mobile: mobile,
      customerParams: finalParams
    }

    fetch('/api/fetch/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(errData => {
            throw new Error(errData.detail || 'Initialization failed')
          })
        }
        return res.json()
      })
      .then(data => {
        setLoading(false)
        navigate('/loans', { 
          state: { 
            fetchSessionId: data.fetchSessionId,
            biller: biller
          } 
        })
      })
      .catch(err => {
        setLoading(false)
        setGlobalError(err.message)
      })
  }

  if (globalError && !biller) {
    return (
      <div className="glass-panel text-center" style={{ maxWidth: '500px', margin: '20px auto' }}>
        <h2>Error</h2>
        <p>{globalError}</p>
        <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => navigate('/billers')}>
          Back to Billers
        </button>
      </div>
    )
  }

  if (!biller) {
    return (
      <div className="loading-wrapper">
        <div className="spinner"></div>
        <h2>Loading Param Requirements</h2>
      </div>
    )
  }

  return (
    <div className="identify-container">
      <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', marginBottom: '2rem' }} onClick={() => navigate('/billers')}>
        <ArrowLeft size={16} /> Back to Providers
      </button>

      <div className="glass-panel">
        <div className="biller-summary-header">
          <div className="biller-icon-placeholder">
            {biller.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <h3>{biller.name}</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>BBPS Loan Biller Code: {biller.id}</p>
          </div>
        </div>

        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Provide Loan Details</h2>
        
        {globalError && (
          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', marginBottom: '1.5rem' }}>
            {globalError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Always include customer Mobile Number */}
          <div className="form-group">
            <label className="form-label">Customer Mobile Number</label>
            <input 
              type="text" 
              placeholder="e.g. 9876543210" 
              className={`form-input ${errors.mobile ? 'border-error' : ''}`}
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              disabled={loading}
            />
            {errors.mobile && <span className="error-text">{errors.mobile}</span>}
          </div>

          {/* Render parameters dynamically */}
          {biller.customer_params.map(p => {
            if (p.paramName === 'Mobile Number') return null
            const hasErr = errors[p.paramName]
            return (
              <div key={p.paramName} className="form-group">
                <label className="form-label">
                  {p.paramName} {!p.optional && <span style={{ color: '#ef4444' }}>*</span>}
                </label>
                <input 
                  type="text" 
                  placeholder={`Enter ${p.paramName.toLowerCase()}`} 
                  className={`form-input ${hasErr ? 'border-error' : ''}`}
                  value={params[p.paramName] || ''}
                  onChange={(e) => handleParamChange(p.paramName, e.target.value)}
                  disabled={loading}
                />
                {hasErr && <span className="error-text">{hasErr}</span>}
              </div>
            )
          })}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '1.5rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <ShieldCheck size={16} color="#10b981" />
            <span>Authenticated directly with central NPCI-BBPS networks</span>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Initializing Fetch Request...' : 'Retrieve Outstanding Loan EMIs'}
          </button>
        </form>
      </div>
    </div>
  )
}
