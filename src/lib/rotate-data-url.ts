// Rotation manuelle côté navigateur (canvas) d'une data URL image — utilisé partout où la
// détection automatique du sens de lecture n'est pas fiable (voir id-photo-normalize.ts) et où
// on laisse la personne qui capture la photo corriger elle-même l'orientation.
export function rotateDataUrl(dataUrl: string, degrees: 90 | -90): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas indisponible."));
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Image illisible."));
    img.src = dataUrl;
  });
}
