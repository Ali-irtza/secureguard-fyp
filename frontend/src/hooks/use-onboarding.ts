import { useState, useEffect } from "react";

const ONBOARDING_KEY = "secureguard_onboarding_completed";

export const useOnboarding = () => {
  const [isCompleted, setIsCompleted] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const completed = localStorage.getItem(ONBOARDING_KEY) === "true";
    setIsCompleted(completed);
    setIsLoading(false);
  }, []);

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setIsCompleted(true);
  };

  const resetOnboarding = () => {
    localStorage.removeItem(ONBOARDING_KEY);
    setIsCompleted(false);
  };

  return {
    isCompleted,
    isLoading,
    completeOnboarding,
    resetOnboarding,
  };
};
