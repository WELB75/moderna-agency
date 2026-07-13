"use client";

import { useRef, forwardRef, useImperativeHandle } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

export type SignaturePadHandle = {
  isEmpty: () => boolean;
  toDataUrl: () => string;
  clear: () => void;
};

export const SignaturePad = forwardRef<SignaturePadHandle, { label: string }>(function SignaturePad(
  { label },
  ref
) {
  const sigRef = useRef<SignatureCanvas>(null);

  useImperativeHandle(ref, () => ({
    isEmpty: () => sigRef.current?.isEmpty() ?? true,
    toDataUrl: () => sigRef.current?.getTrimmedCanvas().toDataURL("image/png") ?? "",
    clear: () => sigRef.current?.clear(),
  }));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => sigRef.current?.clear()}>
          <Eraser className="h-4 w-4" />
          Effacer
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border bg-white">
        <SignatureCanvas
          ref={sigRef}
          penColor="black"
          canvasProps={{ className: "w-full h-40 touch-none" }}
        />
      </div>
    </div>
  );
});
