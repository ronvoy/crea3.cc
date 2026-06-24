import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  TextField,
  MenuItem,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Chip,
  Autocomplete,
  Divider,
  Alert,
  CircularProgress,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import BuildIcon from '@mui/icons-material/Build'
import SearchIcon from '@mui/icons-material/Search'
import { api } from '../api/client'

type RagConfig = {
  embedding_models: { id: string; label: string; dims: number; available: boolean; kind: string }[]
  pipelines: { id: string; label: string }[]
  index_types: { id: string; label: string; available: boolean }[]
  default_params: Record<string, number>
  capabilities: Record<string, boolean>
  openrouter_model: string
  doc_types: string[]
}

type Doc = {
  id: number
  title: string
  doc_type: string
  dispute_id: number | null
  filename: string
  jurisdiction: string
  char_count: number
  n_chunks: number
  status: string
  created_at: string | null
}

type Idx = {
  id: number
  name: string
  embedding_model: string
  pipeline: string
  index_type: string
  dims: number
  n_vectors: number
  n_documents: number
  status: string
  created_at: string | null
}

type Citation = { n: number; source_doc: string; hierarchy_path: string; doc_type: string; score: number | null }

function Section({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>{title}</Typography>
          {subtitle ? <Typography variant="body2" color="text.secondary">{subtitle}</Typography> : null}
        </Box>
        {action}
      </Stack>
      {children}
    </Paper>
  )
}

