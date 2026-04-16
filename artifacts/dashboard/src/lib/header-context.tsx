import { createContext, useContext, useState, ReactNode } from "react";

interface HeaderContextValue {
  startDate: string;
  endDate: string;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
}

const HeaderContext = createContext<HeaderContextValue>({
  startDate: "",
  endDate: "",
  setStartDate: () => {},
  setEndDate: () => {},
});

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  return (
    <HeaderContext.Provider value={{ startDate, endDate, setStartDate, setEndDate }}>
      {children}
    </HeaderContext.Provider>
  );
}

export function useHeaderContext() {
  return useContext(HeaderContext);
}
