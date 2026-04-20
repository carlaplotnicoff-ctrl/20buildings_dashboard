import { useState, useRef } from 'preact/hooks';
import Papa from 'papaparse';
import { importContacts } from '../store/actions';
import { importLog, contacts, MARKETS } from '../store/data';
import { addToast } from '../components/Toast';
import { formatDate } from '../lib/format';

export function Import() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [market, setMarket] = useState(() => MARKETS.value.filter(m => m !== 'All')[0] || '');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef();
  const [dragOver, setDragOver] = useState(false);

  function handleFile(f) {
    if (!f) return;
    setFile(f);
    setResult(null);

    Papa.parse(f, {
      header: true,
      preview: 10,
      complete: (results) => {
        setPreview(results);
      },
      error: () => addToast('Failed to parse CSV', 'err'),
    });
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.csv')) handleFile(f);
    else addToast('Please drop a .csv file', 'err');
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    try {
      const fullParse = await new Promise((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          complete: (r) => resolve(r),
          error: reject,
        });
      });

      // Normalize column names
      const rows = fullParse.data.map(row => ({
        email: row.Email || row.email || row['Email Address'] || '',
        first_name: row['First Name'] || row.first_name || '',
        last_name: row['Last Name'] || row.last_name || '',
        job_title: row.Title || row['Job Title'] || row.job_title || '',
        company: row.Company || row.company || row['Company Name'] || '',
        phone: row['Phone'] || row.phone || row['Corporate Phone'] || '',
        linkedin: row['LinkedIn Url'] || row.linkedin || row['Person Linkedin Url'] || '',
      })).filter(r => r.email);

      const res = await importContacts(rows, market, file.name);
      setResult(res);
      addToast(`Imported ${res.imported} contacts (${res.skipped} duplicates skipped)`, 'ok');
    } catch (e) {
      addToast(`Import failed: ${e.message}`, 'err');
    }
    setImporting(false);
  }

  return (
    <div class="page">
      <div class="sh">Apollo CSV Import</div>

      <div
        class={`drop-zone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <div class="drop-zone-icon">&#128230;</div>
        <div class="drop-zone-text">{file ? file.name : 'Drop Apollo CSV here or click to browse'}</div>
        <div class="drop-zone-sub">Auto-detects Apollo format (First Name, Last Name, Email, Title, Company)</div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
      </div>

      {preview && (
        <div style={{ marginTop: '20px' }}>
          <div class="controls">
            <select value={market} onChange={e => setMarket(e.target.value)}>
              {MARKETS.value.filter(m => m !== 'All').map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
              <option value="__new__">+ New city...</option>
            </select>
            {market === '__new__' && (
              <input
                type="text"
                placeholder="City name (e.g. Charlotte)"
                style={{ padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.82rem' }}
                onBlur={e => { if (e.target.value.trim()) setMarket(e.target.value.trim()); }}
                onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) setMarket(e.target.value.trim()); }}
              />
            )}
            <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
              {preview.data.length} rows detected &middot; {preview.meta.fields?.length} columns
            </span>
          </div>

          <div class="sh">Preview (first 10 rows)</div>
          <div class="tscroll gc" style={{ maxHeight: '300px' }}>
            <table>
              <thead>
                <tr>{preview.meta.fields?.slice(0, 8).map(f => <th key={f}>{f}</th>)}</tr>
              </thead>
              <tbody>
                {preview.data.map((row, i) => (
                  <tr key={i}>{preview.meta.fields?.slice(0, 8).map(f => <td key={f}>{row[f]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button class="btn btn-p" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing...' : 'Import to Spire'}
            </button>
            <button class="btn btn-s" onClick={() => { setFile(null); setPreview(null); setResult(null); }}>
              Clear
            </button>
          </div>

          {result && (
            <div class="gc" style={{ padding: '16px', marginTop: '16px' }}>
              <div style={{ fontWeight: 700, color: '#059669', fontSize: '0.88rem' }}>Import Complete</div>
              <div style={{ fontSize: '0.82rem', color: '#4b5563', marginTop: '4px' }}>
                {result.imported} contacts imported &middot; {result.skipped} duplicates skipped
              </div>
            </div>
          )}
        </div>
      )}

      <div class="sh" style={{ marginTop: '32px' }}>Import History</div>
      {importLog.value.length === 0 ? (
        <div class="no-data">No imports yet</div>
      ) : (
        <div class="gc" style={{ padding: '12px' }}>
          {importLog.value.map(il => (
            <div key={il.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.04)', fontSize: '0.82rem' }}>
              <strong>{il.filename}</strong> — {il.row_count} contacts — {il.market}
              <span style={{ color: '#9ca3af', marginLeft: '8px' }}>{formatDate(il.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
