import { createContext, useContext, useState, useRef, ReactNode } from "react";

interface HeaderContextValue {
  startDate: string;
  endDate: string;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  onExport: (() => void) | null;
  setOnExport: (fn: (() => void) | null) => void;
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
  const exportRef = useRef<(() => void) | null>(null);
  const [, forceUpdate] = useState(0);

  const setOnExport = (fn: (() => void) | null) => {
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
