import { createContext, useContext, useState, useRef, ReactNode } from "react";

interface HeaderContextValue {
  startDate: string;
  endDate: string;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  onExport: ((type: "pdf" | "excel") => void) | null;
  setOnExport: (fn: ((type: "pdf" | "excel") => void) | null) => void;
}

const HeaderContext = createContext<HeaderContextValue>({
  startDate: "",
  endDate: "",
  setStartDate: () => {},
  setEndDate: () => {},
  onExport: null,
  setOnExport: () => {},
});

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const exportRef = useRef<((type: "pdf" | "excel") => void) | null>(null);
  const [, forceUpdate] = useState(0);

  const setOnExport = (fn: ((type: "pdf" | "excel") => void) | null) => {
    exportRef.current = fn;
    forceUpdate((n) => n + 1);
  };

  return (
    <HeaderContext.Provider value={{
      startDate, endDate, setStartDate, setEndDate,
      onExport: exportRef.current,
      setOnExport,
    }}>
      {children}
    </HeaderContext.Provider>
  );
}

export function useHeaderContext() {
  return useContext(HeaderContext);
}
