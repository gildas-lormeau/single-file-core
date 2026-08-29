# The SingleFile archive format

**Status: draft.** This document specifies the SingleFile archive, the polyglot file
format produced by [SingleFile](https://github.com/gildas-lormeau/SingleFile) when it
saves a page as a ZIP archive. It is written against the reference implementation,
[single-file-core](https://github.com/gildas-lormeau/single-file-core) 1.5.108
(`processors/compression/`), and every byte-level statement has been verified on
generated specimen files.

The key words MUST, MUST NOT, SHOULD and MAY are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) when, and only when,
they appear in all capitals.

Three kinds of statement appear throughout, and telling them apart matters more here
than in most specifications, because the format's whole method is to satisfy readers
that know nothing about it:

- **Format requirements**, in RFC 2119 capitals. Their subject is a writer producing an
  archive, or a *conforming reader of this format* — third-party software that reads
  SingleFile archives (§7). It is never the stock HTML, ZIP, PDF or PNG readers the
  document describes: those cannot be placed under an obligation by this document, and
  a requirement that appears to do so is describing what a writer must produce so that
  their existing behavior lands correctly (§4).
- **Reference behavior** — what `createArchive()` does where the format allows other
  choices. Always marked as the reference writer's, and never a requirement.
- **Measurements** — observed behavior of specific third-party software, with the
  version and the specimen it was measured on. §8 collects them; where one appears
  inline it is the evidence for a claim, not a guarantee about software in general.

## 1. Introduction

A SingleFile archive is **one byte string that is simultaneously a valid document in
several formats**. Every archive is a valid ZIP file containing the saved page and its
resources. Depending on the options used to produce it, the same byte string is also:

- a valid **HTML page** that extracts and displays the archived page when opened in a
  browser, with no external dependency;
- a valid **PNG image** showing a screenshot of the page;
- a valid **PDF document** rendering the page.

Each format's reader accepts the file as a complete document of its own format and
silently ignores the bytes that belong to the other formats — *accepts* rather than
*conforms*: several faces lean on reader tolerances the target standards do not
promise (§1.1). The large payloads are stored once and
shared: the archive entries, the PDF document and the PNG pixel data are single
regions that several readers reach, not per-face copies. The polyglot works by
*partitioning* the file into regions and arranging each region so that every reader
either interprets it or skips it. Optional features add derived views of the
page content: the text body (an optional plain-text copy of the page stored in the
HTML face for text tools and indexers, §4.6) repeats the page text, and a screenshot
is by definition a second rendering. But no face embeds another face's payload
twice.

### 1.1 Design goals

The format exists to keep saved pages readable for as long as possible, with as
little software as possible. Each way of opening the file has a simpler fallback:

1. In a JavaScript-capable browser, the file opens and displays the page.
2. When extraction fails, the file displays an error message with recovery
   instructions. Without JavaScript, it renders as a blank page: the document body
   is hidden by construction, so the browser displays neither the page nor raw
   archive bytes (§4.1).
3. Renamed to `.zip`, the file opens in any ZIP tool; the page and each resource are
   ordinary entries.
4. Renamed to `.pdf` or `.png` (when those faces are present), the file opens in a PDF
   viewer or an image viewer.

Three consequences shape everything below:

- **The HTML face depends on the ZIP face.** The HTML bootstrap extracts the page
  *from the ZIP structure of its own file*; the ZIP face is not an export feature, it
  is the storage layer the HTML face reads from.
- **Readers must need no cooperation.** Every face works with stock, unmodified
  readers. The format relies on two kinds of reader behavior: rules the target
  format actually defines (such as HTML's parsing and error-recovery rules, §4.1),
  and *customary tolerances* — behaviors that are near-universal in practice but
  that no standard promises, such as the backward scan ZIP readers use to find the
  End Of Central Directory record (§4.2, §5.2), the PDF header scan and
  trailing-data tolerance (§4.3), and PNG decoders' indifference to what an ancillary
  `tEXt` chunk contains (§4.4). The compatibility appendix records the customary
  tolerances' real-world support (§8).
- **The faces are not equally durable.** They rest on different amounts of unpromised
  behavior, and anyone deciding what to rely on years from now should rank them rather
  than treat "the file is valid in four formats" as four guarantees:
  1. **The ZIP face** is the one to trust, and the only one the format is willing to
     call storage. A variant with no other face is an ordinary ZIP file with nothing
     unusual about it. The self-extracting variants add prepended and appended bytes,
     which cost two measured readers — `ditto`, which requires a local header at offset
     0, and `java.util.zip`, which rejects undeclared trailing bytes, the second of
     which a writer can fix by declaring them as the archive comment (§4.2).
  2. **The HTML face** rests mostly on *normative* behavior: HTML's tokenizer states
     and error recovery are specified, and the blank-page backstop of §4.1 is ordinary
     CSS. Its exposure is that it depends on the ZIP face beneath it, and that a
     browser must run its script for the page to appear.
  3. **The PDF and PNG faces are conveniences.** Both rest entirely on tolerances no
     standard promises: the PDF header scan — where PDFium already enforces its
     1024-byte window exactly, with no margin — and PNG decoders' indifference to a
     `tEXt` chunk holding bytes the format does not permit. They are worth having
     because they cost nothing the other faces need, but a preservation policy should
     treat them as exports that happen to share the file, not as archival copies.

### 1.2 Non-goals

- **Forward-only ZIP parsers.** SingleFile archives require central-directory-driven reading (the
  entries are preceded by non-ZIP bytes). Parsers that stream local headers from
  offset 0 are out of scope (§7).
- **In-place modification by generic ZIP tools.** The face invariants are global:
  the writer picks each hiding tag only after checking the exact bytes it must hide,
  the recovery payload of universal mode contains a checksum of the whole ZIP
  region, and the PDF and PNG structures wrap the archive (§5.4). A tool
  that adds, removes or recompresses entries invalidates them, and most rewriters drop
  the prepended and appended regions outright. Editing an archive means producing a
  new one through the writer rules (§6); a generically rewritten file keeps, at
  best, its ZIP face.
- **Multi-page archives.** The reference implementation can bundle several saved
  pages into one archive behind a routing bootstrap (`multiPageArchive`). This
  version of the document specifies single-page archives only; the multi-page
  layout is out of scope.
- **Confidentiality outside the ZIP entries.** A password encrypts ZIP entry contents
  only (AES). The PDF and PNG faces render the page content and are plaintext by
  design; what the writer can withhold without breaking a face, it does withhold —
  see §5.6. The embedded PDF MAY itself be a PDF-encrypted
  document — the format is agnostic to the PDF's content — but the reference writer
  does not produce one.

### 1.3 Terminology

| Term | Meaning |
|---|---|
| **face** | One of the formats the file is valid in: HTML, ZIP, PNG, PDF. |
| **region** | A byte range with a single producer, named in §3. Regions are the units the rest of this document reasons about; a region can appear in several pieces — `html-prologue` resumes after the embedded PDF document in the PDF variants, and after the `tEXt "ZIP"` chunk header in the PNG ones, so with all four faces it comes in three. |
| **universal mode** | The variant whose HTML face can extract the archive from the *parsed page text*, the text and comment nodes the HTML parser produced, and therefore needs no access to its own raw bytes. Named "universal" because it works from any location, including the `file:` protocol. |
| **wrapper tag** | The HTML construct that hides a binary region from the HTML parser, `<!--`…`-->` by default (§5.1). |
| **appended data** | Bytes after the ZIP End Of Central Directory record. Readers tolerate them within the window their EOCD scan already covers: 65557 bytes from the end of the file (the 22-byte record plus the 65535-byte maximum comment length); "the 64 KB window" refers to this. It may be left undeclared or declared as the archive comment; both forms are valid ZIP and readers MUST accept both (§4.2). The recovery payload can be computed before that choice is made because it stops two bytes short of the record, excluding its comment-length field (see *recovered range* below). |
| **ZIP region** | The contiguous byte range holding the archive proper: from the first local file header the ZIP writer emitted through the last byte of the End Of Central Directory record. It spans the `zip-entries`, `pdf-central-record` (when present) and `central-directory · eocd` blocks of §3, and in the HTML variants it is exactly the content of the last wrapper. It does **not** include `pdf-local-header` or the PDF document, which sit earlier in the file. |
| **archive** | The *logical* ZIP file: the set of entries the central directory describes, wherever their bytes lie. This is distinct from the ZIP region above, which is a contiguous byte range. Every entry but one has its bytes inside the region; `page.pdf` is the deliberate exception, an entry of the archive whose local header and data sit before the region (§4.2). "Archive" in this document always means the logical file, "ZIP region" always the byte range, and the two differ only in the PDF-with-HTML variants. |
| **recovered range** | What the universal extractor reproduces (§4.5): the ZIP region minus its last two bytes, the comment-length field of the End Of Central Directory record. That field is the one part of the record whose value depends on what follows the region, so leaving it out is what lets a writer decide the appended-data form after the recovery payload is final (§4.2). The extractor supplies the two bytes itself, as zeroes — the recovered range carries no comment. |
| **reference writer** | `createArchive()` in single-file-core `processors/compression/compression.js`. |
| **bootstrap** | The inline script in the HTML face that locates, extracts and displays the archived page. |
| **`sfz` identifiers** | Three byte-level identifiers carry the `sfz` prefix: `data-sfz`, `<sfz-extra-data>` and `sfz-data`. The prefix is inherited from SingleFileZ, the browser extension the format originated in (since merged into SingleFile), and is kept unchanged for compatibility with existing files. They are wire identifiers, not the format's name. Two of the three have a role in the format: `<sfz-extra-data>` is the element carrying the recovery payload, and `sfz-data` is the identifier the universal extractor addresses the ZIP region with — an `id` attribute on the wrapper element, or the first characters of the wrapper comment's data (§4.5). `data-sfz` is a marker the reference writer happens to put on the root element; this document mentions it only where it describes bytes those files contain. |

## 2. Variants: composing faces

Every SingleFile archive has the ZIP face. The other faces are enabled independently by writer
options, and compose. Each row of the table lists its complete option set; every row
also implies `compressContent`, the option that stores the page and its resources as
ZIP entries and so makes the output an archive at all:

| Writer options (core names) | HTML | PNG | PDF | Extension | Specimen |
|---|---|---|---|---|---|
| *(none)* | — | — | — | `.zip` | pure zip |
| `selfExtractingArchive` | ✔ | — | — | `.zip.html` | plain |
| `selfExtractingArchive`, `extractDataFromPage` | ✔ universal | — | — | `.u.zip.html` | universal |
| `selfExtractingArchive`, `extractDataFromPage`, `embeddedImage` | ✔ universal | ✔ | — | `.u.zip.html` | png |
| `selfExtractingArchive`, `extractDataFromPage`, `embeddedPdf` | ✔ universal | — | ✔ | `.u.zip.html` | pdf |
| `selfExtractingArchive`, `extractDataFromPage`, `embeddedImage`, `embeddedPdf` | ✔ universal | ✔ | ✔ | `.u.zip.html` | png-pdf |
| `embeddedPdf` | — | — | ✔ | `.zip` | zip-pdf |
| `embeddedImage` | — | ✔ | — | `.zip` | zip-png |
| `embeddedImage`, `embeddedPdf` | — | ✔ | ✔ | `.zip` | zip-png-pdf |

`extractDataFromPage` is orthogonal to the PNG and PDF faces. The PNG and PDF rows
include it because the clients producing those variants enable it by default, but
`embeddedImage` and `embeddedPdf` compose with a non-universal self-extracting file
just as well; the extension is then `.zip.html`. The one interaction: `page.pdf` lies
outside the ZIP region (§1.3), so the page-text extraction path does not recover it
with the rest and the extractor skips that entry (§4.5); every path that reads raw
bytes sees it normally. In the last three rows there is no
HTML face, so the option does not apply. The *Specimen* column names the measured
reference files this document cites; §8 records how to regenerate them.

Notes on composition:

- **Universal mode requires the HTML face** (it is a property of the bootstrap) and is
  independent of PNG/PDF. The command-line client enables it by default whenever it
  produces a self-extracting file; the browser extension exposes it as the
  "self-extracting ZIP (universal)" file format.
- **The extra-data payload is what separates the two self-extracting types in
  practice.** A plain file has no way of its own to reach its bytes from a `file:`
  URL: the bootstrap has no payload to rebuild the archive from and does not attempt
  a self-read there (§4.1), so it goes to its error message. Opening one from disk
  needs cooperating software that reads the file and hands it to the bootstrap — the
  SingleFile extension does this once granted file access ("Allow access to file
  URLs" in Chrome, Edge and Brave; "Disable Local File Restrictions" in Safari). Over
  HTTP the plain file is self-sufficient, fetching its own URL. A
  universal file instead carries the extra-data payload (§3.1, §5.5), so the bootstrap can
  rebuild the archive from the parsed page text with no access to the raw bytes at
  all — the file opens from disk in any browser, with no setting and no
  assistance.
- **All four faces at once is a supported combination**: the PDF document rides
  inside the HTML head, which itself rides inside the PNG's first `tEXt` chunk
  (the all-four-faces row of the byte map).
- **Faces without HTML** are plain polyglots with no self-extraction and no markup:
  the ZIP data is appended after a raw PDF document (which is then plain prepended
  data), or wrapped in PNG chunks — or both, the PNG chunk layout carrying the PDF
  document as the data of its own `tEXt` chunk (keyword `PDF`) placed right after
  `IHDR`, which keeps `%PDF-` within the header scan window (§4.3). In none of
  these variants is `page.pdf` an archive entry.

### 2.1 The charset rule

The HTML face declares `<meta charset=utf-8>` when universal mode is off, and a
single-byte charset when it is on — `windows-1252` in the reference writer. The
declaration MUST appear within the first 1024 bytes of the file so the parser's
encoding prescan finds it. The prescan reads exactly that many bytes and does not
resume, so the whole `<meta>` tag has to fit: one that straddles the boundary is not
seen, and the parser falls back to its default encoding.

Universal mode works in two parts, and the charset carries the first. The archive
bytes themselves are recovered *from the parsed page text*: the browser decoded
them as characters when it parsed the file, and the bootstrap re-encodes those
characters back into bytes. The requirement this places on the charset is
**injectivity**: under the encoding's index in the
[WHATWG Encoding Standard](https://encoding.spec.whatwg.org/) — the mapping every
browser implements — each of the 256 byte values MUST decode to a distinct code
point, and no byte may decode to U+FFFD. Any encoding with that property carries
arbitrary bytes through the parse, and 20 of the standard's encodings qualify (§8.4).
Multi-byte encodings, `utf-8` included, do not: invalid sequences collapse to U+FFFD
and the bytes cannot be recovered.

The reference writer uses `windows-1252`, for reasons beyond injectivity. It is the
best-supported single-byte encoding there is: the standard resolves the `iso-8859-1`
and `ascii` label families to it, and it is the fallback the HTML standard prescribes
for unlabelled content in most locales — so a file whose `<meta charset>` is stripped
or overridden by a server still tends to be decoded the way the extractor expects. It
also keeps the reverse table small, at 27 entries (§5.5).

The second part is the extra-data payload, which does **not**
contain the archive: it carries only what the round trip destroys, namely a checksum
and the information needed to restore newline bytes, which the parser normalizes.
The parser also replaces NUL bytes with U+FFFD; since no byte decodes to U+FFFD under
a qualifying encoding, the extractor maps U+FFFD back to NUL unambiguously and the
payload needs nothing for it (§5.5).

### 2.2 File name conventions

The reference implementation names files by variant: `.zip` (no HTML face),
`.zip.html` (self-extracting), `.u.zip.html` (self-extracting, universal). These are
conventions for humans and pickers; **readers MUST NOT rely on the file name**. Every
face is discoverable from the bytes alone: PNG and PDF by their signatures, the ZIP
face by its End Of Central Directory record, and the HTML face by an `<html` start tag
occurring before the first local file header — inside the first `tEXt` chunk's data in
the PNG variants, where the markup begins after the chunk's keyword. Inside the
archive, the `index.html` and `manifest.json` entries mark it as a saved page, and
that is the identification a reader should use (§7.1). The self-extracting variants
are told apart the same way: a universal file carries an `<sfz-extra-data>` element,
a plain one does not.

## 3. The byte map

Unless a row states otherwise, the layouts below are measured from specimen files
saved from `example.com` (the generation commands are in §8); the
oversized-payload layout is derived from the writer rules instead, because a payload
over 64 KB requires an archive too large for a readable specimen. The figure below shows
the regions and their order; the glossary of §3.1 is the normative list, and everything
the figure conveys is stated there in text, so a copy of this document without its
assets is still complete.

![SingleFile archive byte map](assets/singlefile-archive-byte-map.svg)

### 3.1 Region glossary

The names below are the block labels of the figure (where space is tight the figure
merges adjacent blocks into one label, such as `--></body></html>`). In this table,
*Producer* names
the syntax the bytes belong to (*extractor* marks the recovery machinery of
universal mode), and *Present* names the faces, variants or modes in which the
region exists. Rows are grouped: the HTML/ZIP core first, then the regions the PDF
face adds, then the regions the PNG face adds.

| Region | Producer | Present | Contents |
|---|---|---|---|
| `html-prologue` | HTML | HTML face | Doctype, the root element start tag, an optional implementation-defined comment, `<meta charset>`, title, optional head elements (canonical link, `robots` meta, viewport, Content-Security-Policy), minimal CSS, `<body hidden>`, wait/error messages, optional table of contents, optional text body (§4.6). In the plain variant an optional UTF-8 BOM MAY precede the doctype (`includeBOM`); universal and PNG variants never carry one. In the PNG variants the region is split: everything through `<body hidden>` is the data of the `tEXt "PNG"` chunk, while the messages, the optional table of contents and the optional text body follow the `tEXt "ZIP"` chunk header; the doctype and the leading comment are dropped. |
| `bootstrap` | HTML | HTML face | One inline `<script>`: the embedded ZIP reader, the extractor, the display routine, and the content-acquisition logic (§4.1). The wrapper start tag that opens the ZIP region follows it, directly or after a relocated `extra-data`. |
| `<!--` / `-->` | HTML | HTML face | The wrapper tag pair hiding a binary region from the HTML parser — comment tags by default, another pair when the hidden bytes contain `-->` (§5.1). Drawn at each opening and closing position. The close tag is absent when appended data is prevented (`preventAppendedData`, or the `<plaintext>` wrapper which cannot close): no markup follows the archive and the wrapper runs to end-of-file. That does not mean the file ends at the EOCD — the PNG face's tail still follows, inside the wrapper, where it parses as text (§5.1). |
| `zip-entries` | ZIP | always | The archive's local file headers and entry data, written by the ZIP writer. The central directory of an archive written by the reference writer lists `index.html` (the page) first, then `manifest.json` (a JSON description of the archive: original URL, title, save time, resource-to-URL map — informative; the page displays without it), then the resources; the *physical* order of the local headers inside the region is not guaranteed to match, and readers MUST NOT rely on either order — entries are addressed by name (§7.1). |
| `central-directory · eocd` | ZIP | always | The central-directory records followed by the End Of Central Directory record. All offsets are absolute file positions (§5.3). In the HTML+PDF variants the EOCD accounts for the injected `pdf-central-record` (how the writer achieves that is §6). |
| `extra-data` | extractor | universal | `<sfz-extra-data>` element holding the base64, deflate-compressed recovery payload (§5.5). It always sits outside the wrapper, so it parses as a real element the extractor can address. Normal placement: after the EOCD, between the wrapper close tag and the end tags. Relocated placement, used when the payload exceeds the 64 KB appended-data window or `preventAppendedData` is set: immediately before the wrapper start tag. In the relocated form the element is followed by space padding: its room is reserved before the archive is written, because the region precedes the ZIP data and resizing it would shift every central-directory offset (§6). Neither placement carries positional meaning — the extractor finds the ZIP region by identifier, not relative to this element (§4.5). |
| `</body></html>` | HTML | HTML face | The end tags closing the document after the wrapper close tag. Omitted when appended data is prevented, and in the PNG variants so the file can end with the PNG tail. |
| `pdf-local-header` | ZIP | PDF face with HTML | The hand-built local file header for `page.pdf` (STORE, checksum precomputed), written immediately before the PDF document so ZIP readers see an ordinary entry whose data is the PDF (§6). |
| `pdf-document` | PDF | PDF face | The raw PDF bytes. With the HTML face, wrapped together with `pdf-local-header` in a wrapper tag pair inside `html-prologue`, placed so `%PDF-` starts at offset 1024 or lower — the range PDF readers search for the header, which is what lets a PDF document start after other bytes at all (§4.3). Without the HTML face the file simply *starts* with the PDF document, as prepended data the ZIP face tolerates; `page.pdf` is then not an archive entry at all — no local header, no central record. |
| `pdf-central-record` | ZIP | PDF face with HTML | The central-directory record for `page.pdf`, injected *before* the writer's own central directory. The start of the central directory is the one place a record can be added without moving any offset the writer already committed, and it makes `page.pdf` the first entry ZIP tools list (§6). |
| `png-signature · IHDR` | PNG | PNG face | The 8-byte PNG signature and the `IHDR` chunk declaring the screenshot's dimensions — the first 33 bytes of the file. |
| `tEXt "PNG"` | PNG | PNG face with HTML | The length, type and keyword bytes of the first `tEXt` chunk. Its data is `html-prologue` (with the PDF face, the embedded PDF document rides inside it too), ending with the wrapper start tag. |
| `tEXt "PDF"` | PNG | PNG + PDF faces without HTML | The length, type and keyword bytes of a `tEXt` chunk whose data is the raw PDF document. Written only when the PNG and PDF faces combine without HTML — with the HTML face the PDF rides inside `tEXt "PNG"` instead — and placed right after `IHDR` so `%PDF-` stays within the header scan window (§4.3). |
| `pixel-data chunks` | PNG | PNG face | The screenshot's image-data chunks, copied unmodified from the source image. With the HTML face they sit inside the wrapper so the HTML parser skips them. |
| `tEXt "ZIP"` | PNG | PNG face | The length, type and keyword bytes of the second `tEXt` chunk. Its declared length covers everything from there to the trailing chunk CRC, so the PNG decoder skips the archive — and, with the HTML face, the bootstrap and the appended data — as the data of one chunk. With the HTML face, the wrapper opened at the end of `tEXt "PNG"` closes immediately after these bytes: its content is the first chunk's CRC, the pixel-data chunks and this chunk's own header, and the prologue resumes as markup directly after the close tag. |
| `crc · IEND` | PNG | PNG face | The `tEXt "ZIP"` chunk's CRC, computed once the archive bytes are final (§6), followed by the empty `IEND` chunk — the last bytes of the file (PNG requires `IEND` to end the stream, which is why the PNG variants drop the end tags). |

The reader-by-reader interpretation of these regions is §4; the mechanics that keep
them from colliding (wrapper-tag selection, checksums, offsets, the 64 KB budget) are
§5.

## 4. Reader lenses

A polyglot is hard to read as one layout but easy to read as one reader at a time:
each consumer has a defined way of locating its own bytes and a defined reason to
ignore the rest. This section walks the same file through each reader. The figure
shows the all-four-faces variant of the byte map once per reader, fading the regions
that reader ignores; the subsections explain each row.

![SingleFile archive reader lenses](assets/singlefile-archive-lenses.svg)

This section describes what stock readers do with the file. The convention stated at
the head of this document applies throughout it: a MUST about a face constrains the
bytes a writer produces, never the stock reader whose behavior the format cannot
change.

### 4.1 The browser

The HTML parser consumes the whole file as one document. Its encoding prescan finds
the `<meta charset>` declaration within the first 1024 bytes (§2.1) and the file is
decoded as a single text; every binary region therefore also exists as characters in
the parsed document, which is what universal mode exploits (§4.5).

The binary regions are kept out of the rendered page by the wrapper tags. The
default wrapper is an HTML comment, and the HTML standard defines exactly which
character sequences terminate one (`-->`, and the recovery form `--!>`); the writer
MUST select a wrapper only after checking the bytes it must hide against that
wrapper's patterns (the exact rules differ between the ZIP region and the PDF and
PNG payloads, §5.1), so hiding relies on normative parsing behavior, not on luck. One
case weakens the wrapper itself: when no wrapper fits a PDF or PNG payload the
payload is emitted bare (§5.1). And some binary content always sits *outside* a
wrapper — in the PNG variants, the signature, IHDR and chunk framing bytes that
precede the root element start tag decode to a short run of text that HTML error recovery
places in the (hidden) body. The backstop for all these cases is the prologue: it
declares `<body hidden>` and a stylesheet that suppresses everything except the
wait and error messages, which is what ultimately guarantees a blank page rather
than raw bytes, with or without scripting.

The bootstrap script runs at parse time and proceeds in three stages:

1. **Acquire the archive bytes.** On `file:` URLs it goes straight to page-text
   extraction (§4.5): whether a `file:` page may read its own bytes varies by
   browser and configuration (§2), so the bootstrap uses the rung that depends on
   neither. On other protocols it requests its own URL, aborting at the response
   headers: when the server advertises `Accept-Ranges: bytes` it switches to HTTP
   range reading, fetching only the central directory and the entries it needs (a
   large archive displays without downloading the ZIP region in full); otherwise it
   downloads the whole file. When the header probe fails it falls back to page-text
   extraction; a failure of the full download itself, past the probe, reveals the
   error message directly. Only when every applicable rung fails does the error
   message appear, with recovery instructions that differ by variant (§2).
2. **Extract.** The embedded ZIP reader reads the archive through the ZIP lens
   (§4.2) and rebuilds the page: text entries are decoded, binary entries become
   in-memory URLs, and references between entries are rewritten deepest-first.
3. **Display.** The rebuilt page replaces the bootstrap document. Around this stage
   the saved page's `<noscript>` elements are neutralized — rewritten to inert
   placeholders before parsing, restored afterwards — because the page was captured
   with scripting available, so its noscript fallbacks must not activate in the
   viewer.

The entry point is exposed as a run-once `globalThis.bootstrap(content)` function,
so cooperating software MAY hand the bootstrap bytes it acquired itself; `content` is
the file's bytes as a `Blob` or an array of byte values, or a reader object exposing
the embedded ZIP reader's `readUint8Array` interface, and the call returns a promise
that settles when the page has been displayed. This is how
the SingleFile extension assists a *plain* (non-universal) file on `file:`: granted
file-URL access, it reads the file and invokes the bootstrap, which is exactly the
recovery path the plain variant's error message describes.

### 4.2 The ZIP reader

The ZIP face is read from the end. A reader locates the End Of Central Directory
record by scanning backward from end-of-file; the format guarantees it lies within
the window every reader must already scan to support archive comments (§1.3,
*appended data*), because everything after it — wrapper close tag, extra-data, end
tags, PNG tail — fits the appended-data budget (§5.2). Accepting *undeclared* bytes
in that window is itself a customary tolerance (§1.1): the ZIP specification
documents the comment, not trailing junk. From the EOCD
the reader jumps to the central directory and reads only what it references;
central-directory-driven reading is a requirement of the format (§1.2, §7).

Two properties keep ordinary ZIP tools comfortable:

- **Offsets MUST be absolute file positions** (§5.3). The stored central-directory offset
  equals the record's actual position, and each entry's local-header offset points at
  a real local header — tools that cross-check offset arithmetic (rather than
  tolerating a uniform shift from prepended data) accept the file as-is.
- **The non-ZIP regions are invisible to the reader.** Bytes before the first local
  header and after the EOCD are simply never referenced. The one deliberate
  exception: in the PDF-with-HTML variants the first central-directory record points
  *back into the HTML head*, where the hand-built `page.pdf` local header and the PDF
  document sit (`pdf-local-header`, §3.1) — an ordinary STORE entry that happens to
  live inside the prepended region.

A listing shows `page.pdf` first (when the PDF face is present with HTML), then
`index.html`, `manifest.json` and the page's resources. That order and the two
conventions below describe the reference writer rather than constraining the format —
readers address entries by name (§7.1):

- Entries for resources fetched from a URL carry that URL in their *comment* field; a
  resource that came from a `data:` URL carries the literal marker `data:` instead,
  and `manifest.json` and `page.pdf` have no comment. Comments are omitted entirely
  from a password-protected archive, because the central directory is not encrypted
  (§5.6).
- Entries whose content is already compressed (images, fonts, media, PDF) are STOREd
  and the rest are deflated, a size optimization no reader depends on.

One rule here is a requirement. With a password, entry contents are AES-encrypted —
except `page.pdf`, which MUST stay unencrypted and MUST be STOREd, because its bytes
double as the PDF face (§5.6). The encryption is WinZip's AES scheme, the one ZIP
tools implement under compression method 99 with the `0x9901` extra field: AE-2,
AES-256, PBKDF2-HMAC-SHA1 key derivation and an HMAC-SHA1 authentication code. A
reader that already supports encrypted ZIP entries needs nothing specific to this
format.

Appended data comes in two forms and both are valid ZIP, so readers MUST accept
both. **Raw** — the EOCD declares a zero-length comment and the trailing bytes are
simply outside the archive — is the default, because tools print a declared archive
comment on ordinary operations (§8.1), and in universal mode that comment is the
whole base64 recovery payload. **Declared** — the EOCD's comment length covers every
byte after the record — is what older writers emitted, and it is the only form some
readers accept at all: `java.util.zip`, and therefore Android and most JVM tooling,
rejects an archive with undeclared trailing bytes outright (§8.1). A writer SHOULD
offer both and default to raw.

Neither form constrains the other faces, and universal mode supports both, because
the recovery payload describes the recovered range rather than the whole region: the
comment-length field is excluded (§1.3), so its value can be decided after the
payload is final. A writer that instead covered the field would have to solve a
circular dependency — the field's value depends on the size of the appended run,
which contains the payload, whose content depends on the field.

### 4.3 The PDF viewer

The PDF face relies on two customary reader behaviors — conventions PDF
implementations follow rather than guarantees of the PDF specification, which is why
the compatibility appendix records real-world support (§8):

- **The header scan.** Viewers accept a file whose `%PDF-` header starts at offset
  1024 or lower — the bound is on the header's first byte, and 1024 itself passes, as
  the measurement below shows — and treat
  the header's position as byte 0 of the document: every
  offset in the file (cross-reference entries, `startxref`) is interpreted relative
  to it. The writer MUST place the header inside that window; the document's own
  offsets then need no rewriting. Engines differ in how strictly they hold to the
  1024-byte figure, and the strict ones are the common ones: PDFium — Chrome, Edge and
  everything else Chromium-based — accepts a header starting at offset 1024 and
  rejects one at 1025 outright, while poppler and macOS PDFKit impose no limit at all
  (§8.1). The window is therefore a real constraint, not a formality.
- **Tolerance of trailing data.** The archive continues after `%%EOF`, so the
  document's tail is not the file's tail. Viewers cope by searching backward for the
  trailer over a larger window or by reconstructing the cross-reference table from
  the objects themselves.

With the HTML face, the PDF document sits inside the head, wrapped in its own
wrapper-tag pair chosen against the PDF's bytes (a PDF containing `-->` steps the
ladder, §5.1), and preceded by the `page.pdf` local header so the same bytes are also
a ZIP entry. That dual role is why the entry MUST be STOREd and MUST NOT be
encrypted: a viewer reads the entry's data region directly, and any transformation
of it would break the face. Without the HTML face the document needs no wrapper, and
where it sits depends on the PNG face: alone with the ZIP face it simply starts the
file, at offset 0, exercising only the trailing-data tolerance; with the PNG face it is
the data of a `tEXt "PDF"` chunk placed right after `IHDR` (§3.1), which puts `%PDF-`
at roughly offset 45 — inside the window, but not at its start.

### 4.4 The PNG decoder

PNG offers no header scan: the standard requires the signature to be the first
8 bytes of the stream and `IEND` to be its last chunk. The PNG face therefore owns
both ends of the file — the HTML face gives up its doctype and leading comment
at the front, and the closing `</body></html>` at the back (§3.1).

After the signature, a decoder walks chunks — length, type, data, CRC — and skips
ancillary chunks it does not use. The face hides all foreign bytes inside two `tEXt`
chunks (ancillary by construction, their type starting lowercase):

- **`tEXt` with keyword `PNG`** carries the head of the HTML prologue, through
  `<body hidden>` — and, in the all-faces variant, the embedded PDF document inside
  it — ending with the wrapper start tag. The rest of the prologue, the messages and
  the optional text body, comes later, inside the second chunk.
- **`tEXt` with keyword `ZIP`** declares a length that covers everything from its
  keyword to the trailing chunk CRC: the rest of the HTML, the bootstrap, the whole
  ZIP region and the appended data. The decoder hops over all of it as the data of
  one chunk.

Both chunks carry text the PNG standard does not strictly permit: a `tEXt` text
string is Latin-1 text, and the payloads here contain NUL bytes — 78 in the
`tEXt "ZIP"` chunk of the `png` specimen, 101 in the `png-pdf` one. Decoders skip
ancillary chunks without inspecting their text, so this passes everywhere tested
(§8.1). It is the PNG tolerance §1.1 lists, exercised at its limit: not merely that a
decoder ignores a `tEXt` chunk's text, but that it ignores text PNG does not permit.

Both chunks MUST carry correct CRCs — decoders are entitled to verify them, and the
second chunk's CRC can only be computed once the archive bytes are final (§6). The
`pixel-data chunks` region is copied bit-identically from the source screenshot, so
the decoded image is exactly the capture; the format never re-encodes pixels.

### 4.5 The universal-mode extractor

The last reader is the format's own: the extraction path of universal mode, used
when the raw bytes are unreachable (§4.1). Its input is not the file but the *parsed
document* — the characters the HTML parser produced — and its output is the exact
ZIP region, byte for byte.

It works in three steps:

1. **Locate.** The extractor finds the `<sfz-extra-data>` element for the payload, and
   the ZIP region's node by its identifier `sfz-data` (§1.3): the element returned by
   `getElementById`, or, when the wrapper is a comment, the first comment in the
   document whose data starts with those characters. An element bearing the identifier
   wins over a comment when both resolve; a reader that finds an id-bearing element
   which is not one of §5.1's wrapper rungs SHOULD fall back to the comment, since the
   `id` is then something else in the page. The two placements (§3.1) need no
   telling apart, and neither the region's position in the tree nor its depth carries
   meaning — a document that moved the node before extraction resolves the same way,
   which matters because the reference extractor relocates `meta` and `style` elements
   into the head before this step and one wrapper rung is a `style` element. With a
   comment wrapper the identifier is part of the node's data, so the re-encoding in
   step 3 starts after it.
2. **Decode the payload.** The element's text is base64 of a raw-deflate stream, and
   the writer puts nothing else inside the element — the padding of the relocated
   placement sits outside it (§6.1) — though a reader SHOULD ignore whitespace there
   rather than reject the file. It
   inflates to four fields: a checksum of the recovered range, its byte length, the
   newline count, and the packed sequence of 2-bit codes recording each original
   newline (LF, CR or CR LF). Every one of the four describes the *recovered range*,
   not the whole ZIP region: a newline formed by the two excluded bytes is neither
   counted nor coded, and the checksum does not cover them. The declared length is the **only** bound on the re-encoding — the
   extractor MUST stop there and append two zero bytes to complete the EOCD record.
   Those two bytes are its comment-length field, and only that field: every other byte
   of the record is reconstructed from the parsed text like the rest of the region. The
   field is excluded because its value depends on what follows the region, so a payload
   covering it could not be computed until the appended data was final (§1.3); a
   recovered archive therefore always declares a zero-length comment, whatever the
   original declared. Never infer the bound from the node instead: the wrapper's close tag is
   absent whenever appended data is prevented, and under `<plaintext>` the node always
   runs to end of file. The final word is padded to 16 codes,
   so codes beyond the declared newline count carry no meaning and a reader MUST ignore
   them; within the count, the value 3 is unassigned and a reader MUST reject a payload
   that uses it.
3. **Re-encode the characters.** Apply the inverse of the declared charset, exactly
   as §5.5 defines it: a character whose code point is a byte value that decodes to
   itself becomes that byte, every other code point goes through the reverse table,
   and U+FFFD becomes NUL. Under windows-1252 this is nearly an identity — 229 of the
   256 values map to themselves — but the shortcut "any code point ≤ 255 is that
   byte" is **not** a valid substitute: under other qualifying charsets (§2.1) code
   points below 256 can belong to a different byte, 75 of them under `macintosh`, and
   the shortcut would silently corrupt the region. The two things parsing destroyed
   are restored from the payload: each parsed newline consumes the next 2-bit code to
   reproduce the original byte sequence.

In the PDF-with-HTML variants the recovered region is a complete archive except for
one entry: its central directory still lists `page.pdf`, but that entry's local
header and data sit in the HTML head, outside the ZIP region (§1.3). The extractor
skips the entry instead of failing — the displayed page never references it, and
the PDF stays reachable through every raw-bytes path (§4.2).

The entry's offset is unusable *within the recovered region* — it is a true file
position like every other (§5.3), and a reader of the whole file follows it normally;
what fails is only the shifted arithmetic of the paragraph below. Its bytes are not out
of reach either: the local header
and the document sit in a wrapper in the head, so they are in the parsed page like any
other region, and a reader MAY recover them by the same round trip — find a local file
header naming `page.pdf` among the other parsed nodes, take the declared number of
bytes after it, and check them against the CRC-32 the central directory holds. That
check is mandatory rather than diligent, because the recovery payload's newline codes
cover the ZIP region only: a newline in the PDF block has no code, so its original
bytes must be guessed (assume LF, the byte the parser normalized *to*), and a PDF
routinely contains CR. The guess is right often enough to be worth trying and wrong
often enough that nothing may be written without the CRC agreeing; take the length from
the central-directory record, which is the entry's authority for it — the hand-built
local header of §6.1 carries the same value, but a reader has no way to know it was
built that way rather than deferred to a data descriptor. A matching CRC-32 is validation, not proof of identity:
it is a 32-bit non-cryptographic check over a reconstruction that differs from the
original in at most a few newline bytes, which makes an undetected error unlikely but
not impossible. A reader MUST NOT present a reconstructed `page.pdf` as verified, and
MUST NOT let one displace bytes obtained from a raw-bytes read.

Recovering the entry is therefore optional, and skipping it — what the reference
extractor does — is conforming.

Skipping it silently is not, for one kind of reader. A reader that *presents the
archive's contents* — a listing, an extract-to-disk, an entry enumeration offered to a
caller (§7.1) — MUST report `page.pdf` as present and unretrieved rather than omit it,
whether it skipped the recovery or tried and failed the CRC check; the listing is then
the same as a raw-bytes reader's and only the bytes are missing. A reader that has no
such surface is outside the rule: the display path of §4.1 rebuilds a page from the
entries it needs, `page.pdf` is referenced by nothing in that page, and the reference
extractor accordingly filters the entry out on every acquisition path, including the
ones that read raw bytes and could return it. Dropping an entry nobody can observe is
not the same act as dropping one from an answer about what the archive holds.

The extractor MUST verify the three checkable payload fields — byte length, newline
count and checksum — and fail to the error message on any mismatch; a corrupted
reconstruction is never fed to the ZIP reader.

The recovered region is a complete archive but **not an offset-self-contained one**.
Its offsets are still absolute positions in the original file (§5.3), so every
local-header offset in its central directory, and the central-directory offset in its
EOCD record, overshoot by exactly the region's start position in the file. A reader of
the recovered region MUST therefore apply a uniform negative shift of that amount —
which is the prepended-data compensation ZIP readers already implement, since from the
region's point of view the missing bytes look like a prefix that was stripped. In the
specimen of §8.2 the shift is 122005 bytes: Info-ZIP reports `missing 122005 bytes in
zipfile`, adds `(attempting to process anyway)` and lists both entries, while readers
that compensate silently, such as Python's `zipfile`, show no diagnostic at all. This is also what puts `page.pdf` out of the
offset-following path: its local header lies *before* the region, so its compensated
offset is negative (−102092 in the `pdf` specimen) and no reader can seek to it. On
success the shifted bytes enter the normal extraction path (§4.2).

The shift is a file offset, and a universal-mode reader has no file. It does not need
one: the region carries the shift within itself, since its EOCD declares both the size
of the central directory and its absolute offset, while the directory's position inside
the region is known. With `region` the recovered bytes,

```
shift = eocd.centralDirectoryOffset - (region.length - 22 - eocd.centralDirectorySize)
```

which is precisely what a ZIP reader's prepended-data compensation computes internally
— so a reader handing the recovered region to such a library has nothing to do at all.
Under zip64 (§5.4) both of those EOCD fields are the `0xFFFFFFFF` sentinel and the
formula MUST be applied to the zip64 end of central directory record instead, whose
offset the zip64 locator gives; a reader that uses the sentinels arithmetically gets a
shift in the billions rather than a diagnostic.

### 4.6 Text tools

The optional text body (`insertTextBody`) addresses one more consumer: software that
reads the file as plain text — `grep`, desktop search, indexers — and will never run
the bootstrap or unzip anything. It is a `<main hidden>` element at the end of the
visible prologue holding the page's text content, so the page stays searchable
without any extraction. Searchable to everyone, which is why it is not written at all
when a password is set (§5.6): it would hand the page's text to the same tools the
password is meant to stop.

The text body is always written in UTF-8, regardless of the declared charset. In
universal mode this cuts its audience in two: a charset-oblivious tool that reads
raw bytes — `grep`, plain-text search — sees intact UTF-8, while any consumer that
honors the declared `<meta charset>` decodes it as windows-1252 and garbles
non-ASCII text. That includes the HTML parser itself — harmless there, because the
region is hidden and replaced (§4.1) — but also HTML-aware indexers, which is the
tradeoff universal mode accepts. The text body opens with the page title, for the same
raw-byte audience — it is the first *text* in the element, which is not necessarily the
element's first line: the reference writer's serialization puts a newline before it.

The `<title>` element takes the opposite route. Its content is RCDATA, where
character references are resolved against Unicode independently of the declared
encoding, so the writer emits every character outside printable ASCII — and `&`,
`<`, `>` — as a numeric reference. The element's bytes are therefore pure ASCII and
the title survives the single-byte declaration intact: a page titled 日本語 shows as
日本語 in the browser tab and to any conforming parser. Writers that emit the title
raw MUST NOT do so in universal mode, where the same bytes decode as mojibake.

## 5. Cross-cutting mechanics

Section 3 named the regions and §4 read them one reader at a time. What remains are
the rules that span readers: how a payload is hidden, how much room is left at the
end of the file, which numbers are offsets into what, what each checksum covers, how
the character round trip is inverted, what a password protects, and what changes when
the archive is large enough to need zip64.

### 5.1 Wrapper-tag selection

Binary payloads inside the HTML face are hidden by a wrapper tag pair. What the format
requires of a wrapper is that the HTML parser not treat its content as markup, so the
payload survives parsing as text, and that the payload not contain the construct's
terminator. Any construct with those properties works; the reference writer picks from
this ladder, in order:

| Order | Wrapper | Parser treatment of the content | Terminated by |
|---|---|---|---|
| 1 | `<!--` … `-->` | comment | `-->`, or the recovery form `--!>` |
| 2 | `<script type=sfz-data>` | script data, not executed (the type is not a JavaScript MIME type) | `</script` followed by whitespace, `/` or `>` |
| 3 | `<style type=sfz-data>` | raw text, no style sheet built (the type is not a CSS MIME type) | `</style` + delimiter |
| 4 | `<noframes>` | raw text | `</noframes` + delimiter |
| 5 | `<noembed>` | raw text | `</noembed` + delimiter |
| 6 | `<iframe>` | raw text | `</iframe` + delimiter |
| 7 | `<xmp>` | raw text | `</xmp` + delimiter |
| 8 | `<plaintext>` | everything to end of file | nothing — the element cannot be closed |

The terminators are written lower case above, but HTML matches end tag names ASCII
case-insensitively: `</XMP>` and `</Script ` close their elements just as `</xmp>` and
`</script>` do. A writer's test MUST be case-insensitive, on the start patterns as well
as the end ones. A stored, uncompressed resource is the realistic source of an
upper-case one.

Every rung hides its content unconditionally. `<noscript>` has the right terminator
and was a rung until core 1.5.108, but it is the one construct whose content is raw
text only while scripting is enabled and markup when it is not, so on a page opened
without scripting the archive bytes would reach the tree builder as tags. The rungs
below it hide the same payloads at no extra cost, so it was removed rather than
demoted.

The order under the comment is not arbitrary. Every rung hides its content from an HTML
parser, but text extractors differ, and the ZIP region is large enough that the
difference is a user-visible one. Measured on macOS: Spotlight's HTML importer indexes
the content of `<noframes>`, `<noembed>`, `<iframe>`, `<xmp>` and `<plaintext>`, and
`textutil` reads the last two of those, `<xmp>` and `<plaintext>`, while the comment
and the `script` and `style` rungs are dropped by both. Those two therefore sit directly under the comment,
so that an escalating writer keeps the archive out of the reader's local search index
for as long as the payload allows. Both are inert at those types: the script is not
executed and no style sheet is built.

That ordering is the one place the format optimizes against measured third-party
behavior rather than against a rule, and unlike the tolerances of §1.1 nothing depends
on the measurement holding. An extractor that starts reading `<script type=sfz-data>`,
or stops reading `<xmp>`, changes only which archives end up in a local search index;
every rung still hides its content from the HTML parser, and a writer whose ladder is
ordered differently produces files that are just as correct. Treat the order as a
default worth keeping, not as a property of the format.

Two things about the ladder *are* required, and they are worth separating from the
order. A writer MUST apply the selection test below to every rung it considers, and
MUST keep `<plaintext>` available as the rung of last resort — §6.2's termination
argument needs one rung no payload can defeat, and that is the only structural role the
ladder's shape plays. Which of the seven closable rungs a writer prefers, and in what
sequence, is its own choice.

The wrapper of the ZIP region also carries the identifier the extractor addresses it
with (§4.5): an element rung takes it as an `id` attribute — `<script type=sfz-data
id=sfz-data>`, `<noframes id=sfz-data>` — and the comment rung as the first characters of
its data, `<!--sfz-data`. The wrappers hiding the PDF and PNG faces MUST NOT carry it:
those payloads are found by byte structure, and a second node bearing the identifier
would shadow the archive.

The reference writer walks the ladder from the top and takes the first rung the payload
does not defeat. The test it applies is the format's, and is the same for every payload;
what differs is how far the ladder goes:

- **The ZIP region** rejects a rung whose *end* pattern the payload contains, and also
  a rung whose *start* pattern it contains. A rung's start pattern is the tag's opening
  delimiter and name, without attributes: `<!--` for the comment, then `<script`,
  `<style`, `<noframes`, `<noembed`, `<iframe`, `<xmp` for the elements.

  `<plaintext>` is exempt from **both** tests. It has no terminator to occur and no
  tokenizer states to escape into — a `<plaintext` inside a `<plaintext>` is inert
  text like everything else — so no payload can defeat it. That exemption is what
  makes §6.2's termination argument true: the last rung always fits, whatever the
  payload contains.

  The other seven are all tested, and a writer MUST test all seven rather than the one
  that needs it. The `<script>` rung needs it
  to be correct at all, because script data has escape states no other rung has: `<!--`
  in script data enters *script data escaped*, and a `<script` after that enters *script
  data double escaped*, where `</script>` does **not** close the element. So a payload
  can hold `<!--` and then `<script`, contain no `</script` anywhere, pass the end test —
  and the wrapper then swallows its own end tag, the extra-data element and the rest of
  the document. On the other six the start test is genuine conservatism: a nested `<!--`
  is a parse error inside a comment but does not close it, and the raw-text rungs hold a
  flat run of characters with no states at all. The rule is uniform anyway, and
  deliberately so — the exemption would save one pattern match per rung on bytes already
  in memory, and would buy that with a special case an implementer has to remember
  correctly about the single rung where forgetting it destroys the document. An earlier
  draft of this section offered exactly that latitude, in the broader form "a writer MAY
  skip the start test outside universal mode", and the reference writer's PDF and PNG
  faces took it and shipped the bug (§8.5).
- **The PDF and PNG payloads** apply the same two tests, for the same reason — a face
  that took the `<script>` rung on a payload holding `<!--` and `<script` would swallow
  the rest of the document, title, bootstrap and extra-data element included — but the
  `<plaintext>` rung is excluded from their ladder: those payloads sit in the middle
  of the file, so a wrapper that can never close is not an option. When no rung fits,
  the payload is written bare, with no wrapper at all; it then reaches the parser as
  text, and the blank-page backstop of §4.1 is what keeps it invisible.

The comment rung has one restriction more than a terminator. HTML forbids comment text
that *starts* with `>` or `->`, and the tokenizer enforces it: it closes the comment
right there, spilling the payload into the parser. What starts the comment differs by
payload — the ZIP region begins with the identifier, the PDF face with a local file
header or `%PDF-` — but the PNG face begins with the CRC of the chunk carrying the
start tag, four bytes that are only settled once the tag is chosen, and one in 256 of
them is `>`. A writer using a comment there MUST compute that checksum and take the
next rung when it opens with `>` or `->`; the next rung is an element, which has no
such restriction, so the test cannot cascade. HTML also forbids comment text ending
with `<!-`, which the terminator check covers by testing that pattern anchored at the
payload's end.

Choosing the last rung has consequences that reach the rest of the file: because
`<plaintext>` cannot be closed, selecting it sets `preventAppendedData` — no *markup*
may follow the ZIP region, which forces the relocated placement of the extra-data
element (§5.2) and drops the closing `</body></html>`.

That constraint is about markup, not about the last byte of the file, and the PNG face
composes with this rung for exactly that reason: the `tEXt` chunk's checksum and the
`IEND` chunk still follow the region, as the PNG face requires, and `<plaintext>` reads
them as the text they are. Verified on a build forced onto this rung with a screenshot
embedded: the file ends `49 45 4e 44 ae 42 60 82`, decodes as a PNG, and its archive
extracts from the parsed page. So §6.2's termination argument holds for every variant —
the last rung fits whatever the payload and whatever the faces.

The check MUST be made against the payload's final bytes, for every payload the
writer hides and in every variant that hides one. Every rejection restarts the build
(§6): the wrapper choice changes the bytes preceding the archive, so the archive must
be rewritten at its new position.

### 5.2 The appended-data budget

Everything the writer emits after the EOCD record MUST fit in 65535 bytes — the
maximum length a ZIP archive comment may declare, and therefore the distance beyond
the record that every reader's backward scan already covers (§1.3). The appended run is:

```
wrapper close tag + extra-data element + end tags + (PNG face: 4-byte chunk CRC + 12-byte IEND)
```

and the writer compares its total against 65535 before committing to it. The EOCD
record's own 22 bytes sit inside the window too, which is where the 65557-byte figure
of §1.3 comes from.

Only the extra-data element can outgrow the budget: it carries one 2-bit code per
newline sequence in the ZIP region — CR LF counts once, for two bytes (§5.5) — so it
grows with the archive. Newline bytes
occur at their natural density in compressed and STOREd binary data — about two in
every 256 bytes — and the codes are compressed and base64-encoded, which measures at
one byte of element per 650 bytes of archive at scale (§8). The budget is therefore
exhausted at an archive of roughly 40 MB, which is why the relocated placement is rare
in practice. That ratio is the large-archive limit and must not be used to size a
particular file: deflate's overhead is a fixed cost spread over a growing payload, so
small archives are far less efficient. Measured on exact byte counts, a 6099-byte region
needs 69 bytes of element — a ratio of 88 — and a 74057-byte region needs 189, a ratio
of 392; §8.3's series then runs 475, 609, 650 and 646 as the archive grows from 86 KB to
4.2 MB, so the ratio approaches the headline figure from below and levels off rather
than climbing past it. A writer sizes its reservation from the payload it actually
produced (§6.2), never from this figure. When the payload does not fit, or when
`preventAppendedData` is set, the writer switches to the **relocated placement**: the
element moves in front of the wrapper start tag, ahead of the archive (§3.1). Room
for it MUST be reserved before the ZIP region is written, because inserting bytes
ahead of the archive would shift every offset the ZIP writer has already committed;
the reservation is padded with spaces and the real payload is written into it once
its final size is known (§6).

### 5.3 Offset bookkeeping

Three coordinate systems coexist in one file, and the format's job is to keep each
self-consistent:

- **ZIP offsets are absolute file positions.** The writer is told the size of
  everything already emitted before the first local header, so the central directory
  offset in the EOCD and every local-header offset in the central directory are true
  file positions (§4.2), so a reader of the *whole file* never needs prepended-data
  compensation — the repair by which a reader recomputes offsets that disagree with
  the file size. A reader of the recovered ZIP region alone does need it (§4.5).
- **PDF offsets are header-relative.** The document's own cross-reference offsets are
  interpreted from the `%PDF-` header, so embedding it needs no rewriting; the writer
  only MUST keep the header inside the scan window (§4.3).
- **PNG has no offsets, only lengths.** Each chunk declares its data length. The
  second `tEXt` chunk's length covers the whole archive and the appended data, so it
  can only be written once the file's final size is known, and the writer patches it
  in place at the end (§6).

The injected `page.pdf` central record exploits a fourth, deliberate discrepancy. It
is written directly to the output stream, bypassing the ZIP writer's own byte
counter, at exactly the position where the central directory is about to start.
The writer's counter is therefore left *behind* the true stream position by exactly
the record's length, so the central-directory offset it stores lands on the injected
record rather than after it: the stored offset needs no correction and the record
becomes the first entry of the directory. What does need
correcting is the accounting: after the archive is closed the writer increments the
entry counts and adds the record's length to the directory size (§6).

### 5.4 Checksum inventory

Four independent integrity mechanisms cover overlapping byte ranges. All three CRC-32
variants use the same reflected polynomial (`0xEDB88320`), so one table serves them
all, but they cover different ranges and live in different structures:

| Checksum | Covers | Stored in |
|---|---|---|
| ZIP entry CRC-32 | one entry's *uncompressed* content | local file header and central-directory record of that entry, including the hand-built `page.pdf` records. Zero for AES-encrypted entries, whose integrity comes from their authentication code instead |
| PNG chunk CRC-32 | one chunk's type and data bytes | the 4 bytes following each chunk's data. For `tEXt "ZIP"` this spans the whole ZIP region and the appended data |
| Universal payload CRC-32 | the recovered range as the extractor re-encodes it — the ZIP region without its comment-length field (§1.3) | the recovery payload, with the range's length and newline count (§4.5) |
| AES authentication code | one encrypted entry's stored bytes | that entry's data, when a password is set |

The PDF face contributes none: PDF has no whole-file checksum, which is what lets the
document sit inside a larger file unchanged.

Two of these can only be computed when the file is otherwise final — the
`tEXt "ZIP"` chunk CRC and the universal payload — which is what fixes the last steps
of the writer's order (§6).

### 5.5 The character round trip

Universal mode recovers the ZIP region from characters rather than bytes (§2.1). The
inverse mapping the extractor applies is, for the declared charset:

1. **A code point equal to a byte value that decodes to itself → that byte.** Under
   windows-1252 this covers 229 of the 256 values.
2. **Every other code point → a fixed reverse table.** The table is the inverse of the
   encoding's index in the WHATWG standard, restricted to the byte values it does not
   map to themselves: 27 entries for windows-1252 — the printable characters it places
   in the 0x80–0x9F range (typographic quotes, dashes, the euro sign and so on). That
   count is this rule's table alone; an implementation that folds rule 3 into the same
   lookup, as the reference extractor does, has 28.
   Deriving this table is mechanical, so a reader supports any qualifying charset the
   same way — but it MUST be derived from the WHATWG index and not from the platform's
   codec of the same name, which is usually not the same mapping. The WHATWG index
   assigns every byte a code point; most platform codecs leave five positions of
   windows-1252 undefined:

   | Byte | 0x81 | 0x8D | 0x8F | 0x90 | 0x9D |
   |---|---|---|---|---|---|
   | WHATWG | U+0081 | U+008D | U+008F | U+0090 | U+009D |
   | Python `cp1252`, Java `windows-1252` | undefined | undefined | undefined | undefined | undefined |

   Those five bytes occur in ordinary compressed data, so this is not a corner case: a
   strict platform decode raises on essentially every archive, and the obvious
   workaround is worse than the error, because a decoder configured to replace what it
   cannot map emits U+FFFD, which rule 3 below turns into NUL — silently corrupting one
   byte per occurrence. Measured over ten specimen archives, 42 to 1468 bytes per file
   would be lost this way. The payload checksum catches it; the debugging session it
   costs is what this paragraph exists to prevent.
3. **U+FFFD → 0x00.** No byte decodes to U+FFFD under a qualifying encoding (§2.1), so
   the replacement character can only have come from a NUL byte. This holds because
   the payload is inside a wrapper: in every tokenizer state the ladder of §5.1
   produces — comment, raw text, script data, plaintext — the parser replaces NUL with
   U+FFFD.
4. **Newlines from the payload.** The parser normalizes CR and CR LF to LF, so the
   original byte sequence is unrecoverable from the text alone; each newline consumes
   the next 2-bit code (0 = LF, 1 = CR, 2 = CR LF).

The payload itself is a sequence of little-endian 32-bit words — checksum, recovered
range length, newline count, then the codes packed 16 per word, least-significant pair
first — raw-deflated and base64-encoded with the standard alphabet and padding.

### 5.6 Password scope

A password encrypts the *contents* of ZIP entries with AES, and nothing else. Four
consequences follow, and a reader is entitled to none of the protections it might
assume:

- **`page.pdf` is never encrypted** and never compressed: its bytes double as the PDF
  face, which a viewer reads directly from the entry's data region (§4.3).
- **The PNG and PDF faces stay in the clear.** They render the page, and a viewer
  reads their bytes directly (§4.3, §4.4), so they cannot be encrypted without
  destroying the face. A password on an archive that also has one of them protects the
  archived resources, not the page's visible content.
- **Entry metadata is never encrypted.** Names, uncompressed sizes and dates remain
  readable in the central directory, so the resource list of an encrypted archive is
  public. This is standard ZIP behavior, not a property of this format, and §7
  restates it for implementers.
- **What the writer withholds instead.** Three things are not forced into the clear by
  the format and so are simply not written when a password is set: the entry comments,
  which would otherwise publish every resource's source URL (§4.2); the `<title>`
  element, whose value `manifest.json` carries as an encrypted entry; and the optional
  text body, which repeats the whole page text outside the archive (§4.6). Unlike the
  PNG and PDF faces, none of the three is load-bearing for a reader, so a writer that
  emits them in a password-protected archive publishes what the password is meant to
  cover for no gain.

Encrypted entries are stamped AE-2, so their CRC-32 field is zero (§5.4) and
`page.pdf`, which stays unencrypted, is the only entry of a password-protected
archive whose checksum a ZIP tool can verify.

### 5.7 zip64

The archive uses the zip64 structures whenever the ordinary records cannot express
it: a central directory starting beyond 4 GiB (the prefix counts toward the offset,
§5.3), a directory 4 GiB or longer, or 65535 entries or more. The reference writer
never requests zip64 explicitly, so it appears only when reached — and, given how
large that is, effectively never in a saved page.

When it is reached, the EOCD record carries the sentinel values `0xFFFF` and
`0xFFFFFFFF` in the fields that overflowed, preceded by a zip64 end of central
directory record and its locator. The `page.pdf` record injection then applies its
accounting to the zip64 record instead — entry counts and directory size there, and
the locator's pointer moved by the record's length — while leaving each saturated
field at its sentinel. A writer MUST NOT let the injection push a 16-bit or 32-bit
field to its sentinel value without emitting the corresponding zip64 record: a count
of `0xFFFF` sends readers looking for a zip64 record that does not exist.

This combination has been verified on a forced-zip64 build (§8): `page.pdf` is listed
first by both Info-ZIP and the reference reader, the central directory offset in the
zip64 record points at the injected record, and extraction produces the same page as
the non-zip64 build.

## 6. Writer algorithm

This section specifies the reference writer's build order. It is normative in the
sense that a file produced differently but satisfying every rule above is a valid
SingleFile archive; the order matters because several values can only be computed
once later bytes exist.

Most of that difficulty is optional, and a writer should know how much of it each face
buys. The cost is not evenly spread:

| To produce | The writer needs |
|---|---|
| The ZIP face alone | Nothing from this section. Write an ordinary archive with `index.html` first and a `manifest.json`; no wrapper, no retry, no patching |
| Plus the HTML face | The prologue and bootstrap, and the wrapper ladder of §5.1 — one scan of the finished archive, and a rebuild if the rung changes |
| Plus universal mode | The recovery payload, the character round trip of §5.5, the appended-data budget of §5.2, and the retry loops of §6.2. This is where the real complexity lives, and it buys opening the file from `file:` with no cooperation |
| Plus the PDF or PNG face | The header window of §4.3 or the chunk patching of §5.3, plus a second wrapper choice for the embedded payload |

Only the third row needs the retry loops, and only the fourth needs a value that cannot
be computed until the file is otherwise complete. A writer that wants durable saved
pages and not polyglots can stop at the first row and still produce files every reader
in §8.1 accepts.

### 6.1 Build order

1. **PNG head.** With the PNG face, copy the signature and `IHDR` from the source
   screenshot unchanged. Without the HTML face but with the PDF face, emit the
   `tEXt "PDF"` chunk holding the PDF document here, so its header falls inside the
   PDF scan window (§4.3).
2. **HTML prologue.** With the HTML face, emit the doctype (omitted under the PNG
   face, which owns the start of the file), the root element start tag, any comment the
   implementation adds, the `<meta charset>` required by §2.1, the head elements — the `<title>` among them,
   unless a password is set (§5.6) — the CSS and `<body hidden>`, the wait and error messages, the optional table of contents and
   text body, and the bootstrap script. With the PNG face the head of this region,
   through `<body hidden>`, is the data of the `tEXt "PNG"` chunk and the remainder is
   emitted after the `tEXt "ZIP"` chunk header in step 12; with the PDF face the
   region is interrupted by step 3 as well.

   Whatever a writer puts in the prologue, closing every element it opens before the
   wrapper start tag is good practice but not a requirement: the extractor addresses
   the ZIP region by identifier (§4.5), so an element left open only makes the archive
   a descendant of it, which resolves the same way.
3. **Embedded PDF.** With the PDF face and the HTML face, the prologue is *split*
   around the PDF, which MUST come early enough for `%PDF-` to start at offset 1024
   or lower (§4.3). Only what a parser needs first precedes it — the doctype, the
   root element, any leading comment and the charset declaration — and everything
   else in the head (title, link and meta elements, the stylesheet, `<body hidden>`,
   the messages, the optional table of contents and text body) follows it. Emit the
   wrapper start tag chosen for the PDF payload (§5.1), the hand-built `page.pdf`
   local file header, the PDF document, the wrapper end tag, and record the local
   header's absolute position; then resume the prologue.

   The window is reachable but not structurally guaranteed, and this is the one place
   where the format depends on the writer rather than on its own layout. The
   irreducible part of the prefix is small: the root element start tag, the charset
   declaration, the wrapper start tag and the 38-byte local file header for
   `page.pdf`, plus a minimal doctype — 100 bytes in the reference layout, and a few
   more with a longer charset label or a wrapper past the first rung (§5.1). But two
   regions ahead of the header have no length the format controls: the doctype, which
   is copied from the saved page and carries its public and system identifiers
   verbatim, and any comment the implementation chooses to write there. Real doctypes
   are small — the longest in common use, XHTML 1.1 with MathML and SVG, is about 140
   bytes — but nothing caps either region, so a writer MUST cap them itself, keeping
   everything before the local file header inside the remaining budget of roughly 924
   bytes — 879 with the PNG face, whose signature, `IHDR` and first chunk header take
   the first 45 bytes of the same window and whose variant drops the doctype in exchange — shortening, dropping or relocating that content rather than emitting a
   header outside the window. A writer that places nothing of unbounded length before
   the PDF block satisfies the rule by construction and needs no check at all.

   The reference writer does both. Its provenance comment is emitted after the PDF
   block, so the page URL it carries cannot reach the window at all, and the prefix is
   measured before the header is written: when the page's own doctype would push
   `%PDF-` past 1024, `<!DOCTYPE html>` is emitted in its place. Substituting the
   doctype changes the bootstrap document's rendering mode, which costs nothing here,
   since the extracted page is written into the document with its own doctype (§4.1);
   a writer that must keep the page doctype has to find the room elsewhere.

   Without the HTML face, the PDF is simply the first thing in the file and the
   question does not arise.
4. **Reserved extra-data.** In universal mode, when a previous pass determined that
   the payload must be relocated (§5.2), emit an empty `<sfz-extra-data>` element
   followed by enough spaces to fill the reservation. The padding sits **outside** the
   element, so the element's text stays exactly the payload.
5. **Wrapper start tag** for the ZIP region, carrying the identifier (§5.1).
6. **The archive.** Create the ZIP writer, telling it the number of bytes already
   written so that its offsets are absolute (§5.3). Add `index.html` first, then
   `manifest.json`, then the page's resources, preserving that order in the central
   directory; STORE entries whose content is already compressed and deflate the rest;
   put each resource's source URL in its entry comment; encrypt entry contents if a
   password was given.
7. **PDF central record.** With the PDF face and the HTML face, write the record for
   `page.pdf`, with the local header offset from step 3, immediately before closing
   the writer.
8. **Close and patch.** Close the archive, then correct the end of central directory
   record for the injected record: entry counts, directory size, and the zip64
   record and locator when present (§5.7).
9. **Universal payload.** In universal mode, read back the ZIP region and check it
   against the current wrapper (§5.1); on a collision, restart (§6.2). Otherwise
   compute the region's CRC-32 and its newline codes, build and compress the payload,
   and decide its placement against the budget (§5.2), restarting if the decision
   differs from the current pass.
10. **Appended run.** Unless appended data is prevented, emit the wrapper end tag,
    the extra-data element when it is appended, and `</body></html>` — the end tags
    are omitted under the PNG face, which must end with `IEND`.
11. **Fill the reservation.** In the relocated placement, write the payload into the
    space reserved in step 4; if it no longer fits, restart (§6.2).
12. **PNG tail.** With the PNG face, patch the `tEXt "ZIP"` chunk's length field, now
    that the total size is known, compute that chunk's CRC over everything from its
    type to the last byte written, and append the CRC and the `IEND` chunk.

### 6.2 The retry loops

Three conditions restart the build from step 1, and each restart carries forward what
the failed pass learned. They terminate because every restart advances a monotone
quantity:

- **Wrapper collision** (§5.1): the next pass starts at the next rung of the ladder.
  The ladder is finite and its last rung, `<plaintext>`, is exempt from both selection
  tests, so it always fits.
- **Payload does not fit the appended budget** (§5.2): the next pass reserves room
  ahead of the archive, sized at the measured payload length plus a margin.
- **Reservation too small**: relocating the payload changes the file's layout, hence
  its offsets, hence the payload — which can grow past the room reserved for it. The
  next pass reserves the new length plus the same margin. For the loop to terminate,
  each reservation MUST be strictly larger than the payload that sized it: a margin
  that can round down to zero lets two passes measure the same length and reserve the
  same room forever.

The converse also restarts: a pass that reserved room but then found the payload
would fit in the appended window discards the reservation and rebuilds without it, so
the writer does not leave dead padding in the file. This one is not monotone, and it is
the only step that could keep the build alive forever — dropping the reservation moves
the archive back, which changes the offsets, which changes the payload that made the
reservation necessary. A payload lying on the 65535-byte boundary can therefore be too
large appended and small enough relocated, and the build oscillates. A writer MUST
break that cycle: **the reservation is discarded at most once per build**, and a payload
that fits the appended window on a later pass stays in the reservation it already has.
The margin wasted is at most the reservation's own, which is what the discard was
avoiding in the first place.

Given identical inputs, modification date and archive time, the process is
deterministic: the same page produces the same bytes, retries included. The archive
time is a separate input because `manifest.json` records when the archive was made
(§7.1), so two builds of one page at two moments differ in that entry and in the entry
sizes around it. A consumer MUST NOT treat the byte identity of two archives of the
same page as meaningful.

## 7. Consuming SingleFile archives safely

This section addresses software that reads SingleFile archives it did not produce.
The ZIP face is the interoperable one, and a reader that follows the rules below
handles every variant of §2 without knowing which one it has.

### 7.1 Reading

- **Read through the central directory.** Locate the End Of Central Directory record
  by scanning backward from the end of the file, then follow its offset. A reader that
  streams local headers from offset 0 will not find an archive: the file starts with
  the HTML, PDF or PNG face (§1.2, and §8.1 measures what such readers actually do).
- **Tolerate bytes before and after the archive.** They are not corruption; they are
  the other faces. Offsets are absolute, so no compensation is needed (§5.3).
- **Accept both forms of appended data.** The bytes after the EOCD record may be raw
  or declared as the archive comment; both are valid (§4.2). A reader MUST NOT treat
  undeclared trailing bytes as a defect.
- **Do not identify the format by file name.** Extensions are conventions (§2.2). A
  SingleFile archive is identifiable from its content. Recognition and extraction are
  separate questions, and the answers differ: an `index.html` entry accompanied by a
  `manifest.json` entry in the same directory is the positive signal a reader should
  recognize the format by, while `index.html` alone is enough to *extract* from, since
  `manifest.json` is informative and MUST NOT be required (below). Neither test
  distinguishes this format from an arbitrary ZIP file laid out the same way, and none
  is offered: nothing in the format depends on recognizing it, and a reader that treats
  any archive containing a page entry as a saved page loses nothing.
- **Resolve the page entry in this order.** The archive's internal layout is
  implementation-defined, and two properties of the reference layout matter to a
  reader. Every entry MAY sit under a single root directory, which the reference
  writer names from a timestamp when asked to create one; the page is then
  `<root>/index.html`. And a page's nested frames are stored as complete pages of
  their own under `frames/<n>/`, recursively, so an archive normally holds several
  `index.html` entries and only the outermost one is the page. Since neither property
  is guaranteed, a reader resolves the entry point in three steps, stopping at the
  first that succeeds:

  1. `manifest.json`'s `indexFilename`, resolved against the root directory, when the
     entry exists. This is the only authoritative answer, and it is why a writer that
     departs from the reference layout SHOULD emit the manifest even though a reader
     MUST NOT require it.
  2. Otherwise the `index.html` entry at the smallest directory depth.
  3. If several `index.html` entries tie at that depth, the archive does not name its
     page: a reader MUST NOT pick one arbitrarily. Report the ambiguity, or treat the
     file as a plain ZIP archive.

  The reference writer never produces a tie — one root directory at most, and every
  other page nested under `frames/<n>/` — so step 3 exists for archives from other
  writers.
- **Treat `manifest.json` as informative.** The reference writer records the original
  URL as `originalUrl`, the title as `title`, the save time as `archiveTime` (an ISO
  8601 string), the entry name of the page as `indexFilename` and the resource-to-URL
  map as `resources`. The page displays without any of it, a reader MUST NOT require
  the entry or any field of it, and `indexFilename` names the page relative to the root
  directory rather than as a full entry name. The set of fields is not closed: a reader
  MUST ignore what it does not recognize.
- **Expect a `page.pdf` entry whose data lies outside the archive proper** (§4.2). It
  is an ordinary STORE entry at an ordinary offset, so nothing special is needed to
  read it — but a reader that assumes every entry sits between the first local header
  and the central directory will reject or mislocate it.

### 7.2 Modifying

Do not rewrite the file in place. Adding, removing or recompressing entries moves the
ZIP region and invalidates the other faces: the PNG chunk length and CRC that span the
archive, the recovery payload's checksum, and the wrapper choice that depends on the
archive's exact bytes (§1.2). Most ZIP rewriters also drop the prepended and appended
regions, which discards every face but ZIP.

A tool that wants to produce a modified archive MUST rebuild it through the writer
rules of §6. A tool that only wants the page content SHOULD extract rather than
rewrite.

The loss is silent, which makes automated handling the real hazard: a deduplicating
store, a backup system that recompresses, a mail or chat service that repacks
attachments, or any pipeline that round-trips the file through a ZIP library will
return an archive whose entries are all intact and whose other faces are gone, with no
error at any step. Nothing in the file records that this happened. Software that stores
these archives SHOULD treat them as opaque bytes, and a preservation workflow that
cannot guarantee that SHOULD keep a checksum of the original alongside it.

### 7.3 Security considerations

- **Entry names are untrusted.** They derive from a captured page's resource URLs. A
  reader MUST sanitize them before writing to a filesystem: reject absolute paths and
  `..` segments, and be aware that names may be long, may collide after case folding,
  and may contain characters the local filesystem rejects.
- **Declared sizes are untrusted.** Do not pre-allocate from the declared uncompressed
  size, and enforce a limit on the expansion ratio; the archive can be crafted like
  any other ZIP file.
- **The archived page is untrusted web content**, and the HTML face contains a script.
  Software that displays either MUST do so in a sandboxed context, and MUST NOT run
  the bootstrap in a privileged one. The format's own display path replaces the
  document with the extracted page, which is not an isolation boundary by itself.
- **A password protects entry contents only** (§5.6). Entry names, sizes, dates and
  source URLs stay readable, and the PNG, PDF and text-body faces render the page
  regardless. Software MUST NOT present a password-protected archive as an encrypted
  document.
- **Sniffing disagrees with itself on these files.** `file(1)` reports HTML, PNG, PDF
  or "data" depending on the variant (§8.1), so a server that guesses the media type
  from content may serve a saved page as an image. Software that serves SingleFile
  archives SHOULD set the media type explicitly — `text/html` for the self-extracting
  variants, `application/zip` otherwise.

### 7.4 What to reject and what to tolerate

A reader of a polyglot file meets conditions that look like corruption but are not,
and conditions that look harmless but mean the extracted page would be wrong. The
distinction that matters is whether the condition affects the bytes the page is built
from:

| Condition | Reader behavior |
|---|---|
| A recovery payload field disagrees with the reconstruction — length, newline count or checksum | **MUST** fail (§4.5). The reconstruction is wrong and nothing built from it can be trusted |
| An entry's CRC-32 or AES authentication code does not match | **SHOULD** fail for that entry, and MUST NOT present a page rebuilt from it as intact |
| `page.pdf` was reconstructed from the parsed page and its CRC-32 does not match | **MUST** discard the reconstruction (§4.5). The bytes are a guess about newlines the recovery payload does not describe, and the checksum is the only thing that tests it — unlike the row above, there is no read to have gone wrong, only an inference |
| Bytes before the first local file header, or after the EOCD record | **MUST** tolerate: they are the other faces (§7.1) |
| The appended run exceeds the 65535-byte budget (§5.2) | Not a reader's problem: if the EOCD record was found, the archive is readable. Readers MAY warn |
| A `tEXt` chunk CRC does not match, or a chunk holds bytes PNG does not permit (§4.4) | Irrelevant to extraction; a reader of the archive MAY ignore both |
| `page.pdf` is present but its data does not begin with `%PDF-` | Not an error. The entry is data like any other |
| `index.html` is present without `manifest.json` | **MUST** still extract (§7.1) |
| The recovered region (universal mode) disagrees with the same bytes read directly | The file is not well-formed, whichever side is at fault, and a reader that has both MUST NOT silently merge them or pick per entry. Prefer the direct read — it is the writer's own output, where the recovered region is a reconstruction of it — and surface the disagreement rather than displaying either as intact |

Anything the format does not constrain, a reader MUST NOT reject: entries may carry
any extra fields, timestamps, data descriptors or name-encoding flags a ZIP writer
would ordinarily emit, and none of it is specified here.

## 8. Appendices

### 8.1 Tool compatibility

Measured on macOS 26 with the specimens of §8.3 (Info-ZIP UnZip 6.00, libarchive
3.7.4, Python 3.14, OpenJDK 21, 7-Zip 25.01, poppler `pdftotext`, macOS `ditto`,
`sips` and Quick Look). Every result is predicted by two structural properties, so
the variants are grouped by them rather than listed one by one:

| Class | Bytes before the archive | Bytes after the EOCD | Variants |
|---|---|---|---|
| A | — | — | pure zip |
| B | yes | — | relocated (`preventAppendedData`), zip-pdf |
| C | yes | yes | plain, universal, ladder, password, pdf, png, png-pdf, zip-png, zip-png-pdf, zip64 |

The classes follow the bytes, not the options. `preventAppendedData` is what puts the
relocated variant in class B, but it suppresses *markup* after the archive, not the PNG
face's tail: an archive combining that option with a PNG face has bytes after the EOCD
and is class C.

| ZIP reader | A | B | C | Behavior |
|---|---|---|---|---|
| Info-ZIP `unzip`, `zipinfo` | ✔ | ✔ | ✔ | Lists and extracts every variant. AES entries are skipped — `need PK compat. v5.1 (can do v4.5)` — a limitation of the tool, not of the file; `page.pdf` still extracts because it is never encrypted |
| Python `zipfile` | ✔ | ✔ | ✔ | Lists and extracts every variant |
| 7-Zip (`7zz`) | ✔ | ✔ | ✔ | Lists and extracts every variant, AES included |
| libarchive `bsdtar`, seekable input | ✔ | ✔ | ✔ | Lists and extracts every variant |
| libarchive `bsdtar`, piped input | ✔ | ✘ | ✘ | `Unrecognized archive format` — the forward-only case of §1.2, measured |
| Java `java.util.zip` (`jar tf`) | ✔ | ✔ | ✘ | `zip END header not found` whenever bytes follow the EOCD undeclared. Declaring them as the archive comment makes the same file open, measured on every class-C variant (§4.2) |
| macOS `ditto -x -k` | ✔ | ✘ | ✘ | `Couldn't read PKZip signature` — requires a local file header at offset 0, so prepended data alone defeats it |

The cost of the declared form was measured on the same tools, and it is a display cost
rather than a compatibility one: an archive whose trailing bytes are declared as the
comment has them printed back on ordinary listings. `unzip -l` reproduces the whole run
— in universal mode that is the `-->`, the entire `<sfz-extra-data>` element and the end
tags — under the archive's own header, which is why the raw form is the default (§4.2).

The other faces were exercised on the variants that carry them, and all succeeded:
`pdftotext` extracts the page text from every PDF-face variant, including the
password-protected one (`page.pdf` is never encrypted, §5.6), and `sips` reports the
screenshot's true dimensions for every PNG-face variant. macOS Quick Look renders the
PNG face of the self-extracting PNG specimen, and on the all-four-faces specimen it
renders both faces of the same bytes: renamed to `.png` it yields the screenshot,
renamed to `.pdf` the rendered document.

The PDF header window of §4.3 was measured rather than assumed, by moving `%PDF-`
progressively later in otherwise identical archives. PDFium (build 153.0.7999.0, the
engine of every Chromium-based browser) loads the document while the header starts at
offset 1024 or less and fails with a data-format error from 1025 on — the documented
1024-byte figure, enforced exactly. poppler `pdftotext` and macOS PDFKit render the
same files with the header at 1000222 bytes, so they impose no window at all. A
writer that keeps the header inside 1024 bytes satisfies every engine tested; one
that does not still works on macOS and poppler while failing in Chrome.

`file(1)` disagrees with itself across the variants, and what it reports depends on
where the archive falls relative to the fixed buffer it sniffs, not on the variant as
such — a small self-extracting file whose archive starts within that buffer is
reported as `data` where a large one is reported as HTML. On these specimens: `HTML document text` for the plain, universal and ladder
specimens, `PNG image data` for every PNG-face variant, `PDF document` for a
PDF-first archive, `Zip archive data` for a pure archive **and for the relocated
variant**, whose first bytes are a doctype, and `data` where the HTML head carries
the embedded PDF.

Two conclusions for §1.1's customary tolerances. The EOCD backward scan and the
tolerance of undeclared trailing bytes are near-universal but not unanimous — Java is
the measured exception, and it is not a niche one, since `java.util.zip` is what
Android and most JVM tooling use. Prepended data is tolerated by every ZIP reader
measured except Apple's `ditto`.

### 8.2 Anatomy of a small archive

Offsets in `universal.sfz.html` (123077 bytes, two entries, saved from `example.com`
with the §8.3 command, against core 1.5.108).
The layout is the *universal* row of the byte map (§3).

| Offset | Bytes | Region |
|---|---|---|
| 0 | `<!DOCTYPE html>` | `html-prologue` begins |
| 16 | `<html data-sfz>` | root element start tag; the attribute is the reference implementation's own marker (§1.3) |
| 31 | `<meta charset=windows-1252>` | the charset rule, inside the first 1024 bytes (§2.1) |
| 58 | `<!--` … `-->` (ends at 200) | comment written by the implementation, not part of the format; it follows the charset declaration so it cannot push it out of the prescan window |
| 200 | `<title>` … `</title>` (ends at 229) | the page title, as numeric character references (§4.6) |
| 677 | `<style>` | the stylesheet of the blank-page backstop (§4.1) |
| 855 | `<body hidden>` | start of the blank-page backstop (§4.1) |
| 868, 913 | wait and error messages | the two visible elements |
| 1134 | `<script>` … `</script>` (ends at 121993) | `bootstrap`: ZIP reader, extractor, display, acquisition |
| 121993 | `<!--sfz-data` | wrapper start tag, opening the ZIP region and carrying its identifier (§5.1) |
| 122005 | `PK\3\4` | first local file header, `index.html` (1110 bytes, deflated to 593) — the ZIP region begins |
| 122647 | `PK\3\4` | local file header, `manifest.json` (168 bytes, deflated to 130) |
| 122829 | `PK\1\2` | central directory: `index.html`, then `manifest.json` |
| 122981 | `PK\5\6` | EOCD: 2 entries, directory size 152, directory offset 122829 — an absolute file position (§5.3) — comment length 0 |
| 123003 | `-->` | wrapper close tag; the ZIP region ends here |
| 123006 | `<sfz-extra-data>` … `</sfz-extra-data>` | recovery payload, appended placement (§5.2); 24 base64 characters for this archive |
| 123063 | `</body></html>` | end tags; end of file at 123077 |

The appended run is 74 bytes, well inside the 65535-byte budget (§5.2). The ZIP region
is the 998 bytes from 122005 to 123003; the universal extractor reproduces the first 996
of them and supplies the last two itself (§1.3).

### 8.3 Specimens

Generated with the command-line client running `single-file-core` against
`example.com`. The anatomy of §8.2 was regenerated against 1.5.108; the compatibility
results of §8.1 were measured on the 1.5.107 build of the same specimen set, which
differs only inside the prologue and so falls in the same classes — those are grouped by
whether bytes precede the archive and follow the EOCD, which no prologue change alters. `--compress-content` is what makes the output an archive;
`extract-data-from-page` defaults to true there, which is why the plain variant has
to switch it off:

| Specimen | Command |
|---|---|
| pure zip | `single-file --compress-content --self-extracting-archive=false <url> pure.zip` |
| plain | `single-file --compress-content --extract-data-from-page=false <url> plain.sfz.html` |
| universal | `single-file --compress-content <url> universal.sfz.html` |
| relocated | add `--prevent-appended-data` |
| pdf | add `--embed-pdf` |
| png | add `--embed-screenshot` |
| png-pdf | add `--embed-screenshot --embed-pdf` |
| zip-pdf, zip-png, zip-png-pdf | add `--self-extracting-archive=false` to the pdf, png and png-pdf rows |
| password | add `--password=<password>` |

These specimens are deliberately small, and a reader tested only against them is
undertested: they are all flat archives of two or three entries. None exercises a root
directory, `frames/<n>/` nesting, a second `index.html`, a `data:`-URL entry comment,
the optional text body or table of contents (§4.6), a UTF-8 BOM, zip64 (§5.7), a
payload past the 64 KB budget, or a relocated reservation with padding left in it.

Two specimens cannot be produced from a URL alone. The **ladder** specimen, which
forces the second rung of §5.1, needs a page referencing an image whose stored bytes
contain `-->`; the archive then wraps in `<script type=sfz-data>`. The **zip64** specimen requires
an archive past the thresholds of §5.7, so it is produced by calling the writer
directly with zip64 forced on the ZIP writer.

The measurements quoted elsewhere in this document come from the same harness: the
payload growth rate of §5.2 (86 KB → 181 bytes, 283 KB → 465, 1.07 MB → 1645, 4.2 MB
→ 6497, i.e. one byte of element per 650 bytes of archive) and the zip64 verification
of §5.7.

### 8.4 The charset round trip, measured

Two claims of §2.1 were verified rather than assumed.

**Which encodings qualify.** Decoding all 256 byte values through each encoding
defined by the WHATWG standard shows 20 that are injective and never produce U+FFFD:
`windows-1252` (and its `iso-8859-1` labels), `iso-8859-2`, `-4`, `-5`, `-10`, `-13`,
`-14`, `-15`, `-16`, `koi8-r`, `koi8-u`, `macintosh`, `windows-1250`, `-1251`,
`-1254`, `-1256`, `-1258`, `x-mac-cyrillic`, `ibm866` and `x-user-defined`. The last of
those qualifies on the criterion but is a poor choice in practice: it maps 0x80–0xFF
into the Private Use Area, U+F780–U+F7FF, so the payload's characters have no meaning
outside this round trip and any tool that touches the text sees private-use code points.
The remaining single-byte encodings have undefined positions in their index —
`iso-8859-3`, `-6`, `-7`, `-8`, `windows-874`, `-1253`, `-1255`, `-1257` — and the
multi-byte ones (`utf-8`, `utf-16le`, `utf-16be`, `gbk`, `gb18030`, `big5`, `euc-jp`,
`shift_jis`, `euc-kr`, `iso-2022-jp`) decode a lone byte sequence to U+FFFD or to fewer
than 256 characters.
The reverse table each one needs ranges from 8 entries (`iso-8859-15`) to 128
(`koi8-r`, `koi8-u` and `ibm866`); windows-1252 needs 27.

**That the round trip is charset-independent.** The mechanism of §5.5 — parse, then
re-encode with the reverse table, restoring newlines from the 2-bit codes and NUL from
U+FFFD — was run in a browser on a 4364-byte payload containing every byte value, 49
newlines covering LF, CR, CR LF and a trailing CR, and NUL bytes. It recovers the
payload byte for byte under `windows-1252`, `iso-8859-15`, `iso-8859-5`, `koi8-r`,
`ibm866` and `macintosh`, and fails under `utf-8`, as the injectivity requirement
predicts.

### 8.5 Format history

| When | Change |
|---|---|
| before 2023 | The format originates in SingleFileZ, a separate extension pairing a self-extracting HTML page with a ZIP archive. The `data-sfz` and `<sfz-extra-data>` identifiers date from there (§1.3) |
| October 2023 | SingleFileZ's core is merged into single-file-core; universal mode (`extractDataFromPage`) and the wrapper ladder arrive with it |
| November 2023 | `preventAppendedData`: archives that end exactly at the EOCD record, with the payload relocated ahead of the archive |
| January 2024 | The PNG face: a screenshot's chunks wrap the archive, the HTML riding in a `tEXt` chunk |
| September 2024 | The PDF face: an embedded PDF document placed so its header falls in the scan window, first with the HTML face, then for archives without it |
| August 2026 | The embedded PDF becomes the `page.pdf` ZIP entry, listed first, so ZIP tools see the document as an ordinary entry (core 1.5.93) |
| August 2026 | Core 1.5.107: page-text extraction skips `page.pdf` (§4.5), the appended-data budget accounts for the PNG tail (§5.2), and archives served with an HTTP error status fall back to page-text extraction (§4.1) |
| August 2026 | Core 1.5.108: `<noscript>` leaves the wrapper ladder (§5.1), the title is emitted as character references instead of being dropped in universal mode (§4.6), the doctype is capped when it would push `%PDF-` out of the scan window (§6.1), and password-protected archives withhold the entry comments, the title and the text body (§5.6) |
| August 2026 | Core 1.5.108: the writer enforces the two remaining HTML restrictions on comment text — a payload may not end with `<!-`, and the PNG face may not open its comment with the `>` or `->` its chunk checksum lands on once in 256 archives, which closed the wrapper and left the image data to the parser (§5.1) |
| August 2026 | Core 1.5.108: the wrapper ladder escalates to `<script type=sfz-data>` and `<style type=sfz-data>` before the raw-text rungs, the only two whose content local text extractors drop the way they drop a comment (§5.1) |
| August 2026 | Core 1.5.108: the ZIP region carries the identifier `sfz-data` and the extractor addresses it with that instead of deducing it from its position beside `<sfz-extra-data>` (§4.5). This fixes universal extraction on the `<style type=sfz-data>` rung, where the reference extractor's own relocation of `style` elements into the head moved the region out from under the positional rule |
| August 2026 | Core 1.5.108: the recovery payload stops two bytes short of the End Of Central Directory record, excluding its comment-length field (§1.3), which lets universal-mode archives declare their appended data as the archive comment — a writer option, for `java.util.zip` and the readers that reject undeclared trailing bytes (§4.2) |
| August 2026 | Core 1.5.108: the PDF and PNG faces test a wrapper rung's start pattern as well as its end pattern, closing the same script-data escape hole the ZIP region was already guarded against — a face payload holding `<!--` and then `<script` took the `<script type=sfz-data>` rung and swallowed the rest of the document (§5.1) |
| August 2026 | Document revision from an independent implementation: a reader built from this specification alone, with no access to the reference code, read every specimen correctly and found thirteen defects in it. The load-bearing corrections are in §5.1 (the start-pattern test is necessary, not conservative — script data's escape states let a payload defeat the end-tag test), §5.5 (the WHATWG index is not the platform codec of the same name), §4.5 (the offset shift is derivable from the recovered region; `page.pdf` is reachable, just not by offset) and §1.3 (the appended data may be a declared archive comment, as §4.2 has said since 1.5.108). A second pass by the same implementation, against the revision, caught a regression the revision itself introduced: giving `<plaintext>` a start pattern would have let 55 bytes of ASCII defeat all eight rungs, which the reference writer never did and which §6.2's termination argument forbids (§5.1). Two further reviews against the reference code closed the remaining gaps: a normative order for resolving the page entry, since "the shallowest `index.html`" had no tiebreak (§7.1); a definition separating the logical archive from the ZIP region, which `page.pdf` is the one entry to fall outside (§1.3); the layer convention now stated at the head of the document; and the limits of the reconstructed-`page.pdf` CRC check (§4.5). A third review found the one remaining live defect: §6.2's retry set had a non-monotone step, since discarding a reservation moves the archive and so changes the payload that required it, and a payload on the 65535-byte boundary could oscillate between the two placements forever. Core 1.5.108 now discards a reservation at most once per build. The same review's assessment of the format added three statements the document had left implicit: that the faces are not equally durable and the ZIP one is the only storage claim (§1.1), what each face actually costs a writer (§6), and that a pipeline which repacks the file destroys the other faces silently (§7.2) |
