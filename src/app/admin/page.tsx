'use client'

import { useState, useEffect } from 'react'

interface ApiKey {
  id: number
  name: string
  description: string
  api_key_preview: string
  is_active: boolean
  rate_limit: number
  total_requests: number
  last_used_at: string | null
  created_at: string
}

export default function AdminDashboard() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [masterKey, setMasterKey] = useState('')
  const [newKeyForm, setNewKeyForm] = useState({
    name: '',
    description: '',
    rateLimit: 1000
  })
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [error, setError] = useState<string>('')

  const loadApiKeys = async () => {
    if (!masterKey) return
    
    setIsLoading(true)
    try {
      const response = await fetch(`/api/keys?master_key=${encodeURIComponent(masterKey)}`)
      const result = await response.json()
      
      if (result.success) {
        setApiKeys(result.data)
        setError('')
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError('Failed to load API keys')
    } finally {
      setIsLoading(false)
    }
  }

  const createApiKey = async () => {
    if (!masterKey || !newKeyForm.name) return
    
    setIsLoading(true)
    try {
      const response = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newKeyForm,
          masterKey
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        setNewApiKey(result.data.apiKey)
        setNewKeyForm({ name: '', description: '', rateLimit: 1000 })
        await loadApiKeys() // Refresh the list
        setError('')
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError('Failed to create API key')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (masterKey) {
      loadApiKeys()
    }
  }, [masterKey])

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleString()
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
            API Key Management
          </h1>
          <p className="text-lg text-blue-200 mb-6">
            Generate and manage API keys for the Premier League ML System
          </p>
        </header>

        {/* Master Key Input */}
        <div className="bg-white/10 rounded-xl p-6 backdrop-blur border border-white/20 mb-8">
          <h2 className="text-xl font-bold mb-4 text-red-300">🔑 Admin Access</h2>
          <div className="flex gap-4">
            <input
              type="password"
              placeholder="Enter master key"
              value={masterKey}
              onChange={(e) => setMasterKey(e.target.value)}
              className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400"
            />
            <button
              onClick={loadApiKeys}
              disabled={!masterKey || isLoading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-semibold"
            >
              {isLoading ? 'Loading...' : 'Load Keys'}
            </button>
          </div>
          {!masterKey && (
            <p className="text-sm text-gray-400 mt-2">
              Default master key: <code className="bg-white/10 px-2 py-1 rounded">master_key_123</code>
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {masterKey && (
          <>
            {/* Create New API Key */}
            <div className="bg-white/10 rounded-xl p-6 backdrop-blur border border-white/20 mb-8">
              <h2 className="text-xl font-bold mb-4 text-green-300">➕ Create New API Key</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <input
                  type="text"
                  placeholder="API Key Name"
                  value={newKeyForm.name}
                  onChange={(e) => setNewKeyForm({...newKeyForm, name: e.target.value})}
                  className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400"
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={newKeyForm.description}
                  onChange={(e) => setNewKeyForm({...newKeyForm, description: e.target.value})}
                  className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400"
                />
                <input
                  type="number"
                  placeholder="Rate Limit (per hour)"
                  value={newKeyForm.rateLimit}
                  onChange={(e) => setNewKeyForm({...newKeyForm, rateLimit: parseInt(e.target.value) || 1000})}
                  className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400"
                />
              </div>
              <button
                onClick={createApiKey}
                disabled={!newKeyForm.name || isLoading}
                className="w-full md:w-auto px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg font-semibold"
              >
                Create API Key
              </button>
            </div>

            {/* New API Key Display */}
            {newApiKey && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-6 mb-8">
                <h3 className="text-lg font-bold text-green-300 mb-2">✅ API Key Created Successfully!</h3>
                <p className="text-sm text-gray-300 mb-4">Save this key securely - it won't be shown again:</p>
                <div className="bg-black/30 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <code className="text-green-400 break-all">{newApiKey}</code>
                    <button
                      onClick={() => copyToClipboard(newApiKey)}
                      className="ml-4 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div className="mt-4 text-sm text-gray-300">
                  <p><strong>Usage Example:</strong></p>
                  <code className="block bg-black/30 p-2 rounded mt-2 text-xs">
                    curl -H "x-api-key: {newApiKey}" https://your-domain.com/api/predict/latest
                  </code>
                </div>
                <button
                  onClick={() => setNewApiKey(null)}
                  className="mt-4 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
                >
                  Close
                </button>
              </div>
            )}

            {/* API Keys List */}
            <div className="bg-white/10 rounded-xl p-6 backdrop-blur border border-white/20">
              <h2 className="text-xl font-bold mb-4 text-yellow-300">🔑 Existing API Keys</h2>
              
              {apiKeys.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No API keys found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/20">
                        <th className="text-left py-2">Name</th>
                        <th className="text-left py-2">Key Preview</th>
                        <th className="text-left py-2">Status</th>
                        <th className="text-left py-2">Rate Limit</th>
                        <th className="text-left py-2">Requests</th>
                        <th className="text-left py-2">Last Used</th>
                        <th className="text-left py-2">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiKeys.map((key) => (
                        <tr key={key.id} className="border-b border-white/10">
                          <td className="py-3">
                            <div>
                              <div className="font-semibold">{key.name}</div>
                              {key.description && (
                                <div className="text-gray-400 text-xs">{key.description}</div>
                              )}
                            </div>
                          </td>
                          <td className="py-3">
                            <code className="bg-black/30 px-2 py-1 rounded text-xs">
                              {key.api_key_preview}
                            </code>
                          </td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded text-xs ${
                              key.is_active 
                                ? 'bg-green-500/20 text-green-400' 
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                              {key.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3">{key.rate_limit}/hour</td>
                          <td className="py-3">{key.total_requests || 0}</td>
                          <td className="py-3 text-xs">{formatDate(key.last_used_at)}</td>
                          <td className="py-3 text-xs">{formatDate(key.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* API Documentation */}
            <div className="bg-white/10 rounded-xl p-6 backdrop-blur border border-white/20 mt-8">
              <h2 className="text-xl font-bold mb-4 text-purple-300">📚 API Documentation</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-blue-300">Protected Endpoints</h3>
                  <ul className="space-y-2 text-sm">
                    <li><code className="bg-black/30 px-2 py-1 rounded">GET /api/predict/latest</code> - Get latest predictions</li>
                    <li><code className="bg-black/30 px-2 py-1 rounded">GET /api/usage</code> - Get your API usage stats</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-green-300">Authentication</h3>
                  <p className="text-sm text-gray-300 mb-2">Include your API key in the request header:</p>
                  <code className="block bg-black/30 p-2 rounded text-xs">x-api-key: your_api_key_here</code>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
