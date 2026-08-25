/** Step 1: get a photo and downscale it to the app's single image space. */

export const name = 'Photo';
export const canEnter = () => true;

const MAX_SIDE = 2000;

/** Decode a file and downscale so the longest side is MAX_SIDE.
 *  @returns {Promise<{canvas:HTMLCanvasElement, imageData:ImageData, width:number, height:number}>} */
export async function loadImageFile(file, maxSide = MAX_SIDE) {
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    try {
      source = await createImageBitmap(file);
    } catch {
      source = await loadViaElement(file);
    }
  }
  const decodedWidth = source.width;
  const decodedHeight = source.height;
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  source.close?.();
  return { canvas, imageData: ctx.getImageData(0, 0, width, height), width, height, decodedWidth, decodedHeight };
}

function loadViaElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that file')); };
    img.src = url;
  });
}

export function enter(app) {
  const panel = app.setPanel(`
    <h2>1 · Photo</h2>
    <ul>
      <li>Lay the hide flat on the floor, no folds.</li>
      <li>Put an A4 sheet beside the hide, flat on the same floor.</li>
      <li>Shoot straight down; keep the A4 near the hide and frame centre.</li>
    </ul>
    <div class="row">
      <button class="btn primary wide" id="take">Take photo</button>
      <button class="btn wide" id="pick">Choose photo</button>
    </div>
    <p class="status" id="status"></p>
    <input type="file" id="camera" accept="image/*" capture="environment">
    <input type="file" id="library" accept="image/*">
  `);

  const status = panel.querySelector('#status');
  const camera = panel.querySelector('#camera');
  const library = panel.querySelector('#library');
  panel.querySelector('#take').onclick = () => camera.click();
  panel.querySelector('#pick').onclick = () => library.click();

  const handle = async (input) => {
    const file = input.files?.[0];
    if (!file) return;
    status.className = 'status';
    status.textContent = 'Reading photo…';
    try {
      const image = await loadImageFile(file);
      status.textContent = `${image.width} × ${image.height} px`;
      app.setImage(image);
      app.goTo(2);
    } catch (err) {
      status.className = 'status bad';
      status.textContent = String(err.message || err);
    } finally {
      input.value = '';
    }
  };
  camera.onchange = () => handle(camera);
  library.onchange = () => handle(library);

  if (app.state.image) {
    status.textContent = `Current photo: ${app.state.image.width} × ${app.state.image.height} px. A new photo clears the current measurement.`;
  }
}
