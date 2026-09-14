# Landing backup

A restore point taken **before any further landing edits** in the product-completeness pass.

## 备份时间

2026-09-12 21:37 (UTC+8)

## 原始文件

Canonical live landing:

| Path | Role |
|------|------|
| `index.html` | Marketing landing at `/` (CSS + JS inlined) |
| `landing-v3.html` | Byte-identical to `index.html`; SW allowlist / old URL |
| `preview-landing.bat` | Windows helper: serve repo root on :8080 and open `/` |

`index.html` and `landing-v3.html` SHA-256 (both):

```text
60DF6465050462481E110BE8527AD7A9E65F386EDE5A75FFD8D3F4E1CF33FEE8
```

Resource references (not separate repo files):

- Google Fonts: Playfair Display, Noto Serif SC, Noto Sans SC
- No local landing CSS/JS/image files
- Inline SVGs only
- CTA links: `/app/`
- Landing script unregisters origin-scoped service workers; **does not** read or write application `localStorage` / Dexie

## 备份位置

```text
backups/landing/2026-09-12-2137/
  index.html
  landing-v3.html
  preview-landing.bat
  MANIFEST.txt
```

Git restore marker:

```text
commit  816e31058ae109d829df2e753189c773cfe53ede
tag     landing-backup-2026-09-12
```

Working-tree plugin-runtime files from the previous session are **not** part of this landing snapshot.

## 恢复方法

**Preferred — copy from the backup folder** (does not depend on later commits):

```bash
cp backups/landing/2026-09-12-2137/index.html index.html
cp backups/landing/2026-09-12-2137/landing-v3.html landing-v3.html
cp backups/landing/2026-09-12-2137/preview-landing.bat preview-landing.bat
```

PowerShell:

```powershell
Copy-Item backups\landing\2026-09-12-2137\index.html index.html -Force
Copy-Item backups\landing\2026-09-12-2137\landing-v3.html landing-v3.html -Force
Copy-Item backups\landing\2026-09-12-2137\preview-landing.bat preview-landing.bat -Force
```

Verify:

```powershell
(Get-FileHash -Algorithm SHA256 index.html).Hash
# expect 60DF6465050462481E110BE8527AD7A9E65F386EDE5A75FFD8D3F4E1CF33FEE8
```

**Git — restore landing only from the tagged commit:**

```bash
git checkout landing-backup-2026-09-12 -- index.html landing-v3.html preview-landing.bat
```

Do **not** `git checkout` the whole tag onto `main` if you only want landing files.

## 本次修改范围

This backup was created **before** landing HTML/CSS/JS changes in the product-completeness pass.

A later visual pass (2026-09-12) edited live `index.html` / `landing-v3.html`. It did **not** overwrite `backups/landing/2026-09-12-2137/`. Restore to the pre-visual landing using the commands above; the expected SHA-256 is still the backup hash.

### Visual pass (2026-09-12, working tree)

Goal: layered atmosphere, brand signature, Hero depth — no IA rewrite.

Live `index.html` / `landing-v3.html` SHA-256 (both, after visual pass):

```text
7A829AA27996EA3542BDF8AFEA5D3B0F432C9A9F80A8DC89207375CCE534631B
```

This hash is **not** in the 2137 folder. To restore the visual pass after later edits, copy from Git working tree / a future commit of these two files. To restore the pre-visual landing, use the 2137 backup (hash `60DF6465…`).

Out of scope for landing restore:

- `src/` application (Character, Memory, chat, Dexie, plugin runtime)
- `app/index.html`
- Storage keys and schemas
