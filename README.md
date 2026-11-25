# single-file-core

The engine of [SingleFile](https://github.com/gildas-lormeau/SingleFile): it turns a web page into
a single HTML file, or into a [self-extracting ZIP file](doc/singlefile-archive.md), with its
stylesheets, images, fonts and frames. The SingleFile extensions and
[single-file-cli](https://github.com/gildas-lormeau/single-file-cli) are built on it.

## Using it as a library

`single-file.js` exports `getPageData()`, which saves the document it runs in:

```js
import { getPageData } from "single-file-core/single-file.js";

const pageData = await getPageData({ removeFrames: true, blockScripts: true });
// pageData.content is the HTML of the saved page
```

Which scripts to run, in which frames and when, depends on where the code runs. The wiki pages
below describe each case:

- [in a page, by injecting the scripts](https://github.com/gildas-lormeau/SingleFile/wiki/How-to-integrate-SingleFile-library-code-in-%22custom%22-environments%3F),
  with the `fetch` function to supply when the resources of the page cannot be fetched from the
  page itself;
- [with Playwright](https://github.com/gildas-lormeau/SingleFile/wiki/Executing-within-Playwright-(headless-browser))
  or [with Puppeteer](https://github.com/gildas-lormeau/SingleFile/wiki/Executing-within-Puppeteer-(headless-browser));
- in an extension, [Manifest V3](https://github.com/gildas-lormeau/SingleFile-MV3/wiki/How-to-integrate-the-API-of-SingleFile-MV3-into-an-extension)
  or [Manifest V2](https://github.com/gildas-lormeau/SingleFile/wiki/How-to-integrate-the-API-of-SingleFile-into-an-extension).

## Frames

The content of a frame is read in one of two ways:

- a same-origin frame is read directly from the top frame;
- any other frame (cross-origin, or sandboxed) has to send its content itself. This is the job of
  `single-file-frames.js`, which must be running in every frame of the page before `getPageData()`
  is called.

When `getPageData()` runs in the top frame only, without `single-file-frames.js` in the frames,
no frame answers. The content of such a frame is not saved, unless the frame has a `srcdoc`
attribute, in which case it is saved from that markup. The save also waits 2 seconds for the
answers, once per save, whatever the number of frames. A page without such a frame does not wait.

If you do not need the frames, pass `removeFrames: true`: no frame is collected and there is no
wait. Note that it removes the same-origin frames as well.

## Tests

```sh
npm test
```

The suites are described in [test/capture/README.md](test/capture/README.md) and
[test/sfz-harness/README.md](test/sfz-harness/README.md). [REVIEW.md](REVIEW.md) lists what is
checked before a change is committed.

## License

AGPL-3.0-or-later
