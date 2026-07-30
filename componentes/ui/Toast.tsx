"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

const DURACION_MS = 4000;

type AccionToast = { etiqueta: string; onAccion: () => void };
type EstadoToast = { mensaje: string; accion?: AccionToast; clave: number };

type ContextoToast = {
  mostrar: (mensaje: string, accion?: AccionToast) => void;
};

const ToastContext = createContext<ContextoToast | null>(null);

function suscribirNoop() {
  return () => {};
}

// El portal necesita document.body, que no existe durante el render en el
// servidor. useSyncExternalStore da "false" en SSR y en el primer render de
// hidratación (sin desajuste) y "true" recién después, sin depender de un
// setState dentro de un efecto.
function useEstaEnCliente(): boolean {
  return useSyncExternalStore(
    suscribirNoop,
    () => true,
    () => false
  );
}

// Global simple: un solo toast a la vez (reemplaza al anterior), 4s de
// auto-dismiss (el timer se reinicia si llega uno nuevo), acción opcional
// (p. ej. "Deshacer"). Reutilizable por fases siguientes (Hoy, etc.).
export function useToast(): ContextoToast {
  const contexto = useContext(ToastContext);
  if (!contexto) throw new Error("useToast debe usarse dentro de <ProveedorToast>");
  return contexto;
}

export function ProveedorToast({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<EstadoToast | null>(null);
  const montado = useEstaEnCliente();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const mostrar = useCallback((mensaje: string, accion?: AccionToast) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const clave = Date.now();
    setToast({ mensaje, accion, clave });
    timeoutRef.current = setTimeout(() => {
      setToast((actual) => (actual?.clave === clave ? null : actual));
    }, DURACION_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ mostrar }}>
      {children}
      {montado &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 lg:bottom-6">
            {toast && (
              <ToastPill
                key={toast.clave}
                mensaje={toast.mensaje}
                accion={toast.accion}
                onCerrar={() => setToast(null)}
              />
            )}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

function ToastPill({
  mensaje,
  accion,
  onCerrar,
}: {
  mensaje: string;
  accion?: AccionToast;
  onCerrar: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl bg-tinta px-4 py-3 text-sm text-fondo shadow-lg transition-opacity duration-200 ease-out motion-reduce:transition-none ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <span>{mensaje}</span>
      {accion && (
        <>
          <span aria-hidden="true" className="text-fondo/60">
            ·
          </span>
          <button
            type="button"
            onClick={() => {
              accion.onAccion();
              onCerrar();
            }}
            className="shrink-0 font-semibold text-fondo underline underline-offset-2"
          >
            {accion.etiqueta}
          </button>
        </>
      )}
    </div>
  );
}
