"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface WalletContextType {
  balance: number;
  addToBalance: (amount: number) => void;
  subtractFromBalance: (amount: number) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider = ({ children }: { children: React.ReactNode }) => {
  const [balance, setBalance] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const storedBalance = localStorage.getItem("flopper_balance");
    if (storedBalance) {
      setBalance(parseFloat(storedBalance));
    } else {
      setBalance(1000.0);
      localStorage.setItem("flopper_balance", "1000.00");
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("flopper_balance", balance.toFixed(2));
    }
  }, [balance, isLoaded]);

  const addToBalance = (amount: number) => {
    setBalance((prev) => prev + amount);
  };

  const subtractFromBalance = (amount: number) => {
    setBalance((prev) => Math.max(0, prev - amount));
  };

  if (!isLoaded) {
    return null;
  }

  return (
    <WalletContext.Provider value={{ balance, addToBalance, subtractFromBalance }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
};
