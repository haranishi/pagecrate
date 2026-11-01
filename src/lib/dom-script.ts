// Keep browser-realm code free of helpers injected by server-side TypeScript bundlers.
export const DOM_SCRIPT = String.raw`(() => {
  const items = [];
  const add = (url, source, kind, width, height) => {
    if (typeof url === 'string' && url.length > 0 && url.length <= 4096 && items.length < 1000) items.push({ url, source, kind, width, height });
  };
  for (const image of document.images) {
    add(image.currentSrc || image.src, 'img', 'image', image.naturalWidth || undefined, image.naturalHeight || undefined);
    for (const key of ['src', 'data-src', 'data-original', 'data-lazy-src']) add(image.getAttribute(key), key, 'image');
  }
  for (const node of document.querySelectorAll('img[srcset], source[srcset], img[data-srcset]')) {
    let rest = (node.getAttribute('srcset') || node.getAttribute('data-srcset') || '').slice(0, 32768);
    while (rest.trim()) {
      rest = rest.replace(/^[\s,]+/, '');
      const token = /^\S+/.exec(rest)?.[0];
      if (!token) break;
      let url = token;
      rest = rest.slice(token.length);
      let descriptors = '';
      if (url.endsWith(',')) url = url.replace(/,+$/, '');
      else {
        const separator = rest.indexOf(',');
        descriptors = separator < 0 ? rest : rest.slice(0, separator);
        rest = separator < 0 ? '' : rest.slice(separator + 1);
      }
      const width = /(?:^|\s)(\d+)w(?:\s|$)/.exec(descriptors);
      add(url, 'srcset', 'image', width ? Number(width[1]) : undefined);
    }
  }
  for (const video of document.querySelectorAll('video')) {
    add(video.currentSrc || video.getAttribute('src'), 'video', 'video', video.videoWidth || undefined, video.videoHeight || undefined);
    add(video.poster, 'poster', 'image');
    for (const source of video.querySelectorAll('source')) add(source.src, 'video/source', 'video');
  }
  for (const element of [...document.querySelectorAll('body *')].slice(0, 2500)) {
    for (const pseudo of [null, '::before', '::after']) {
      for (const match of getComputedStyle(element, pseudo).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        add(match[1], pseudo ? 'CSS' + pseudo : 'CSS背景', 'image');
      }
    }
  }
  return { title: document.title.slice(0, 180), base: document.baseURI.slice(0, 4096), items };
})()`;
