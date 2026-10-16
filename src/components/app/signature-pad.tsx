"use client";

import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

export type SignaturePadHandle = {
  isEmpty: () => boolean;
  toDataUrl: () => string;
  clear: () => void;
};

export const SignaturePad = forwardRef<SignaturePadHandle, { label: string; clearLabel?: string }>(
  function SignaturePad({ label, clearLabel }, ref) {
    const sigRef = useRef<SignatureCanvas>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    // Le canvas a une taille intrinsèque (300x150) : étiré en CSS, le trait serait décalé du doigt.
    // On aligne donc la résolution du canvas sur sa taille affichée (x densité), et on rejoue le
    // tracé existant si la largeur change (rotation du téléphone, clavier...).
    useEffect(() => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      let lastWidth = 0;
      function fit() {
        const canvas = sigRef.current?.getCanvas();
        if (!canvas || !wrap) return;
        const width = wrap.clientWidth;
        const height = canvas.clientHeight;
        if (!width || !height || width === lastWidth) return;
        lastWidth = width;
        const data = sigRef.current?.toData() ?? [];
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        canvas.getContext("2d")?.scale(ratio, ratio);
        sigRef.current?.clear();
        if (data.length > 0) sigRef.current?.fromData(data);
      }
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(wrap);
      return () => ro.disconnect();
    }, []);

    useImperativeHandle(ref, () => ({
      isEmpty: () => sigRef.current?.isEmpty() ?? true,
      toDataUrl: () => sigRef.current?.getTrimmedCanvas().toDataURL("image/png") ?? "",
      clear: () => sigRef.current?.clear(),
    }));

    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="min-w-0 break-words text-sm font-medium">{label}</p>
          <Button type="button" variant="ghost" size="sm" className="h-10 md:h-7" onClick={() => sigRef.current?.clear()}>
            <Eraser className="h-4 w-4" />
            {clearLabel ?? "Effacer"}
          </Button>
        </div>
        <div ref={wrapRef} className="overflow-hidden rounded-md border bg-white">
          <SignatureCanvas
            ref={sigRef}
            penColor="black"
            canvasProps={{ className: "block w-full h-48 touch-none md:h-40" }}
          />
        </div>
      </div>
    );
  }
);