export default function RagPage() {
  const [config, setConfig] = useState<RagConfig | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [indexes, setIndexes] = useState<Idx[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // upload form
  const fileRef = useRef<HTMLInputElement>(null)
  const [docType, setDocType] = useState('statute')
  const [title, setTitle] = useState('')
  const [jurisdiction, setJurisdiction] = useState('')
  const [notes, setNotes] = useState('')

  // index builder
  const [embModel, setEmbModel] = useState<string>('hashing')
  const [pipeline, setPipeline] = useState('hybrid')
  const [indexType, setIndexType] = useState('flat')
  const [scope, setScope] = useState('')
  const [topK, setTopK] = useState(5)

  // query tester
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('auto')
  const [queryIndex, setQueryIndex] = useState<number | ''>('')
  const [answer, setAnswer] = useState<{ answer: string; citations: Citation[]; contexts: any[]; generator?: string } | null>(null)
  const [querying, setQuerying] = useState(false)

  async function loadAll() {
    setErr(null)
    try {
      const [cfg, d, ix] = await Promise.all([
        api('/api/rag/config'),
        api('/api/rag/documents'),
        api('/api/rag/indexes'),
      ])
      setConfig(cfg)
      setDocs(d.documents)
      setIndexes(ix.indexes)
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load RAG data')
    }
  }

  useEffect(() => { loadAll() }, [])

  async function upload() {
    const f = fileRef.current?.files?.[0]
    if (!f) { setErr('Choose a file first (.pdf, .json or .txt)'); return }
    setBusy(true); setErr(null)
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('doc_type', docType)
      if (title) fd.append('title', title)
      if (jurisdiction) fd.append('jurisdiction', jurisdiction)
      if (notes) fd.append('notes', notes)
      await api('/api/rag/documents', { method: 'POST', body: fd })
      setTitle(''); setJurisdiction(''); setNotes('')
      if (fileRef.current) fileRef.current.value = ''
      await loadAll()
    } catch (e: any) {
      setErr(e?.message ?? 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function removeDoc(id: number) {
    if (!confirm('Delete this document and its chunks?')) return
    try { await api(`/api/rag/documents/${id}`, { method: 'DELETE' }); await loadAll() }
    catch (e: any) { setErr(e?.message ?? 'Delete failed') }
  }

  async function buildIndex() {
    setBusy(true); setErr(null)
    try {
      await api('/api/rag/indexes', {
        method: 'POST',
        body: {
          embedding_model: embModel,
          pipeline,
          index_type: indexType,
          doc_type: scope || null,
          params: { top_k: Number(topK) },
        },
      })
      await loadAll()
    } catch (e: any) {
      setErr(e?.message ?? 'Index build failed')
    } finally {
      setBusy(false)
    }
  }

  async function removeIndex(id: number) {
    try { await api(`/api/rag/indexes/${id}`, { method: 'DELETE' }); await loadAll() }
    catch (e: any) { setErr(e?.message ?? 'Delete failed') }
  }

  async function runQuery() {
    if (!query.trim()) return
    setQuerying(true); setErr(null); setAnswer(null)
    try {
      const res = await api('/api/rag/query', {
        method: 'POST',
        body: {
          query,
          mode,
          index_id: queryIndex === '' ? null : Number(queryIndex),
          embedding_model: embModel,
          pipeline,
          index_type: indexType,
          generate: true,
        },
      })
      setAnswer(res)
    } catch (e: any) {
      setErr(e?.message ?? 'Query failed')
    } finally {
      setQuerying(false)
    }
  }

  const modelOptions = config?.embedding_models ?? []
  const selectedModel = useMemo(() => modelOptions.find((m) => m.id === embModel) ?? null, [modelOptions, embModel])

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>Legal knowledge base</Typography>
        <Typography variant="body2" color="text.secondary">
          Upload statutes and case files, build retrieval indexes, and test the legal RAG chatbot. See rag-plan.md for the pipeline design.
        </Typography>
      </Box>

      {err ? <Alert severity="error" onClose={() => setErr(null)}>{err}</Alert> : null}

      {config ? (
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
          {Object.entries(config.capabilities).map(([k, v]) => (
            <Chip key={k} size="small" label={k} color={v ? 'success' : 'default'} variant={v ? 'filled' : 'outlined'} />
          ))}
          <Chip size="small" variant="outlined" label={`LLM: ${config.openrouter_model}`} />
        </Stack>
      ) : null}

      {/* Upload */}
      <Section title="Upload a legal document" subtitle="PDF, JSON or TXT. Tag each as a statute, case file, or other to identify it.">
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField select label="Tag" value={docType} onChange={(e) => setDocType(e.target.value)} sx={{ minWidth: 160 }}>
              {(config?.doc_types ?? ['statute', 'case', 'other']).map((t) => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
              ))}
            </TextField>
            <TextField label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
            <TextField label="Jurisdiction (optional)" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} sx={{ minWidth: 180 }} />
          </Stack>
          <TextField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline minRows={1} />
          <Stack direction="row" spacing={2} alignItems="center">
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
              Choose file
              <input ref={fileRef} type="file" hidden accept=".pdf,.json,.txt,.md" />
            </Button>
            <Button variant="contained" onClick={upload} disabled={busy}>
              {busy ? <CircularProgress size={20} /> : 'Upload & chunk'}
            </Button>
          </Stack>
        </Stack>
      </Section>

      {/* Documents table */}
      <Section title="Documents" subtitle={`${docs.length} document(s) in the knowledge base`}>
        {docs.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No documents yet.</Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell>Tag</TableCell>
                  <TableCell align="right">Chunks</TableCell>
                  <TableCell align="right">Chars</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Uploaded</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {docs.map((d) => (
                  <TableRow key={d.id} hover>
                    <TableCell>{d.title}</TableCell>
                    <TableCell><Chip size="small" label={d.doc_type} variant="outlined" /></TableCell>
                    <TableCell align="right">{d.n_chunks}</TableCell>
                    <TableCell align="right">{d.char_count.toLocaleString()}</TableCell>
                    <TableCell><Chip size="small" label={d.status} color={d.status === 'indexed' ? 'success' : 'default'} variant="outlined" /></TableCell>
                    <TableCell>{d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => removeDoc(d.id)} aria-label="Delete">
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Section>

      {/* Index builder */}
      <Section
        title="Build retrieval index"
        subtitle="Choose embedding model, similarity pipeline, indexing technique and hyperparameters (rag-plan.md §2)."
      >
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Autocomplete
              sx={{ minWidth: 280 }}
              options={modelOptions}
              value={selectedModel}
              onChange={(_e, v) => v && setEmbModel(v.id)}
              getOptionLabel={(o) => o.label}
              getOptionDisabled={(o) => !o.available}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              renderInput={(params) => (
                <TextField {...params} label="Embedding model" InputProps={{ ...params.InputProps, startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.disabled' }} /> }} />
              )}
              renderOption={(props, o) => (
                <li {...props} key={o.id}>
                  <Stack>
                    <span>{o.label}</span>
                    <Typography variant="caption" color="text.secondary">{o.kind} · {o.dims}d {o.available ? '' : '· not installed'}</Typography>
                  </Stack>
                </li>
              )}
            />
            <TextField select label="Pipeline" value={pipeline} onChange={(e) => setPipeline(e.target.value)} sx={{ minWidth: 220 }}>
              {(config?.pipelines ?? []).map((p) => <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>)}
            </TextField>
            <TextField select label="Indexing technique" value={indexType} onChange={(e) => setIndexType(e.target.value)} sx={{ minWidth: 200 }}>
              {(config?.index_types ?? []).map((it) => <MenuItem key={it.id} value={it.id} disabled={!it.available}>{it.label}{it.available ? '' : ' (faiss req.)'}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField select label="Scope" value={scope} onChange={(e) => setScope(e.target.value)} sx={{ minWidth: 180 }}>
              <MenuItem value="">All documents</MenuItem>
              {(config?.doc_types ?? []).map((t) => <MenuItem key={t} value={t}>{t} only</MenuItem>)}
            </TextField>
            <TextField type="number" label="top_k" value={topK} onChange={(e) => setTopK(Number(e.target.value))} sx={{ width: 120 }} />
            <Box sx={{ flexGrow: 1 }} />
            <Button variant="contained" startIcon={<BuildIcon />} onClick={buildIndex} disabled={busy}>
              Build index
            </Button>
          </Stack>

          {indexes.length > 0 && (
            <>
              <Divider />
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Model</TableCell>
                      <TableCell>Pipeline</TableCell>
                      <TableCell>Index</TableCell>
                      <TableCell align="right">Dims</TableCell>
                      <TableCell align="right">Vectors</TableCell>
                      <TableCell align="right">Docs</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {indexes.map((ix) => (
                      <TableRow key={ix.id} hover>
                        <TableCell>{ix.name}</TableCell>
                        <TableCell>{ix.embedding_model}</TableCell>
                        <TableCell>{ix.pipeline}</TableCell>
                        <TableCell>{ix.index_type}</TableCell>
                        <TableCell align="right">{ix.dims}</TableCell>
                        <TableCell align="right">{ix.n_vectors}</TableCell>
                        <TableCell align="right">{ix.n_documents}</TableCell>
                        <TableCell><Chip size="small" label={ix.status} color={ix.status === 'ready' ? 'success' : 'default'} variant="outlined" /></TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => removeIndex(ix.id)} aria-label="Delete index">
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </>
          )}
        </Stack>
      </Section>

      {/* Query tester */}
      <Section title="Test the chatbot" subtitle="Retrieve from your indexed statutes/cases and synthesize an answer with citations.">
        <Stack spacing={2}>
          <TextField label="Ask a legal question" value={query} onChange={(e) => setQuery(e.target.value)} fullWidth multiline minRows={2}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runQuery() }} />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
            <TextField select label="Mode" value={mode} onChange={(e) => setMode(e.target.value)} sx={{ minWidth: 160 }}>
              <MenuItem value="auto">Auto</MenuItem>
              <MenuItem value="statutes">Statutes</MenuItem>
              <MenuItem value="cases">Cases</MenuItem>
              <MenuItem value="general">General</MenuItem>
            </TextField>
            <TextField select label="Index" value={queryIndex} onChange={(e) => setQueryIndex(e.target.value === '' ? '' : Number(e.target.value))} sx={{ minWidth: 220 }}>
              <MenuItem value="">Ad-hoc (use settings above)</MenuItem>
              {indexes.map((ix) => <MenuItem key={ix.id} value={ix.id}>{ix.name}</MenuItem>)}
            </TextField>
            <Box sx={{ flexGrow: 1 }} />
            <Button variant="contained" onClick={runQuery} disabled={querying}>
              {querying ? <CircularProgress size={20} /> : 'Run query'}
            </Button>
          </Stack>

          {answer ? (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
              <Typography variant="caption" color="text.secondary">Answer{answer.generator ? ` · ${answer.generator}` : ''}</Typography>
              <Typography sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{answer.answer}</Typography>
              {answer.citations?.length ? (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2">Citations</Typography>
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {answer.citations.map((c) => (
                      <Typography key={c.n} variant="body2" color="text.secondary">
                        [{c.n}] {c.source_doc}{c.hierarchy_path ? ` · ${c.hierarchy_path}` : ''}{c.doc_type ? ` (${c.doc_type})` : ''}{c.score != null ? ` · score ${c.score}` : ''}
                      </Typography>
                    ))}
                  </Stack>
                </Box>
              ) : null}
            </Paper>
          ) : null}
        </Stack>
      </Section>
    </Stack>
  )
}
