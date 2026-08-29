// M4b — upload the local storage backup into the NEW Supabase project.
//
// Fallback for `supabase storage cp`, which fails on this project with
// LegacyStorageUnsupportedOperationError for any local -> remote copy.
//
// Usage (service-role key comes from the environment, never a file, never printed):
//   node scripts/upload-new-storage.mjs                 # upload everything
//   node scripts/upload-new-storage.mjs --dry-run       # list what would upload, no network
//   node scripts/upload-new-storage.mjs --only meta/    # only keys containing this substring
//   node scripts/upload-new-storage.mjs --only meta/ --ext .json --cache-control "no-cache, max-age=0"
//
// Mirrors scripts/pull-old-storage.mjs from M4a.

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const PROJECT_REF = 'rfjhrosxbaihyrnbmmbl'
const BASE = `https://${PROJECT_REF}.supabase.co/storage/v1/object`
const ROOT = 'C:\\Users\\Kasutaja\\Estbirding_App\\estbirding-storage-backup'
const BUCKETS = ['bird-avatars', 'news-images']
const CACHE_CONTROL = 'max-age=31536000'
const CONCURRENCY = 6
const MAX_ATTEMPTS = 3
const FAILURES_PATH = join(ROOT, 'upload-failures.txt')

// A4 MIME map — the only extensions present in the backup tree.
const MIME = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.json': 'application/json',
  '.txt': 'text/plain',
}

const DRY_RUN = process.argv.includes('--dry-run')
const onlyIdx = process.argv.indexOf('--only')
const ONLY = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null
const extIdx = process.argv.indexOf('--ext')
const EXT = extIdx !== -1 ? process.argv[extIdx + 1].toLowerCase() : null
const ccIdx = process.argv.indexOf('--cache-control')
const CACHE_CONTROL_OVERRIDE = ccIdx !== -1 ? process.argv[ccIdx + 1] : null

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_KEY && !DRY_RUN) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is not set. Set it as a user env var and reopen the shell.')
  process.exit(1)
}

function contentTypeFor(name) {
  const dot = name.lastIndexOf('.')
  const ext = dot === -1 ? '' : name.slice(dot).toLowerCase()
  return MIME[ext] ?? 'application/octet-stream'
}

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

// Storage keys must match the old project byte for byte (species_meta_v1.json
// references them by path), so: path relative to the bucket dir, forward slashes.
function keyFor(bucketDir, fullPath) {
  return relative(bucketDir, fullPath).split(sep).join('/')
}

async function uploadOne(bucket, key, body, contentType) {
  const url = `${BASE}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
  let lastErr
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          'x-upsert': 'true',
          'cache-control': CACHE_CONTROL_OVERRIDE ?? CACHE_CONTROL,
          'content-type': contentType,
        },
        body,
      })
      if (res.ok) return { ok: true }
      const text = await res.text().catch(() => '')
      lastErr = `HTTP ${res.status} ${text.slice(0, 200)}`
      // 4xx other than 429 will not improve on retry.
      if (res.status < 500 && res.status !== 429) break
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 400 * attempt))
  }
  return { ok: false, error: lastErr }
}

async function main() {
  const tasks = []
  for (const bucket of BUCKETS) {
    const bucketDir = join(ROOT, bucket)
    // Walking each bucket dir individually means the stray failures.txt at the
    // tree root is never picked up.
    for (const full of await walk(bucketDir)) {
      const key = keyFor(bucketDir, full)
      if (ONLY && !key.includes(ONLY)) continue
      if (EXT && !key.toLowerCase().endsWith(EXT)) continue
      tasks.push({ bucket, key, full })
    }
  }
  if (ONLY) console.log(`--only ${ONLY}: ${tasks.length} file(s) selected`)

  const perBucket = {}
  for (const t of tasks) perBucket[t.bucket] = (perBucket[t.bucket] ?? 0) + 1
  console.log(`found ${tasks.length} files:`, perBucket)

  if (DRY_RUN) {
    for (const t of tasks.slice(0, 5)) console.log(`  ${t.bucket}  ${t.key}  ${contentTypeFor(t.key)}`)
    console.log('  … dry run, nothing uploaded')
    return
  }

  const failures = []
  let done = 0
  let bytes = 0
  let cursor = 0

  async function worker() {
    while (cursor < tasks.length) {
      const t = tasks[cursor++]
      const body = await readFile(t.full)
      const r = await uploadOne(t.bucket, t.key, body, contentTypeFor(t.key))
      done++
      if (r.ok) bytes += body.length
      else failures.push(`${t.bucket}\t${t.key}\t${r.error}`)
      if (done % 100 === 0 || done === tasks.length) {
        console.log(`  ${done}/${tasks.length}  ok=${done - failures.length}  failed=${failures.length}`)
      }
    }
  }

  const started = Date.now()
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  const secs = ((Date.now() - started) / 1000).toFixed(1)

  await writeFile(FAILURES_PATH, failures.join('\n') + (failures.length ? '\n' : ''), 'utf8')
  console.log(`\nuploaded ${done - failures.length}/${tasks.length} in ${secs}s (${bytes} bytes)`)
  console.log(`failures: ${failures.length} -> ${FAILURES_PATH}`)
  if (failures.length) process.exitCode = 1
}

await main()
